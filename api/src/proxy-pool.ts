import { createConnection } from "node:net";
import { ProxyAgent } from "undici";

const DEFAULT_PROXY_POOL_API = "https://proxy.scdn.io/api/get_proxy.php";
const PROXY_POOL_API = process.env.PERFORMANCE_PROXY_POOL_URL || DEFAULT_PROXY_POOL_API;
const PROXY_COUNT = 20;
const POOL_TIMEOUT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 2_500;

interface ProxyPoolResponse {
  code?: number;
  message?: string;
  data?: {
    proxies?: unknown;
    count?: number;
  };
}

export interface ProxyPoolRuntime {
  proxies: string[];
  agents: ProxyAgent[];
  cursor: number;
}

export interface ProxySelection {
  server: string;
  agent: ProxyAgent;
}

function parseProxy(value: string): { host: string; port: number } | null {
  const match = value.trim().match(/^([a-z0-9.-]+):([0-9]{1,5})$/i);
  if (!match) return null;
  const port = Number(match[2]);
  if (port < 1 || port > 65535) return null;
  return { host: match[1], port };
}

function canConnect(proxy: string): Promise<boolean> {
  const address = parseProxy(proxy);
  if (!address) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const socket = createConnection(address);
    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(available);
    };
    const timer = setTimeout(() => finish(false), CONNECT_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function fetchProxyCandidates(): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POOL_TIMEOUT_MS);
  try {
    const url = new URL(PROXY_POOL_API);
    url.searchParams.set("protocol", "https");
    url.searchParams.set("count", String(PROXY_COUNT));
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "AutoTest-Performance/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`服务返回 HTTP ${response.status}`);
    const payload = await response.json() as ProxyPoolResponse;
    if (payload.code !== 200 || !Array.isArray(payload.data?.proxies)) {
      throw new Error(payload.message || "返回格式无效");
    }
    return [...new Set(payload.data.proxies.map(String).map((item) => item.trim()).filter((item) => parseProxy(item)))];
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? `连接超时（${POOL_TIMEOUT_MS}ms）`
      : (error instanceof Error ? error.message : String(error));
    throw new Error(`IP池不可用：${message}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function getAvailableProxies(): Promise<string[]> {
  const candidates = await fetchProxyCandidates();
  if (candidates.length < 2) throw new Error(`IP池不可用：代理池仅返回 ${candidates.length} 个有效代理，至少需要 2 个`);
  const checks = await Promise.all(candidates.map(async (proxy) => ({ proxy, available: await canConnect(proxy) })));
  const available = checks.filter((item) => item.available).map((item) => item.proxy);
  if (available.length < 2) throw new Error("IP池不可用：当前可连接的代理不足 2 个，请稍后重试");
  return available;
}

export async function checkProxyPoolAvailability() {
  try {
    const proxies = await getAvailableProxies();
    return { available: true, count: proxies.length, source: DEFAULT_PROXY_POOL_API, message: `已检测到 ${proxies.length} 个可连接代理` };
  } catch (error) {
    return { available: false, count: 0, source: DEFAULT_PROXY_POOL_API, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function createProxyPoolRuntime(): Promise<ProxyPoolRuntime> {
  const proxies = await getAvailableProxies();
  return {
    proxies,
    agents: proxies.map((proxy) => new ProxyAgent({ uri: `http://${proxy}` })),
    cursor: 0,
  };
}

export function nextProxy(pool: ProxyPoolRuntime): ProxySelection {
  const index = pool.cursor++ % pool.proxies.length;
  return { server: pool.proxies[index], agent: pool.agents[index] };
}

export async function closeProxyPool(pool?: ProxyPoolRuntime) {
  if (!pool) return;
  await Promise.allSettled(pool.agents.map((agent) => agent.close()));
}

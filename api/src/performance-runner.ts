import { all, get, insert, update, exec, createId, now } from "./data/db.js";
import {
  renderTemplate,
  normalizeRepeatedVariablePath,
  valueAtPath,
  displayValue,
  compare,
  getAssertionFailures,
  type ApiAssertionDefinition,
} from "./assertion-utils.js";
import { deliverExecutionAlerts } from "./alert-delivery.js";
import { closeProxyPool, createProxyPoolRuntime, nextProxy, type ProxyPoolRuntime } from "./proxy-pool.js";
import { maskReportUrl } from "./url-utils.js";

interface PreparedRequest {
  caseId: string;
  caseName: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  assertions: PerformanceAssertion[];
  requestBytes: number;
}

interface PerformanceAssertion {
  source: "status" | "body" | "header" | "json";
  operator: "equals" | "not_equals" | "contains" | "not_contains" | "exists" | "not_exists" | "matches" | "greater_than" | "less_than";
  target: string;
  expected: string;
}

interface TransactionState {
  caseId: string;
  caseName: string;
  method: string;
  url: string;
  total: number;
  success: number;
  failure: number;
  bytesReceived: number;
  bytesSent: number;
  latency: LatencyStats; // 增量统计（标量计数器 + 环形缓冲 + 完整样本集），替代原 latencies: number[]
  statusCodes: Map<string, number>;
}

interface MetricPoint {
  timestamp: string;
  elapsedSeconds: number;
  activeUsers: number;
  requests: number;
  success: number;
  failure: number;
  rps: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  bytes: number;
  bytesSent: number;
}

interface RunState {
  runId: string;
  scenarioId: string;
  cancelled: boolean;
  abortController: AbortController; // 取消时立即 abort 全部在途请求（软标志位最长要等 timeout_ms）
  startedAt: number;
  activeUsers: number;
  total: number;
  success: number;
  failure: number;
  bytes: number;
  bytesSent: number;
  latency: LatencyStats; // 增量统计（标量计数器 + 环形缓冲 + 完整样本集），替代原 latencies: number[]
  metrics: MetricPoint[];
  errors: Map<string, number>;
  statusCodes: Map<string, number>;
  transactions: Map<string, TransactionState>;
  successRateThreshold: number;
  p95ThresholdMs: number;
  sequence: number;
  proxyNetworkFailures: number;
  lastSnapshot: { total: number; success: number; failure: number; bytes: number; bytesSent: number; latencyIndex: number };
}

const activeRuns = new Map<string, RunState>();
const startingScenarios = new Set<string>(); // 判重通过后同步占位，封住 await createProxyPoolRuntime 期间的并发重复启动窗口
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const MAX_LATENCY_SAMPLES = 2_000_000; // 完整延迟样本集上限（仅最终精确统计使用）
const STATE_RING_SAMPLES = 50_000; // 总体快照分位数估算用环形缓冲容量（最近 5 万条）
const TRANSACTION_RING_SAMPLES = 10_000; // 事务级快照分位数估算用环形缓冲容量
const MAX_ASSERTION_BODY_BYTES = 2 * 1024 * 1024;

/** 安全触发 fire-and-forget 异步任务：任何异常只记日志，避免 unhandledRejection 崩溃进程 */
function safeVoid(promise: Promise<unknown>, label: string): void {
  promise.catch((error) => {
    console.error(`[${label}]`, error instanceof Error ? (error.stack || error.message) : error);
  });
}

/**
 * 延迟样本增量统计：
 * - samples：完整样本集（capped maxSamples），仅结束时精确排序一次；
 * - sum/min/max：标量计数器，快照时 O(1) 得到 avg/min/max；
 * - ring：有界环形缓冲（环形覆盖保留最近样本），快照分位数用它估算，
 *   避免每秒对最多 200 万条样本做 O(n log n) 全量排序、扭曲测量延迟。
 */
export interface LatencyStats {
  samples: number[];
  sum: number;
  min: number;
  max: number;
  ring: Float64Array;
  ringIndex: number;
  ringFilled: number;
  maxSamples: number;
}

export function createLatencyStats(ringCapacity: number, maxSamples: number = MAX_LATENCY_SAMPLES): LatencyStats {
  return { samples: [], sum: 0, min: 0, max: 0, ring: new Float64Array(ringCapacity), ringIndex: 0, ringFilled: 0, maxSamples };
}

/** 增量记录一条延迟样本：标量计数器 O(1) 更新；环形缓冲环形覆盖保留最近 ringCapacity 条 */
export function recordLatency(stats: LatencyStats, value: number): void {
  if (stats.samples.length < stats.maxSamples) {
    stats.samples.push(value);
    stats.sum += value;
    if (stats.samples.length === 1 || value < stats.min) stats.min = value;
    if (stats.samples.length === 1 || value > stats.max) stats.max = value;
  }
  stats.ring[stats.ringIndex] = value;
  stats.ringIndex = (stats.ringIndex + 1) % stats.ring.length;
  if (stats.ringFilled < stats.ring.length) stats.ringFilled += 1;
}

/** O(1) 平均响应时间（标量计数器，与对完整样本集 reduce 的结果一致） */
export function latencyAvg(stats: LatencyStats): number {
  return stats.samples.length ? stats.sum / stats.samples.length : 0;
}

/** 快照用分位数估算：对环形缓冲中的最近样本排序（O(R log R)，R ≤ 5 万，远小于全量 200 万） */
export function latencyPercentileEstimate(stats: LatencyStats, q: number): number {
  const sorted = Array.from(stats.ring.subarray(0, stats.ringFilled)).sort((a, b) => a - b);
  return percentile(sorted, q);
}

function normalizedGroup(value: unknown): string {
  return String(value || "未分组").split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean).join(" / ") || "未分组";
}

function customHeaderItems(value: unknown) {
  return String(value || "").split(/\r?\n/).map((line, index) => {
    const separator = line.indexOf(":");
    if (separator < 1) return null;
    return {
      id: `custom-header-${index}`,
      key: line.slice(0, separator).trim(),
      value: line.slice(separator + 1).trim(),
      enabled: true,
    };
  }).filter((item): item is { id: string; key: string; value: string; enabled: boolean } => Boolean(item?.key));
}

function scenarioRows(scenario: Record<string, any>) {
  if (scenario.target_type === "custom") {
    const requests = Array.isArray(scenario.custom_requests) ? scenario.custom_requests : [];
    return requests.map((request: Record<string, any>, index: number) => ({
      id: String(request.id || `custom-${index + 1}`),
      name: String(request.name || `手动接口 ${index + 1}`),
      method: String(request.method || "GET"),
      url: String(request.url || ""),
      headers: Array.isArray(request.headers) ? request.headers : customHeaderItems(request.headersText),
      query_params: Array.isArray(request.queryParams) ? request.queryParams : [],
      body_type: String(request.bodyType || "none"),
      body: String(request.body || ""),
      assertions: Array.isArray(request.assertions) ? request.assertions : [],
      variables: request.variables && typeof request.variables === "object" ? request.variables : {},
    }));
  }
  const cases = all("api_cases");
  if (scenario.target_type === "collection") {
    const path = normalizedGroup(scenario.collection_path);
    return cases.filter((row) => {
      const group = normalizedGroup(row.group_name);
      return group === path || group.startsWith(`${path} / `);
    });
  }
  const selectedIds = new Set(Array.isArray(scenario.target_ids) ? scenario.target_ids.map(String) : []);
  return cases.filter((row) => selectedIds.has(String(row.id)));
}

function prepareRequest(row: Record<string, any>, environment: Record<string, any> | null): PreparedRequest {
  const method = String(row.method || "GET").toUpperCase();
  if (!HTTP_METHODS.has(method)) throw new Error(`接口“${row.name}”使用了不支持的请求方法 ${method}`);
  const variables: Record<string, string> = {
    ...(environment?.variables && typeof environment.variables === "object" ? environment.variables : {}),
    ...(row.variables && typeof row.variables === "object" ? row.variables : {}),
  };
  let requestUrl = normalizeRepeatedVariablePath(renderTemplate(String(row.url || "").trim(), variables), variables);
  const baseUrl = environment?.url ? renderTemplate(String(environment.url), variables) : "";
  if (!requestUrl) throw new Error(`接口“${row.name}”的 URL 为空`);
  if (!/^https?:\/\//i.test(requestUrl) && !baseUrl) throw new Error(`接口“${row.name}”使用相对 URL，但场景未选择带 URL 的环境`);
  const url = /^https?:\/\//i.test(requestUrl)
    ? new URL(requestUrl)
    : new URL(requestUrl, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("性能测试仅支持 HTTP/HTTPS 请求");

  const queryParams = Array.isArray(row.query_params) ? row.query_params : [];
  for (const item of queryParams) {
    if (item?.enabled === false || !String(item?.key || "").trim()) continue;
    url.searchParams.append(renderTemplate(String(item.key), variables), renderTemplate(String(item.value || ""), variables));
  }

  const headers: Record<string, string> = {};
  const headerItems = Array.isArray(row.headers) ? row.headers : [];
  for (const item of headerItems) {
    if (item?.enabled === false || !String(item?.key || "").trim()) continue;
    headers[renderTemplate(String(item.key).trim(), variables)] = renderTemplate(String(item.value || ""), variables);
  }

  const bodyType = String(row.body_type || "none");
  const canSendBody = method !== "GET" && method !== "HEAD" && bodyType !== "none";
  const body = canSendBody ? renderTemplate(String(row.body || ""), variables) : undefined;
  const headerNames = Object.keys(headers).map((key) => key.toLowerCase());
  if (bodyType === "json" && canSendBody) {
    if (body?.trim()) JSON.parse(body);
    if (!headerNames.includes("content-type")) headers["Content-Type"] = "application/json";
  } else if (bodyType === "form" && canSendBody && !headerNames.includes("content-type")) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  } else if (bodyType === "text" && canSendBody && !headerNames.includes("content-type")) {
    headers["Content-Type"] = "text/plain; charset=utf-8";
  }
  requestUrl = url.toString();
  const requestBytes = new TextEncoder().encode(`${method} ${requestUrl}\r\n${Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\n\r\n${body || ""}`).byteLength;
  const assertions = (Array.isArray(row.assertions) ? row.assertions : []).map((assertion: Record<string, any>) => ({
    source: String(assertion.source || "status") as PerformanceAssertion["source"],
    operator: String(assertion.operator || "equals") as PerformanceAssertion["operator"],
    target: renderTemplate(String(assertion.target || ""), variables),
    expected: renderTemplate(String(assertion.expected || ""), variables),
  }));
  return { caseId: String(row.id), caseName: String(row.name || "未命名接口"), method, url: requestUrl, headers, body, assertions, requestBytes };
}

function percentile(sorted: number[], value: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(value * sorted.length) - 1));
  return sorted[index];
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** 分位数来源函数：快照路径用环形缓冲估算，结束路径用完整样本集精确排序 */
type PercentileFn = (stats: LatencyStats, q: number) => number;

function transactionSummary(state: RunState, elapsed: number, percentileOf: PercentileFn) {
  return [...state.transactions.values()].map((transaction) => {
    const latency = transaction.latency;
    return {
      caseId: transaction.caseId,
      caseName: transaction.caseName,
      method: transaction.method,
      url: maskReportUrl(transaction.url),
      totalRequests: transaction.total,
      successfulRequests: transaction.success,
      failedRequests: transaction.failure,
      errorRate: round(transaction.total ? (transaction.failure / transaction.total) * 100 : 0),
      requestsPerSecond: round(transaction.total / elapsed),
      avgResponseTime: round(latencyAvg(latency)),
      minResponseTime: round(latency.samples.length ? latency.min : 0),
      maxResponseTime: round(latency.samples.length ? latency.max : 0),
      p50ResponseTime: round(percentileOf(latency, 0.5)),
      p90ResponseTime: round(percentileOf(latency, 0.9)),
      p95ResponseTime: round(percentileOf(latency, 0.95)),
      p99ResponseTime: round(percentileOf(latency, 0.99)),
      bytesReceived: transaction.bytesReceived,
      bytesSent: transaction.bytesSent,
      statusCodes: Object.fromEntries(transaction.statusCodes),
    };
  }).sort((a, b) => a.caseName.localeCompare(b.caseName, "zh-CN"));
}

function slaResults(state: RunState, p95ResponseTime: number) {
  const successRate = state.total ? (state.success / state.total) * 100 : 0;
  return [
    { id: "success-rate", name: "请求成功率", operator: ">=", target: state.successRateThreshold, actual: round(successRate), unit: "%", passed: state.total > 0 && successRate >= state.successRateThreshold },
    { id: "p95-response-time", name: "P95 响应时间", operator: "<=", target: state.p95ThresholdMs, actual: round(p95ResponseTime), unit: "ms", passed: state.total > 0 && p95ResponseTime <= state.p95ThresholdMs },
  ];
}

/**
 * 汇总行构建：performance_runs 落库字段与语义完全不变。
 * 分位数来源由 percentileOf 决定：
 * - 快照路径：标量计数器 O(1) + 环形缓冲估算，不再每秒对完整样本集做 O(n log n) 全量排序；
 * - 结束路径：完整样本集（capped MAX_LATENCY_SAMPLES）各排序一次精确计算。
 */
function buildSummary(state: RunState, elapsed: number, percentileOf: PercentileFn) {
  const latency = state.latency;
  return {
    duration: Math.round(Date.now() - state.startedAt),
    total_requests: state.total,
    successful_requests: state.success,
    failed_requests: state.failure,
    bytes_received: state.bytes,
    bytes_sent: state.bytesSent,
    avg_response_time: round(latencyAvg(latency)),
    min_response_time: round(latency.samples.length ? latency.min : 0),
    max_response_time: round(latency.samples.length ? latency.max : 0),
    p50_response_time: round(percentileOf(latency, 0.5)),
    p90_response_time: round(percentileOf(latency, 0.9)),
    p95_response_time: round(percentileOf(latency, 0.95)),
    p99_response_time: round(percentileOf(latency, 0.99)),
    requests_per_second: round(state.total / elapsed),
    error_rate: round(state.total ? (state.failure / state.total) * 100 : 0),
    metrics: JSON.stringify(state.metrics),
    errors: JSON.stringify([...state.errors.entries()].map(([message, count]) => ({ message, count })).sort((a, b) => b.count - a.count)),
    status_codes: JSON.stringify(Object.fromEntries(state.statusCodes)),
    transactions: JSON.stringify(transactionSummary(state, elapsed, percentileOf)),
    sla_results: JSON.stringify(slaResults(state, percentileOf(latency, 0.95))),
  };
}

/** 快照/中途落库用：每秒调用一次，avg/min/max 走标量计数器，分位数取环形缓冲估算 */
function summaryEstimated(state: RunState) {
  const elapsed = Math.max((Date.now() - state.startedAt) / 1000, 0.001);
  return buildSummary(state, elapsed, latencyPercentileEstimate);
}

/** 结束时用：对完整样本集（capped 2M）各排序一次精确计算，保证最终落库的 percentile 精度不变 */
function summaryExact(state: RunState) {
  const elapsed = Math.max((Date.now() - state.startedAt) / 1000, 0.001);
  // 每个样本集只排序一次，p50/p90/p95/p99 复用同一份有序数组
  const sortedCache = new Map<LatencyStats, number[]>();
  const percentileOf: PercentileFn = (stats, q) => {
    let sorted = sortedCache.get(stats);
    if (!sorted) {
      sorted = [...stats.samples].sort((a, b) => a - b);
      sortedCache.set(stats, sorted);
    }
    return percentile(sorted, q);
  };
  return buildSummary(state, elapsed, percentileOf);
}

function snapshot(state: RunState, force = false) {
  const current = state.lastSnapshot;
  const requests = state.total - current.total;
  const success = state.success - current.success;
  const failure = state.failure - current.failure;
  const bytes = state.bytes - current.bytes;
  const bytesSent = state.bytesSent - current.bytesSent;
  // 每秒区间样本量很小（≈一秒内的请求数），直接切片排序即可
  const intervalLatencies = state.latency.samples.slice(current.latencyIndex);
  const sorted = [...intervalLatencies].sort((a, b) => a - b);
  if (force || requests > 0 || state.metrics.length === 0) {
    state.metrics.push({
      timestamp: now(),
      elapsedSeconds: Math.max(0, Math.round((Date.now() - state.startedAt) / 1000)),
      activeUsers: state.activeUsers,
      requests,
      success,
      failure,
      rps: requests,
      avgResponseTime: round(intervalLatencies.length ? intervalLatencies.reduce((sum, value) => sum + value, 0) / intervalLatencies.length : 0),
      p95ResponseTime: round(percentile(sorted, 0.95)),
      bytes,
      bytesSent,
    });
  }
  state.lastSnapshot = { total: state.total, success: state.success, failure: state.failure, bytes: state.bytes, bytesSent: state.bytesSent, latencyIndex: state.latency.samples.length };
  // 快照路径用增量统计 + 环形缓冲估算，避免每秒对完整样本集（最多 200 万条）全量排序
  update("performance_runs", state.runId, summaryEstimated(state));
}

function addError(state: RunState, message: string) {
  const normalized = message.slice(0, 500) || "未知错误";
  state.errors.set(normalized, (state.errors.get(normalized) || 0) + 1);
}

function assertionFailures(request: PreparedRequest, response: Response, responseBody: string): string[] {
  if (request.assertions.length === 0) return [];
  let jsonBody: unknown;
  if (request.assertions.some((item) => item.source === "json")) {
    try { jsonBody = JSON.parse(responseBody); } catch { jsonBody = undefined; }
  }
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => { responseHeaders[key] = value; });
  return getAssertionFailures(request.assertions, { status: response.status, headers: responseHeaders, body: responseBody, jsonBody });
}

async function executeRequest(request: PreparedRequest, timeoutMs: number, state: RunState, proxyPool?: ProxyPoolRuntime) {
  const startedAt = performance.now();
  const transaction = state.transactions.get(request.caseId)!;
  state.bytesSent += request.requestBytes;
  transaction.bytesSent += request.requestBytes;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // 运行级取消信号与单请求超时合并：cancelPerformanceRun 立即 abort 在途 fetch，不再等满 timeout_ms
  const runSignal = state.abortController.signal;
  const onRunAbort = () => controller.abort();
  if (runSignal.aborted) controller.abort();
  else runSignal.addEventListener("abort", onRunAbort, { once: true });
  const proxy = proxyPool ? nextProxy(proxyPool) : undefined;
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "follow",
      signal: controller.signal,
      ...(proxy ? { dispatcher: proxy.agent } : {}),
    } as RequestInit & { dispatcher?: ProxyPoolRuntime["agents"][number] });
    let responseBytes = 0;
    let capturedBytes = 0;
    const captureBody = request.assertions.some((item) => item.source === "body" || item.source === "json");
    const responseChunks: Uint8Array[] = [];
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        responseBytes += value.byteLength;
        if (captureBody && capturedBytes < MAX_ASSERTION_BODY_BYTES) {
          const chunk = value.slice(0, Math.min(value.byteLength, MAX_ASSERTION_BODY_BYTES - capturedBytes));
          responseChunks.push(chunk);
          capturedBytes += chunk.byteLength;
        }
      }
    }
    const responseBody = captureBody ? new TextDecoder().decode(responseChunks.length === 1 ? responseChunks[0] : (() => {
      const merged = new Uint8Array(capturedBytes);
      let offset = 0;
      for (const chunk of responseChunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
      return merged;
    })()) : "";
    const failedAssertions = assertionFailures(request, response, responseBody);
    const duration = performance.now() - startedAt;
    state.total += 1;
    state.bytes += responseBytes;
    transaction.total += 1;
    transaction.bytesReceived += responseBytes;
    recordLatency(transaction.latency, duration);
    recordLatency(state.latency, duration);
    const statusKey = String(response.status);
    state.statusCodes.set(statusKey, (state.statusCodes.get(statusKey) || 0) + 1);
    transaction.statusCodes.set(statusKey, (transaction.statusCodes.get(statusKey) || 0) + 1);
    if (response.ok && failedAssertions.length === 0) {
      state.success += 1;
      transaction.success += 1;
    }
    else {
      state.failure += 1;
      transaction.failure += 1;
      addError(state, failedAssertions.length > 0 ? `${request.caseName}: 断言失败：${failedAssertions.join("；")}` : `${request.caseName}: HTTP ${response.status}`);
    }
  } catch (error) {
    const duration = performance.now() - startedAt;
    state.total += 1;
    state.failure += 1;
    transaction.total += 1;
    transaction.failure += 1;
    recordLatency(transaction.latency, duration);
    recordLatency(state.latency, duration);
    // 仅将“连接类失败”计为代理网络失败；超时/取消/断言失败不计入，避免误报“代理全部不可用”
    const isAbort = error instanceof Error && error.name === "AbortError";
    const message = isAbort
      ? (runSignal.aborted ? "执行已取消" : `请求超时（${timeoutMs}ms）`)
      : (error instanceof Error ? error.message : String(error));
    if (proxy && !isAbort) state.proxyNetworkFailures += 1;
    addError(state, `${request.caseName}: ${message}${proxy ? `（代理 ${proxy.server}）` : ""}`);
  } finally {
    clearTimeout(timer);
    runSignal.removeEventListener("abort", onRunAbort);
  }
}

async function waitForRamp(delayMs: number, state: RunState, endAt: number) {
  const until = Date.now() + delayMs;
  while (!state.cancelled && Date.now() < until && Date.now() < endAt) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(250, until - Date.now())));
  }
}

async function executeRun(runId: string, scenario: Record<string, any>, prepared: PreparedRequest[], proxyPool?: ProxyPoolRuntime) {
  const concurrency = Number(scenario.concurrency);
  const executionMode = scenario.execution_mode === "samples" ? "samples" : "duration";
  const sampleCount = Math.max(1, Number(scenario.sample_count) || 1);
  const durationSeconds = Number(scenario.duration_seconds);
  const rampUpSeconds = Number(scenario.ramp_up_seconds);
  const timeoutMs = Number(scenario.timeout_ms);
  const thinkTimeMs = Number(scenario.think_time_ms);
  const state: RunState = {
    runId, scenarioId: String(scenario.id), cancelled: false, abortController: new AbortController(),
    startedAt: Date.now(), activeUsers: 0, total: 0, success: 0, failure: 0, bytes: 0, bytesSent: 0,
    latency: createLatencyStats(STATE_RING_SAMPLES),
    metrics: [], errors: new Map(), statusCodes: new Map(),
    transactions: new Map(prepared.map((request) => [request.caseId, {
      caseId: request.caseId, caseName: request.caseName, method: request.method, url: request.url,
      total: 0, success: 0, failure: 0, bytesReceived: 0, bytesSent: 0,
      latency: createLatencyStats(TRANSACTION_RING_SAMPLES), statusCodes: new Map(),
    }])),
    successRateThreshold: Number(scenario.success_rate_threshold), p95ThresholdMs: Number(scenario.p95_threshold_ms), sequence: 0,
    proxyNetworkFailures: 0,
    lastSnapshot: { total: 0, success: 0, failure: 0, bytes: 0, bytesSent: 0, latencyIndex: 0 },
  };
  activeRuns.set(runId, state);
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    update("performance_runs", runId, { status: "running", started_at: now() });
    const endAt = executionMode === "duration" ? state.startedAt + durationSeconds * 1000 : Number.POSITIVE_INFINITY;
    let claimedRequests = 0;
    const claimRequest = () => {
      if (executionMode === "samples" && claimedRequests >= sampleCount) return null;
      if (executionMode === "duration" && Date.now() >= endAt) return null;
      claimedRequests += 1;
      return prepared[state.sequence++ % prepared.length];
    };
    timer = setInterval(() => snapshot(state), 1000);

    const workers = Array.from({ length: concurrency }, (_, index) => (async () => {
      const rampDelay = rampUpSeconds > 0 ? Math.round((index / Math.max(concurrency - 1, 1)) * rampUpSeconds * 1000) : 0;
      if (rampDelay) await waitForRamp(rampDelay, state, endAt);
      if (state.cancelled || (executionMode === "duration" && Date.now() >= endAt)) return;
      state.activeUsers += 1;
      try {
        while (!state.cancelled) {
          const request = claimRequest();
          if (!request) break;
          await executeRequest(request, timeoutMs, state, proxyPool);
          const hasMoreRequests = executionMode === "samples" ? claimedRequests < sampleCount : Date.now() < endAt;
          if (thinkTimeMs > 0 && !state.cancelled && hasMoreRequests) {
            const waitMs = executionMode === "samples" ? thinkTimeMs : Math.min(thinkTimeMs, Math.max(0, endAt - Date.now()));
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          }
        }
      } finally {
        state.activeUsers -= 1;
      }
    })());
    await Promise.all(workers);
    clearInterval(timer);
    timer = undefined;
    snapshot(state, true);
    // 结束时对完整样本集（capped 2M）精确排序计算一次，保证最终落库的 percentile 精度不变
    const result = summaryExact(state);
    const slaPassed = JSON.parse(result.sla_results).every((item: { passed: boolean }) => item.passed);
    const finalStatus = state.cancelled ? "cancelled" : (slaPassed ? "success" : "failed");
    const finalError = state.total === 0 && !state.cancelled
      ? "测试期间没有发出有效请求"
      : (proxyPool && state.total > 0 && state.proxyNetworkFailures === state.total ? "IP池中的代理全部请求失败，请关闭 IP 池或稍后重试" : "");
    update("performance_runs", runId, {
      ...result,
      status: finalStatus,
      ended_at: now(),
      error_message: finalError,
    });
    safeVoid(deliverExecutionAlerts("performance", scenario.name, finalStatus, finalError), "Alert");
  } catch (error) {
    if (timer) clearInterval(timer);
    const perfError = error instanceof Error ? error.message : String(error);
    update("performance_runs", runId, {
      ...summaryExact(state), status: "failed", ended_at: now(),
      error_message: perfError,
    });
    safeVoid(deliverExecutionAlerts("performance", scenario.name, "failed", perfError), "Alert");
  } finally {
    activeRuns.delete(runId);
    await closeProxyPool(proxyPool);
  }
}

export async function queuePerformanceRun(scenarioId: string) {
  const scenario = get("performance_scenarios", scenarioId);
  if (!scenario) throw new Error("性能测试场景不存在");
  // 启动竞态修复：判重通过后先同步占位——activeRuns.set 要等到 await createProxyPoolRuntime() 之后才执行，
  // 不占位的话两个并发请求可同时通过判重、重复启动同一场景
  if (startingScenarios.has(scenarioId) || [...activeRuns.values()].some((state) => state.scenarioId === scenarioId)) {
    throw new Error("该场景正在执行");
  }
  startingScenarios.add(scenarioId);
  let proxyPool: ProxyPoolRuntime | undefined;
  try {
    const environment = scenario.environment_id ? get("environments", String(scenario.environment_id)) : null;
    if (scenario.environment_id && !environment) throw new Error("所选接口测试环境不存在");
    if (environment && (environment.scope || "platform") !== "api") throw new Error("性能测试只能选择接口测试环境");
    const rows = scenarioRows(scenario);
    if (rows.length === 0) throw new Error("场景中没有可执行的接口用例");
    const prepared = rows.map((row) => prepareRequest(row, environment));
    proxyPool = scenario.use_proxy_pool ? await createProxyPoolRuntime() : undefined;
    const id = `perf-run-${createId()}`;
    const timestamp = now();
    const row = {
      id, scenario_id: scenario.id, scenario_name: scenario.name, status: "pending", started_at: null, ended_at: null,
      duration: 0, total_requests: 0, successful_requests: 0, failed_requests: 0, bytes_received: 0, bytes_sent: 0,
      avg_response_time: 0, min_response_time: 0, max_response_time: 0, p50_response_time: 0, p90_response_time: 0,
      p95_response_time: 0, p99_response_time: 0, requests_per_second: 0, error_rate: 0,
      metrics: JSON.stringify([]), errors: JSON.stringify([]), status_codes: JSON.stringify({}), transactions: JSON.stringify([]), sla_results: JSON.stringify([]),
      config: JSON.stringify({
        id: scenario.id,
        name: scenario.name,
        description: scenario.description || "",
        targetType: scenario.target_type,
        targetIds: scenario.target_ids,
        collectionPath: scenario.collection_path,
        environmentId: scenario.environment_id,
        concurrency: scenario.concurrency,
        executionMode: scenario.execution_mode || "duration",
        sampleCount: scenario.sample_count || 1000,
        durationSeconds: scenario.duration_seconds,
        rampUpSeconds: scenario.ramp_up_seconds,
        timeoutMs: scenario.timeout_ms,
        thinkTimeMs: scenario.think_time_ms,
        useProxyPool: Boolean(scenario.use_proxy_pool),
        proxyCount: proxyPool?.proxies.length || 0,
        successRateThreshold: scenario.success_rate_threshold,
        p95ThresholdMs: scenario.p95_threshold_ms,
        caseCount: rows.length,
      }), error_message: "", created_at: timestamp,
    };
    insert("performance_runs", row);
    safeVoid(executeRun(id, scenario, prepared, proxyPool), "Performance");
    return get("performance_runs", id);
  } catch (error) {
    // 代理池创建成功但后续流程失败（如 insert 抛错）时必须归还，否则连接池泄漏
    if (proxyPool) await closeProxyPool(proxyPool);
    throw error;
  } finally {
    startingScenarios.delete(scenarioId);
  }
}

export function cancelPerformanceRun(runId: string): boolean {
  const state = activeRuns.get(runId);
  if (!state) return false;
  state.cancelled = true;
  // 立即中断全部在途请求：此前软标志位最长要等 timeout_ms（默认 120s）才退出
  state.abortController.abort();
  return true;
}

export function markInterruptedPerformanceRuns() {
  exec("UPDATE performance_runs SET status = 'failed', ended_at = ?, error_message = '服务重启，执行已中断' WHERE status IN ('pending', 'running')", now());
}

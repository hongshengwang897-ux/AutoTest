import { chromium, Browser } from "playwright";
import { v4 as uuid } from "uuid";
import type { AutoDetectSession, DetectedElement } from "./types.js";
import { buildInjectionScript } from "./inject.js";
import { dedupBySelector } from "./dedup.js";

const sessions = new Map<string, AutoDetectSession>();

const browserInstances: { headless?: Browser; headful?: Browser } = {};

// 会话最近活跃时间（页面操作/轮询时刷新），用于空闲会话回收
const lastActive = new Map<string, number>();
const SESSION_IDLE_MS = 30 * 60 * 1000; // 空闲超过 30 分钟自动关闭
const SESSION_SCAN_INTERVAL_MS = 60 * 1000; // 每 60 秒低频扫描一次

function touchSession(sessionId: string): void {
  lastActive.set(sessionId, Date.now());
}

// ---- SSRF 防护：内网/私有地址校验 ----

/** 判断 IPv4（支持点分十进制及十六进制/八进制段、纯十进制整型写法）是否为私有/保留地址 */
function isPrivateIPv4(host: string): boolean {
  const parts = host.split(".");
  const nums: number[] = [];
  if (parts.length === 4) {
    for (const part of parts) {
      let v: number;
      if (/^0x[0-9a-f]+$/i.test(part)) v = parseInt(part, 16); // 十六进制段，如 0x7f
      else if (/^0\d+$/.test(part)) v = parseInt(part, 8); // 八进制段，如 017
      else if (/^\d+$/.test(part)) v = parseInt(part, 10);
      else return false;
      if (!Number.isInteger(v) || v < 0 || v > 255) return false;
      nums.push(v);
    }
  } else if (parts.length === 1 && (/^0x[0-9a-f]+$/i.test(host) || /^\d+$/.test(host))) {
    // 整型写法，如 2130706433、0x7f000001（均代表 127.0.0.1）
    const v = Number(host);
    if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) return false;
    nums.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  } else {
    return false;
  }
  const [a, b] = nums;
  if (a === 0 || a === 10 || a === 127) return true; // 0.0.0.0/8 未指定、10/8 私有、127/8 环回
  if (a === 169 && b === 254) return true; // 169.254/16 链路本地（含云元数据地址）
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 私有
  if (a === 192 && b === 168) return true; // 192.168/16 私有
  return false;
}

/** 判断 IPv6（不含方括号、已去掉 zone index）是否为私有/内网地址 */
function isPrivateIPv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::" || h === "::1") return true; // 未指定地址 / 环回
  // IPv4 映射地址 ::ffff:x.y.z.w 或 ::ffff:xxxx:xxxx → 按对应 IPv4 判断
  const mapped = h.match(/^::ffff:(.+)$/);
  if (mapped) {
    const tail = mapped[1];
    if (tail.includes(".")) return isPrivateIPv4(tail);
    const groups = tail.split(":");
    if (groups.length === 2) {
      const hi = parseInt(groups[0], 16);
      const lo = parseInt(groups[1], 16);
      if (Number.isInteger(hi) && Number.isInteger(lo)) {
        return isPrivateIPv4(`${(hi >>> 8) & 255}.${hi & 255}.${(lo >>> 8) & 255}.${lo & 255}`);
      }
    }
    return true; // 无法识别的映射形式一律视为内网
  }
  // 取 "::" 压缩前的第一组，判断本地段（WHATWG URL 会将 IPv6 序列化为压缩形式）
  const firstGroup = h.split("::")[0].split(":")[0];
  const g0 = parseInt(firstGroup, 16);
  if (!Number.isInteger(g0)) return false;
  if (g0 >= 0xfc00 && g0 <= 0xfdff) return true; // fc00::/7 唯一本地地址（ULA）
  if (g0 >= 0xfe80 && g0 <= 0xfeff) return true; // fe80::/10 链路本地 + fec0::/10 已废弃站点本地
  return false;
}

/**
 * 校验目标 URL 是否允许访问（SSRF 防护，供 auto-detect 与 recorder 共用）。
 * 仅允许 http/https；阻止 file://、data:、私有/内网地址（含 IPv6 内网段、
 * ::ffff: 映射地址、十六进制/八进制/十进制 IP 变体）等目标。
 * 返回 null 表示允许访问；否则返回拒绝原因（可直接作为错误信息抛出）。
 */
export function isPrivateTarget(url: string): string | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return "URL 格式无效，请输入完整的网址";
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return "仅支持 HTTP 或 HTTPS URL";
  }
  // URL 解析器会把十六进制/八进制/纯十进制 IPv4 规范化为点分十进制，这里再做兜底识别
  const host = parsedUrl.hostname.toLowerCase();
  let hostname = host;
  const isV6 = hostname.startsWith("[") && hostname.endsWith("]");
  if (isV6) hostname = hostname.slice(1, -1);
  const zoneIndex = hostname.indexOf("%");
  if (zoneIndex >= 0) hostname = hostname.slice(0, zoneIndex); // 去掉 zone index（如 fe80::1%eth0）
  const privateHost = isV6 || hostname.includes(":")
    ? isPrivateIPv6(hostname)
    : hostname === "localhost" || hostname.endsWith(".localhost") || isPrivateIPv4(hostname);
  if (privateHost) {
    return `目标地址为私有/内网地址，出于安全考虑已拒绝: ${host}`;
  }
  return null;
}

// 低频扫描：自动关闭空闲超过 30 分钟的会话（unref 不阻止进程退出）
const sessionIdleTimer = setInterval(() => { void sweepIdleSessions(); }, SESSION_SCAN_INTERVAL_MS);
sessionIdleTimer.unref();

async function sweepIdleSessions(): Promise<void> {
  const nowMs = Date.now();
  for (const [sessionId, session] of [...sessions]) {
    const last = lastActive.get(sessionId) ?? Date.parse(session.createdAt);
    if (Number.isFinite(last) && nowMs - last < SESSION_IDLE_MS) continue;
    try {
      await closePage(sessionId);
      console.log(`[Browser] 已回收空闲会话 ${sessionId}`);
    } catch (error) {
      console.warn("[Browser] 回收空闲会话失败:", error instanceof Error ? error.message : error);
    }
  }
}

export async function getBrowser(headless: boolean): Promise<Browser> {
  const key = headless ? "headless" : "headful";
  const existing = browserInstances[key];
  if (existing && existing.isConnected()) return existing;

  const launchOptions = {
    headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  };
  let browser: Browser;
  if (process.env.AUTOTEST_LOCAL_RUNNER === "1") {
    const preferred = process.env.AUTOTEST_BROWSER_CHANNEL || "chrome";
    const channels = Array.from(new Set([preferred, "chrome", "msedge"]));
    let lastError: unknown;
    browser = null as unknown as Browser;
    for (const channel of channels) {
      try {
        browser = await chromium.launch({ ...launchOptions, channel });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!browser) {
      throw new Error(`无法启动本机 Chrome 或 Edge: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    }
  } else {
    browser = await chromium.launch(launchOptions);
  }
  browserInstances[key] = browser;
  return browser;
}

export async function openPage(
  url: string,
  headless: boolean,
  apiBaseUrl: string
): Promise<{ sessionId: string }> {
  // 安全校验：仅允许 http/https，阻止 file://、data:、私有网络/云元数据等 SSRF 目标
  const rejection = isPrivateTarget(url);
  if (rejection) throw new Error(rejection);
  const parsedUrl = new URL(url); // 已通过 isPrivateTarget 校验

  const sessionId = uuid();
  const browser = await getBrowser(headless);

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // headless mode: if user wants headful, we set the channel differently
    // Playwright's headless is per-launch; we handle via launch options
  });

  const page = await context.newPage();

  // Store session
  const session: AutoDetectSession = {
    sessionId,
    url,
    headless,
    status: "opening",
    elements: [],
    createdAt: new Date().toISOString(),
  };
  sessions.set(sessionId, session);
  touchSession(sessionId);

  // Navigate
  try {
    await page.goto(parsedUrl.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (error) {
    // 失败时清理已注册的会话与页面，避免泄漏
    sessions.delete(sessionId);
    lastActive.delete(sessionId);
    try { await page.close(); } catch { /* page may already be closed */ }
    try { await context.close(); } catch { /* context may already be closed */ }
    throw error;
  }

  // Inject floating button
  const reportUrl = `${apiBaseUrl}/api/auto-detect/report/${sessionId}`;
  const script = buildInjectionScript(reportUrl);
  await page.evaluate(script);

  session.status = "ready";

  // Store page reference for later cleanup
  session._page = page;
  session._context = context;

  return { sessionId };
}

export async function scanPageElements(
  sessionId: string
): Promise<{ elements: DetectedElement[]; totalFound: number; afterDedup: number }> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  const page = session._page;
  if (!page) throw new Error("Page not available");

  touchSession(sessionId);
  session.status = "scanning";

  // Execute scan in page context — use raw string to avoid tsx transforms
  const rawElements: DetectedElement[] = await page.evaluate(`
    (() => {
      const selectors = [
        'button, [role="button"], input[type="submit"], input[type="button"]',
        'input:not([type="submit"]):not([type="button"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea',
        'a[href]',
        'img',
        'select',
        'input[type="checkbox"]',
        'input[type="radio"]',
        'nav, header, footer, main, section, [role="navigation"], [role="banner"]',
      ];

      function isVisible(el) {
        var style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
          return false;
        var rect = el.getBoundingClientRect();
        return !(rect.width === 0 && rect.height === 0);
      }

      function getType(el) {
        var tag = el.tagName.toLowerCase();
        var role = el.getAttribute('role');
        var typeAttr = (el.getAttribute('type') || '').toLowerCase();
        if (tag === 'button' || role === 'button' || typeAttr === 'submit' || typeAttr === 'button')
          return 'button';
        if (tag === 'a' || role === 'link') return 'link';
        if (tag === 'img') return 'image';
        if (tag === 'select' || role === 'listbox' || role === 'combobox') return 'select';
        if (typeAttr === 'checkbox' || role === 'checkbox') return 'checkbox';
        if (typeAttr === 'radio' || role === 'radio') return 'radio';
        if (tag === 'input' || tag === 'textarea') return 'input';
        if (tag === 'label' || tag === 'span' || tag === 'p' ||
            tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6')
          return 'text';
        return 'container';
      }

      function buildSelector(el) {
        var tag = el.tagName.toLowerCase();
        var dataTestid = el.getAttribute('data-testid');
        var id = el.getAttribute('id');
        var name = el.getAttribute('name');
        if (dataTestid) return { s: '[data-testid="' + dataTestid.replace(/"/g, '\\\\"') + '"]', t: 'css' };
        if (id && /^[a-zA-Z_][\\w.:-]*$/.test(id)) return { s: '#' + id, t: 'css' };
        if (name && tag === 'input') return { s: 'input[name="' + name.replace(/"/g, '\\\\"') + '"]', t: 'css' };
        var parent = el.parentElement;
        if (parent) {
          var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === el.tagName; });
          var idx = siblings.indexOf(el);
          if (idx >= 0) return { s: tag + ':nth-of-type(' + (idx + 1) + ')', t: 'css' };
        }
        return { s: tag, t: 'css' };
      }

      function suggestName(el, type) {
        var attrs = ['aria-label', 'data-testid', 'data-name', 'placeholder', 'title', 'alt', 'name', 'id'];
        for (var i = 0; i < attrs.length; i++) {
          var v = el.getAttribute(attrs[i]);
          if (v && v.length <= 30) return v;
        }
        var text = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30);
        if (text) return text;
        var map = { button: '按钮', input: '输入框', text: '文本', link: '链接', image: '图片', select: '下拉选择', checkbox: '复选框', radio: '单选框', container: '容器' };
        return (map[type] || '元素') + ' (' + el.tagName.toLowerCase() + ')';
      }

      function describeElement(el, type) {
        var text = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50);
        if (type === 'button') return text ? '按钮: "' + text + '"' : '按钮元素';
        if (type === 'input') return el.getAttribute('placeholder') ? '输入框: ' + el.getAttribute('placeholder') : '输入框';
        if (type === 'link') return text ? '链接: ' + text : '链接元素';
        if (type === 'image') return el.getAttribute('alt') ? '图片: ' + el.getAttribute('alt') : '图片元素';
        if (type === 'select') return '下拉选择框';
        return text || '页面元素';
      }

      var raw = [];
      for (var s = 0; s < selectors.length; s++) {
        try {
          var nodes = document.querySelectorAll(selectors[s]);
          for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            if (!isVisible(el)) continue;
            var type = getType(el);
            var sel = buildSelector(el);
            raw.push({
              id: 'det-' + raw.length,
              suggestedName: suggestName(el, type),
              type: type,
              selector: sel.s,
              selectorType: sel.t,
              description: describeElement(el, type),
              tag: null,
              checked: true,
            });
            if (raw.length >= 200) break;
          }
        } catch (_) {}
        if (raw.length >= 200) break;
      }
      return raw;
    })()
  `) as DetectedElement[];

  const totalFound = rawElements.length;
  const elements = dedupBySelector(rawElements);

  session.elements = elements;
  session.status = "ready";

  return { elements, totalFound, afterDedup: elements.length };
}

export function receiveReport(
  sessionId: string,
  rawElements: DetectedElement[]
): { elements: DetectedElement[]; totalFound: number; afterDedup: number } {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  touchSession(sessionId);
  const totalFound = rawElements.length;
  const elements = dedupBySelector(rawElements);

  session.elements = elements;
  session.status = "ready";

  return { elements, totalFound, afterDedup: elements.length };
}

export async function closePage(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;

  try {
    const context = session._context;
    if (context) await context.close();
  } catch (_) {
    // Ignore cleanup errors
  }

  session.status = "closed";
  sessions.delete(sessionId);
  lastActive.delete(sessionId);
}

export function getSession(sessionId: string): AutoDetectSession | undefined {
  const session = sessions.get(sessionId);
  if (session) touchSession(sessionId); // 状态轮询视为活跃
  return session;
}

export function getSessionElements(sessionId: string): DetectedElement[] {
  const session = sessions.get(sessionId);
  if (session) touchSession(sessionId); // 元素轮询视为活跃
  return session?.elements || [];
}

/** 关闭全部 auto-detect 会话（优雅停机用），尽力清理，单个失败不影响其他 */
export async function closeAllSessions(): Promise<void> {
  const ids = [...sessions.keys()];
  await Promise.all(ids.map((sessionId) => closePage(sessionId).catch(() => { /* 尽力清理 */ })));
  lastActive.clear();
}

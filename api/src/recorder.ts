/**
 * 录制引擎 — Playwright 浏览器交互捕获（两阶段模式）
 *
 * 阶段 1 — 浏览：visitPage() 打开浏览器，用户自由操作（登录、导航等）
 * 阶段 2 — 录制：startCapture() 注入事件监听，通过 exposeFunction 通信（无跨域问题）
 */
import { getBrowser, isPrivateTarget } from "./browser.js";
import { v4 as uuid } from "uuid";
import type { RecordingSession, RecordedEvent } from "./types.js";
import { BrowserContext, Page } from "playwright";

// 内存存储
const sessions = new Map<string, RecordingSession>();

// 存储 page/context 引用（不序列化到 session）
const pageRefs = new Map<string, { page: Page; context: BrowserContext }>();
export const _pageRefs = pageRefs; // 导出给调试路由使用

// 会话最近活跃时间（页面操作/轮询时刷新），用于空闲会话回收
const lastActive = new Map<string, number>();
const SESSION_IDLE_MS = 30 * 60 * 1000; // 空闲超过 30 分钟自动关闭
const SESSION_SCAN_INTERVAL_MS = 60 * 1000; // 每 60 秒低频扫描一次

function touchSession(sessionId: string): void {
  lastActive.set(sessionId, Date.now());
}

// 低频扫描：自动关闭空闲超过 30 分钟的录制会话（unref 不阻止进程退出）
const sessionIdleTimer = setInterval(() => { void sweepIdleSessions(); }, SESSION_SCAN_INTERVAL_MS);
sessionIdleTimer.unref();

async function sweepIdleSessions(): Promise<void> {
  const nowMs = Date.now();
  const ids = new Set<string>([...sessions.keys(), ...pageRefs.keys()]);
  for (const sessionId of ids) {
    const last = lastActive.get(sessionId);
    if (last !== undefined) {
      if (nowMs - last < SESSION_IDLE_MS) continue;
    } else {
      // 无活跃记录的会话按创建时间兜底判断
      const session = sessions.get(sessionId);
      const createdAt = session ? Date.parse(session.createdAt) : NaN;
      if (Number.isFinite(createdAt) && nowMs - createdAt < SESSION_IDLE_MS) continue;
    }
    try {
      await closeRecording(sessionId);
      console.log(`[Recorder] 已回收空闲录制会话 ${sessionId}`);
    } catch (error) {
      console.warn("[Recorder] 回收空闲录制会话失败:", error instanceof Error ? error.message : error);
    }
  }
}

export interface EmbeddedElement {
  selector: string;
  selectorType: "css";
  target: string;
  tagName: string;
  type: string;
  value: string;
  bounds: { x: number; y: number; width: number; height: number };
}

/** 生成唯一选择器（优先级: data-testid > id > name > role > nth-of-type） */
function buildSelectorScript(): string {
  return `
function buildSelector(el) {
  if (!el || el === document || el === document.body || el === document.documentElement) return '';
  if (el.dataset && el.dataset.testid) return '[data-testid="' + el.dataset.testid + '"]';
  if (el.id) return '#' + CSS.escape(el.id);
  if (el.name) {
    var tag = el.tagName.toLowerCase();
    return tag + '[name="' + el.name + '"]';
  }
  if (el.getAttribute && el.getAttribute('data-qa')) return '[data-qa="' + el.getAttribute('data-qa') + '"]';
  if (el.getAttribute && el.getAttribute('aria-label')) {
    var role = el.getAttribute('role');
    if (role) return '[role="' + role + '"][aria-label="' + el.getAttribute('aria-label') + '"]';
    return '[aria-label="' + el.getAttribute('aria-label') + '"]';
  }

  var parent = el.parentElement;
  if (!parent) return el.tagName.toLowerCase();
  var tag = el.tagName.toLowerCase();
  var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === el.tagName; });
  var idx = siblings.indexOf(el) + 1;
  if (siblings.length === 1) return tag;

  var parts = [];
  var current = el;
  while (current && current !== document.body && current !== document.documentElement) {
    var p = current.parentElement;
    if (!p) break;
    var sameTag = Array.from(p.children).filter(function(c) { return c.tagName === current.tagName; });
    var i = sameTag.indexOf(current) + 1;
    parts.unshift(current.tagName.toLowerCase() + ':nth-of-type(' + i + ')');
    current = p;
    if (p.id) { parts.unshift('#' + CSS.escape(p.id)); break; }
  }
  return parts.join(' > ');
}

function describeElement(el) {
  if (!el) return '';
  var text = (el.textContent || '').trim().slice(0, 50);
  if (el.getAttribute && el.getAttribute('placeholder')) return el.getAttribute('placeholder');
  if (el.getAttribute && el.getAttribute('aria-label')) return el.getAttribute('aria-label');
  if (text) return text;
  return el.tagName.toLowerCase();
}
`;
}

/** 注入页面的事件捕获脚本（通过 window.__recorderReport 通信，由 Playwright exposeFunction 提供） */
function captureScript(): string {
  return `
(function() {
  if (window.__recorderInstalled) return;
  window.__recorderInstalled = true;
  console.log('[Recorder] 事件捕获已启动');

  var events = [];

  ${buildSelectorScript()}

  async function flush() {
    if (events.length === 0) return;
    var batch = events.splice(0);
    try {
      if (window.__recorderReport) {
        await window.__recorderReport(batch);
        console.log('[Recorder] 已上报 ' + batch.length + ' 个事件');
      } else {
        console.error('[Recorder] __recorderReport 不可用');
      }
    } catch(e) {
      console.error('[Recorder] 上报异常', e.message);
    }
  }

  function send(e) {
    e.id = 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2,6);
    e.timestamp = new Date().toISOString();
    e.pageUrl = location.href;
    events.push(e);
    clearTimeout(window.__recorderFlush);
    window.__recorderFlush = setTimeout(function() { flush(); }, 300);
  }

  window.__recorderFlushNow = async function() {
    clearTimeout(window.__recorderFlush);
    await flush();
  };

  function record(action, el, extra) {
    if (window.__recorderManualAction) return;
    extra = extra || {};
    var sel = buildSelector(el);
    var desc = describeElement(el);
    console.log('[Recorder] 捕获:', action, sel, extra.value || '');
    send({
      action: action,
      target: desc,
      selector: sel,
      selectorType: 'css',
      value: extra.value || '',
      tagName: el.tagName ? el.tagName.toLowerCase() : ''
    });
  }

  // 点击
  document.addEventListener('click', function(e) {
    var el = e.target;
    if (!el || el.closest('[data-recorder-ignore]')) return;
    var tag = el.tagName.toLowerCase();
    if (tag === 'input' && (el.type === 'checkbox' || el.type === 'radio')) {
      record(el.checked ? 'check' : 'uncheck', el);
    } else {
      record('click', el);
    }
  }, true);

  // select change
  document.addEventListener('change', function(e) {
    var el = e.target;
    if (!el || el.closest('[data-recorder-ignore]')) return;
    if (el.tagName.toLowerCase() === 'select') {
      record('select', el, { value: el.value });
    } else if ((el.tagName.toLowerCase() === 'input' && el.type !== 'checkbox' && el.type !== 'radio') || el.tagName.toLowerCase() === 'textarea') {
      record('fill', el, { value: el.value });
    }
  }, true);

  document.addEventListener('compositionend', function(e) {
    var el = e.target;
    if (!el || el.closest('[data-recorder-ignore]')) return;
    var tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') record('fill', el, { value: el.value });
  }, true);

  // 输入
  document.addEventListener('input', function(e) {
    var el = e.target;
    if (!el || el.closest('[data-recorder-ignore]')) return;
    var tag = el.tagName.toLowerCase();
    if ((tag === 'input' && el.type !== 'checkbox' && el.type !== 'radio') || tag === 'textarea') {
      record('fill', el, { value: el.value });
    }
  }, true);

  // 滚动（防抖 500ms）
  var scrollTimer;
  window.addEventListener('scroll', function() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function() {
      send({
        action: 'scroll',
        target: 'window',
        selector: '',
        value: String(window.scrollY)
      });
    }, 500);
  }, { passive: true });

  // SPA 路由变化
  var lastUrl = location.href;
  var observer = new MutationObserver(function() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      send({
        action: 'navigate',
        target: lastUrl,
        selector: '',
        value: ''
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // 卸载前发送
  window.addEventListener('beforeunload', function() {
    clearTimeout(window.__recorderFlush);
    flush();
  });

  console.log('[Recorder] 录制已启动 — ' + location.href);
})();
`;
}

// ---- 阶段 1: 访问页面 ----

export async function visitPage(
  url: string,
  headless: boolean,
  _apiBase?: string
): Promise<{ sessionId: string; warning?: string }> {
  // SSRF 防护：与 auto-detect 相同的内网地址拦截（含 IPv6 内网段、::ffff: 映射、十六进制/十进制 IP 变体）
  const rejection = isPrivateTarget(url);
  if (rejection) throw new Error(rejection);
  const parsedUrl = new URL(url); // 已通过 isPrivateTarget 校验

  const sessionId = uuid();
  const browser = await getBrowser(headless);
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // 监听页面关闭
  page.on("close", () => {
    pageRefs.delete(sessionId);
    sessions.delete(sessionId);
    lastActive.delete(sessionId);
  });

  let response = null;
  let warning: string | undefined;
  try {
    response = await page.goto(parsedUrl.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError" && page.url() !== "about:blank") {
      warning = "页面加载超过 30 秒，已保留当前页面，可继续尝试录制";
    } else {
      try { await page.close(); } catch { /* page may already be closed */ }
      try { await context.close(); } catch { /* context may already be closed */ }
      throw error;
    }
  }

  // 监听浏览器控制台（调试用）
  page.on("console", (msg: any) => {
    const text = msg.text();
    if (text.startsWith("[Recorder]")) {
      console.log(`[Browser] ${text}`);
    }
  });

  // 检查 HTTP 状态码
  if (response) {
    const status = response.status();
    if (status >= 400) {
      warning = `目标页面返回 HTTP ${status}，页面可能无法正常显示`;
    } else if (status >= 300) {
      warning = `目标页面返回重定向 HTTP ${status}`;
    }
  }

  // 存储 page/context 引用
  pageRefs.set(sessionId, { page, context });

  const session: RecordingSession = {
    sessionId,
    url,
    headless,
    status: "browsing",
    events: [],
    createdAt: new Date().toISOString(),
    warning,
  };
  sessions.set(sessionId, session);
  touchSession(sessionId);

  return { sessionId, warning };
}

// ---- 阶段 2: 开始录制 ----

export async function startCapture(sessionId: string, _apiBase?: string): Promise<{ status: string }> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "browsing") throw new Error("Session is not in browsing state");

  const ref = pageRefs.get(sessionId);
  if (!ref) throw new Error("Browser page not available");

  touchSession(sessionId);

  // 核心修复：用 exposeFunction 代替 fetch，解决 HTTPS→HTTP 跨域问题
  // 浏览器通过 Playwright CDP 通道直接回传事件到 Node.js
  await ref.page.exposeFunction("__recorderReport", (batch: any[]) => {
    try {
      receiveRecordingEvents(sessionId, batch);
    } catch (e: any) {
      console.error("[Recorder] 处理事件失败:", e.message);
    }
  });

  // 注入捕获脚本
  await ref.page.evaluate(captureScript());
  console.log(`[Recorder] 脚本注入成功 session=${sessionId}`);

  // 导航后重新注入
  ref.page.on("framenavigated", async (frame: any) => {
    if (frame === ref.page.mainFrame()) {
      const s = sessions.get(sessionId);
      if (!s || s.status !== "recording") return;

      // 记录导航事件
      s.events.push({
        id: `evt-${Date.now()}-nav`,
        timestamp: new Date().toISOString(),
        action: "navigate",
        target: frame.url(),
        selector: "",
        selectorType: undefined,
        value: "",
        tagName: "",
        pageUrl: frame.url(),
      });

      // 等待新页面加载完成，重注入脚本（exposeFunction 页面级别已存在，无需重新注册）
      try {
        await ref.page.evaluate(() => {
          delete (window as any).__recorderInstalled;
        });
        await ref.page.evaluate(captureScript());
        console.log(`[Recorder] 导航后重新注入 captureScript session=${sessionId}`);
      } catch (err: any) {
        console.error(`[Recorder] 导航后注入失败:`, err.message);
      }
    }
  });

  session.status = "recording";

  return { status: "recording" };
}

// ---- 公共 API ----

export function receiveRecordingEvents(
  sessionId: string,
  events: RecordedEvent[]
): { received: number; total: number } {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "recording") return { received: 0, total: session.events.length };

  touchSession(sessionId); // 收到页面事件视为活跃
  console.log(`[Recorder] 收到上报: ${events.length} 个事件, session=${sessionId.slice(0, 8)}...`);
  for (const evt of events) {
    console.log(`  -> ${evt.action} sel="${evt.selector}" target="${evt.target}" val="${evt.value || ''}"`);
    if (evt.action === "scroll") continue;

    if (evt.action === "fill" || evt.action === "select") {
      const prev = session.events
        .filter((e) => e.selector === evt.selector && e.action === evt.action)
        .pop();
      if (prev) {
        prev.value = evt.value;
        prev.timestamp = evt.timestamp;
        continue;
      }
    }

    const last = session.events[session.events.length - 1];
    if (last && last.selector === evt.selector && last.action === evt.action && evt.action === "click") {
      if (Date.parse(evt.timestamp) - Date.parse(last.timestamp) < 500) continue;
    }

    session.events.push(evt);
  }

  return { received: events.length, total: session.events.length };
}

export function getRecordingEvents(sessionId: string, since?: number): RecordedEvent[] {
  const session = sessions.get(sessionId);
  if (!session) return [];
  touchSession(sessionId); // 事件轮询视为活跃
  if (since) return session.events.filter((e) => Date.parse(e.timestamp) > since);
  return [...session.events];
}

export async function getRecordingSnapshot(sessionId: string): Promise<{ image: string; width: number; height: number; url: string; title: string }> {
  const session = sessions.get(sessionId);
  const ref = pageRefs.get(sessionId);
  if (!session || !ref || ref.page.isClosed()) throw new Error("Session not found");
  touchSession(sessionId); // 快照轮询视为活跃
  const viewport = ref.page.viewportSize() || { width: 1280, height: 720 };
  const buffer = await ref.page.screenshot({ type: "jpeg", quality: 72 });
  return {
    image: `data:image/jpeg;base64,${buffer.toString("base64")}`,
    width: viewport.width,
    height: viewport.height,
    url: ref.page.url(),
    title: await ref.page.title().catch(() => ""),
  };
}

export async function inspectRecordingPoint(sessionId: string, x: number, y: number): Promise<EmbeddedElement | null> {
  const ref = pageRefs.get(sessionId);
  if (!ref || ref.page.isClosed()) throw new Error("Session not found");
  touchSession(sessionId); // 元素探测视为活跃
  const viewport = ref.page.viewportSize() || { width: 1280, height: 720 };
  const point = {
    x: Math.max(0, Math.min(viewport.width - 1, Number(x) || 0)),
    y: Math.max(0, Math.min(viewport.height - 1, Number(y) || 0)),
  };
  return ref.page.evaluate(({ x: pointX, y: pointY }) => {
    const raw = document.elementFromPoint(pointX, pointY);
    if (!raw) return null;
    const el = raw.closest("button,a,input,textarea,select,[role='button'],[role='link']") || raw;
    const rect = el.getBoundingClientRect();
    const input = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const tagName = el.tagName.toLowerCase();
    const testid = el.getAttribute("data-testid");
    const id = el.getAttribute("id");
    const name = el.getAttribute("name");
    const aria = el.getAttribute("aria-label");
    let selector = tagName;
    if (el === document.body) selector = "body";
    else if (el === document.documentElement) selector = "html";
    else if (testid) selector = `[data-testid="${CSS.escape(testid)}"]`;
    else if (id) selector = `#${CSS.escape(id)}`;
    else {
      const segments: string[] = [];
      let current: Element | null = el;
      while (current) {
        const currentTag = current.tagName.toLowerCase();
        if (current === document.body) {
          segments.unshift("body");
          break;
        }
        const currentTestId = current.getAttribute("data-testid");
        const currentId = current.getAttribute("id");
        if (currentTestId) {
          segments.unshift(`[data-testid="${CSS.escape(currentTestId)}"]`);
          break;
        }
        if (currentId) {
          segments.unshift(`#${CSS.escape(currentId)}`);
          break;
        }
        const currentParent: Element | null = current.parentElement;
        const sameTagSiblings = currentParent ? [...currentParent.children].filter((child) => child.tagName === current?.tagName) : [];
        const currentIndex = sameTagSiblings.indexOf(current) + 1;
        let segment = currentTag;
        if (current === el && name) segment += `[name="${CSS.escape(name)}"]`;
        else if (current === el && aria) segment += `[aria-label="${CSS.escape(aria)}"]`;
        if (sameTagSiblings.length > 1) segment += `:nth-of-type(${currentIndex})`;
        segments.unshift(segment);
        current = currentParent;
      }
      selector = segments.join(" > ");
    }
    const candidate = aria || el.getAttribute("placeholder") || el.textContent || el.tagName;
    let type = "element";
    if (tagName === "input" && ((input as HTMLInputElement).type === "checkbox" || (input as HTMLInputElement).type === "radio")) type = "checkbox";
    else if (tagName === "input" || tagName === "textarea") type = "input";
    else if (tagName === "select") type = "select";
    else if (tagName === "a") type = "link";
    else if (tagName === "button" || el.getAttribute("role") === "button") type = "button";
    return {
      selector,
      selectorType: "css" as const,
      target: candidate.replace(/\s+/g, " ").trim().slice(0, 80),
      tagName,
      type,
      value: "value" in input ? String(input.value || "") : "",
      bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  }, point);
}

export async function performRecordingAction(
  sessionId: string,
  action: "click" | "fill" | "select" | "hover" | "check" | "uncheck" | "assert",
  selector: string,
  value = "",
  target = "",
  tagName = "",
  x?: number,
  y?: number,
): Promise<{ event: RecordedEvent; snapshot: Awaited<ReturnType<typeof getRecordingSnapshot>> | null }> {
  const session = sessions.get(sessionId);
  const ref = pageRefs.get(sessionId);
  if (!session || !ref || ref.page.isClosed()) throw new Error("Session not found");
  if (session.status !== "recording") throw new Error("请先开始录制，再添加页面操作");
  if (!selector.trim()) throw new Error("元素选择器不能为空");

  touchSession(sessionId); // 手动页面操作视为活跃

  await ref.page.evaluate(() => { (window as any).__recorderManualAction = true; });
  try {
    const locator = ref.page.locator(selector).first();
    if (action === "click" && Number.isFinite(x) && Number.isFinite(y)) await ref.page.mouse.click(Number(x), Number(y));
    else if (action === "click") await locator.click({ noWaitAfter: true, timeout: 10000 });
    else if (action === "fill") await locator.fill(value, { timeout: 10000 });
    else if (action === "select") await locator.selectOption(value, { timeout: 10000 });
    else if (action === "hover") await locator.hover({ timeout: 10000 });
    else if (action === "check") await locator.check({ timeout: 10000 });
    else if (action === "uncheck") await locator.uncheck({ timeout: 10000 });
    else await locator.waitFor({ state: "visible", timeout: 10000 });
  } finally {
    try { await ref.page.evaluate(() => { delete (window as any).__recorderManualAction; }); } catch {}
  }

  const event: RecordedEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    action,
    target: target || selector,
    selector,
    selectorType: "css",
    value,
    tagName,
    pageUrl: ref.page.url(),
  };
  session.events.push(event);
  let snapshot: Awaited<ReturnType<typeof getRecordingSnapshot>> | null = null;
  try { snapshot = await getRecordingSnapshot(sessionId); } catch {}
  return { event, snapshot };
}

async function flushPendingEvents(sessionId: string): Promise<void> {
  const ref = pageRefs.get(sessionId);
  if (ref && !ref.page.isClosed()) {
    try {
      await ref.page.evaluate(async () => {
        const recorderWindow = window as typeof window & { __recorderFlushNow?: () => Promise<void> };
        await recorderWindow.__recorderFlushNow?.();
      });
    } catch (error) {
      console.warn("[Recorder] 停止前刷新输入事件失败:", error instanceof Error ? error.message : error);
    }
  }
}

export async function stopRecording(sessionId: string): Promise<{ events: RecordedEvent[] }> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  await flushPendingEvents(sessionId);
  session.status = "stopped";
  return { events: [...session.events] };
}

export async function pauseRecording(sessionId: string): Promise<{ status: "paused" }> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "recording") throw new Error("Session is not recording");
  await flushPendingEvents(sessionId);
  session.status = "paused";
  return { status: "paused" };
}

export function resumeRecording(sessionId: string): { status: "recording" } {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status !== "paused") throw new Error("Session is not paused");
  session.status = "recording";
  return { status: "recording" };
}

export function getRecordingSession(sessionId: string): RecordingSession | undefined {
  return sessions.get(sessionId);
}

export async function closeRecording(sessionId: string): Promise<void> {
  const ref = pageRefs.get(sessionId);
  if (ref) {
    try { await ref.page.close(); } catch {}
    try { await ref.context.close(); } catch {}
    pageRefs.delete(sessionId);
  }
  sessions.delete(sessionId);
  lastActive.delete(sessionId);
}

/** 关闭全部录制会话（优雅停机用），尽力清理，单个失败不影响其他 */
export async function closeAllSessions(): Promise<void> {
  const ids = new Set<string>([...sessions.keys(), ...pageRefs.keys()]);
  await Promise.all([...ids].map((sessionId) => closeRecording(sessionId).catch(() => { /* 尽力清理 */ })));
  lastActive.clear();
}

import { Router } from "express";
import {
  visitPage,
  startCapture,
  receiveRecordingEvents,
  getRecordingEvents,
  stopRecording,
  pauseRecording,
  resumeRecording,
  getRecordingSession,
  getRecordingSnapshot,
  inspectRecordingPoint,
  performRecordingAction,
  closeRecording,
} from "../recorder.js";

const router = Router();

function recorderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ERR_NAME_NOT_RESOLVED")) return "域名无法解析，请检查 URL 或网络连接";
  if (message.includes("ERR_CONNECTION_REFUSED")) return "目标服务器拒绝连接，请确认地址和端口已启动";
  if (message.includes("ERR_CONNECTION_TIMED_OUT")) return "连接目标服务器超时";
  if (message.includes("ERR_UNSAFE_PORT")) return "该端口被 Chromium 安全策略禁止，请更换目标服务端口";
  if (message.includes("ERR_INTERNET_DISCONNECTED")) return "当前网络不可用";
  if (message.includes("ERR_NETWORK_ACCESS_DENIED")) return "录制服务没有访问该网络地址的权限，请检查服务网络权限或内网访问策略";
  if (message.includes("Executable doesn't exist")) return "录制浏览器未安装，请先安装 Playwright Chromium";
  return message;
}

function getApiBase(req: any): string {
  const protocol = req.protocol;
  const host = req.get("host") || "localhost:3001";
  return `${protocol}://${host}`;
}

/** POST /api/recorder/visit — 仅访问页面，不开始录制 */
router.post("/visit", async (req, res) => {
  try {
    const { url, headless = false } = req.body;
    if (!url) {
      res.status(400).json({ error: "url is required" });
      return;
    }
    const { sessionId, warning } = await visitPage(url, headless, getApiBase(req));
    res.json({ sessionId, status: "browsing", warning });
  } catch (err: any) {
    console.error("recorder visit error:", err.message);
    res.status(500).json({ error: recorderError(err) });
  }
});

/** POST /api/recorder/pause/:sessionId */
router.post("/pause/:sessionId", async (req, res) => {
  try { res.json(await pauseRecording(req.params.sessionId)); }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "pause failed" }); }
});

/** POST /api/recorder/resume/:sessionId */
router.post("/resume/:sessionId", (req, res) => {
  try { res.json(resumeRecording(req.params.sessionId)); }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "resume failed" }); }
});

/** POST /api/recorder/start/:sessionId — 对已有会话开始录制 */
router.post("/start/:sessionId", async (req, res) => {
  try {
    const result = await startCapture(req.params.sessionId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/recorder/report/:sessionId — 浏览器回传事件（由注入脚本调用） */
router.post("/report/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const { events } = req.body;
    if (!Array.isArray(events)) {
      res.status(400).json({ error: "events array required" });
      return;
    }
    const result = receiveRecordingEvents(sessionId, events);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/recorder/events/:sessionId — 获取增量事件 */
router.get("/events/:sessionId", (req, res) => {
  const session = getRecordingSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  const since = req.query.since ? parseInt(req.query.since as string, 10) : undefined;
  const events = getRecordingEvents(req.params.sessionId, since);
  res.json({ sessionId: session.sessionId, status: session.status, events, url: session.url, warning: session.warning });
});

/** GET /api/recorder/snapshot/:sessionId — 内嵌录制画布截图 */
router.get("/snapshot/:sessionId", async (req, res) => {
  try { res.json(await getRecordingSnapshot(req.params.sessionId)); }
  catch (err) { res.status(404).json({ error: err instanceof Error ? err.message : "snapshot failed" }); }
});

/** POST /api/recorder/inspect/:sessionId — 按画布坐标探测元素 */
router.post("/inspect/:sessionId", async (req, res) => {
  try {
    const element = await inspectRecordingPoint(req.params.sessionId, Number(req.body?.x), Number(req.body?.y));
    res.json({ element });
  } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "inspect failed" }); }
});

/** POST /api/recorder/action/:sessionId — 在录制页面执行手动操作并写入步骤 */
router.post("/action/:sessionId", async (req, res) => {
  try {
    const allowed = new Set(["click", "fill", "select", "hover", "check", "uncheck", "assert"]);
    const action = String(req.body?.action || "");
    if (!allowed.has(action)) { res.status(400).json({ error: "不支持的页面操作" }); return; }
    const result = await performRecordingAction(
      req.params.sessionId,
      action as "click" | "fill" | "select" | "hover" | "check" | "uncheck" | "assert",
      String(req.body?.selector || ""),
      String(req.body?.value || ""),
      String(req.body?.target || ""),
      String(req.body?.tagName || ""),
      Number(req.body?.x),
      Number(req.body?.y),
    );
    res.json(result);
  } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "页面操作失败" }); }
});

/** POST /api/recorder/stop/:sessionId — 停止录制 */
router.post("/stop/:sessionId", async (req, res) => {
  try {
    const result = await stopRecording(req.params.sessionId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/recorder/close/:sessionId — 关闭会话 */
router.post("/close/:sessionId", async (req, res) => {
  try {
    await closeRecording(req.params.sessionId);
    res.json({ status: "closed" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/recorder/test-events/:sessionId — 在页面内触发真实 DOM 事件 */
router.post("/test-events/:sessionId", async (req, res) => {
  try {
    const mod = await import("../recorder.js");
    const pageRefs = (mod as any)._pageRefs;
    const ref = pageRefs?.get(req.params.sessionId);
    if (!ref) { res.status(404).json({ error: "no page ref" }); return; }

    // 通过 page.evaluate 在页面内部触发真实 DOM 事件
    const result = await ref.page.evaluate(() => {
      const results: any[] = [];

      // 找第一个有 id 的元素（跳过 body/html/document）
      const allWithId = Array.from(document.querySelectorAll('[id]')).filter(
        (el: any) => !['body','html','document'].includes(el.tagName.toLowerCase())
      );

      if (allWithId.length > 0) {
        // 派发 click 到第一个有 id 的元素
        const target = allWithId[0] as HTMLElement;
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        results.push({ action: "click", ok: true, tag: target.tagName, id: target.id });
      } else {
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        results.push({ action: "click", ok: true, tag: "body", id: "(none)" });
      }

      // 找第一个 input 进行 fill
      const input: any = document.querySelector('input, textarea');
      if (input) {
        input.value = "test@example.com";
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        results.push({ action: "fill", ok: true, tag: input.tagName, id: input.id || "(none)" });
      } else {
        results.push({ action: "fill", ok: false, reason: "no input found" });
      }

      return { results };
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

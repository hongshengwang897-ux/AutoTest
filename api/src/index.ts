import express from "express";
import type { Server } from "node:http";
import cors from "cors";
// 初始化 SQLite 数据库（导入即触发建表 + 播种）
import "./data/db.js";
import { closeDb } from "./data/db.js";
import {
  openPage,
  scanPageElements,
  receiveReport,
  closePage,
  getSession,
  getSessionElements,
  closeAllSessions as closeAllAutoDetectSessions,
} from "./browser.js";
import type { DetectedElement } from "./types.js";

// Route modules
import casesRouter from "./routes/cases.js";
import executionsRouter from "./routes/executions.js";
import reportsRouter from "./routes/reports.js";
import elementsRouter from "./routes/elements.js";
import environmentsRouter from "./routes/environments.js";
import schedulesRouter from "./routes/schedules.js";
import alertsRouter from "./routes/alerts.js";
import statsRouter from "./routes/stats.js";
import settingsRouter from "./routes/settings.js";
import recorderRouter from "./routes/recorder.js";
import modulesRouter from "./routes/modules.js";
import apiTestsRouter from "./routes/api-tests.js";
import performanceTestsRouter from "./routes/performance-tests.js";
import campaignsRouter from "./routes/campaigns.js";
import { markInterruptedExecutions } from "./case-execution.js";
import { markInterruptedPerformanceRuns } from "./performance-runner.js";
import { initializeScheduler, shutdownScheduler } from "./scheduler.js";
import { registerOpenApiDocs } from "./openapi.js";
import { closeAllSessions as closeAllRecordingSessions } from "./recorder.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// 前端错误上报（无需认证）
app.post("/api/errors", (req, res) => {
  const { message, stack, pathname } = req.body || {};
  if (message) {
    console.error(`[FE Error] ${pathname || "/"}: ${message}`);
    if (stack) console.error(`  ${stack.split("\n").slice(0, 5).join("\n  ")}`);
  }
  res.status(204).send("");
});

// ---- Core CRUD Routes ----

app.use("/api/cases", casesRouter);
app.use("/api/executions", executionsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/elements", elementsRouter);
app.use("/api/environments", environmentsRouter);
app.use("/api/schedules", schedulesRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/stats", statsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/recorder", recorderRouter);
app.use("/api/modules", modulesRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/api-tests", apiTestsRouter);
app.use("/api/performance-tests", performanceTestsRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "auto-detect-api", timestamp: new Date().toISOString() });
});

// 需要脱敏的敏感请求头（避免回显 Cookie/Authorization 等凭据）
const SENSITIVE_HEADERS = new Set(["cookie", "authorization", "set-cookie", "x-api-key", "proxy-authorization"]);

app.all("/api/echo", (req, res) => {
  const headers: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? "***" : value;
  }
  res.json({
    method: req.method,
    query: req.query,
    headers,
    body: req.body ?? null,
  });
});

// ---- Auto-Detect Routes ----

/** POST /api/auto-detect/open — launch browser, navigate to URL, inject floating button */
app.post("/api/auto-detect/open", async (req, res) => {
  try {
    const { url, headless = false } = req.body;
    if (!url) {
      res.status(400).json({ error: "url is required" });
      return;
    }

    const protocol = req.protocol;
    const host = req.get("host") || `localhost:${PORT}`;
    const apiBaseUrl = `${protocol}://${host}`;

    const { sessionId } = await openPage(url, headless, apiBaseUrl);
    res.json({ sessionId, status: "ready" });
  } catch (err: any) {
    console.error("open error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/auto-detect/scan/:sessionId */
app.post("/api/auto-detect/scan/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await scanPageElements(sessionId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/auto-detect/report/:sessionId */
app.post("/api/auto-detect/report/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const { elements } = req.body as { elements: DetectedElement[] };
    if (!Array.isArray(elements)) {
      res.status(400).json({ error: "elements array required" });
      return;
    }
    const result = receiveReport(sessionId, elements);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/auto-detect/status/:sessionId */
app.get("/api/auto-detect/status/:sessionId", (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  res.json({
    sessionId: session.sessionId,
    url: session.url,
    status: session.status,
    elementCount: session.elements.length,
  });
});

/** GET /api/auto-detect/elements/:sessionId */
app.get("/api/auto-detect/elements/:sessionId", (req, res) => {
  const elems = getSessionElements(req.params.sessionId);
  res.json({ elements: elems });
});

/** POST /api/auto-detect/close/:sessionId */
app.post("/api/auto-detect/close/:sessionId", async (req, res) => {
  try {
    await closePage(req.params.sessionId);
    res.json({ status: "closed" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- OpenAPI 文档注册（在所有路由注册之后） ----
registerOpenApiDocs(app);

// ---- 全局错误处理中间件（必须注册在所有路由之后，才能捕获路由冒出的错误与 JSON 解析错误） ----
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const error = err as { status?: number; message?: string; stack?: string };
  console.error("[Unhandled Error]", error.stack || error.message || String(error));
  const statusCode = (error.status && error.status >= 400 && error.status < 500) ? error.status : 500;
  res.status(statusCode).json({
    error: statusCode === 500 ? "Internal Server Error" : error.message || "Error",
  });
});

const server: Server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[API] Server listening on 0.0.0.0:${PORT}`);
  console.log(`  Routes: /api/cases, /api/executions, /api/reports, /api/elements`);
  console.log(`  Routes: /api/environments, /api/schedules, /api/alerts, /api/stats`);
  console.log(`  Routes: /api/auto-detect/*, /api/settings, /api/modules, /api/api-tests, /api/performance-tests`);
  // 启动兜底：重启前卡住的执行记录标记为失败（内存队列已丢失）
  markInterruptedExecutions();
  markInterruptedPerformanceRuns();
  initializeScheduler();
});

// ---- 优雅停机 ----
const SHUTDOWN_TIMEOUT_MS = 5000;
let shuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return; // 防止重复触发（如连按两次 Ctrl+C）
  shuttingDown = true;
  console.log(`[API] 收到 ${signal}，开始优雅停机...`);

  // 1. 停止定时调度器，避免停机期间再触发新任务
  try { shutdownScheduler(); } catch (error) {
    console.error("[API] 停止调度器失败:", error instanceof Error ? error.message : error);
  }

  // 2. 停止接收新请求，等待在途请求结束（最多 SHUTDOWN_TIMEOUT_MS，之后强制退出）
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(forcedTimer);
      resolve();
    };
    const forcedTimer = setTimeout(() => {
      console.warn(`[API] 等待在途请求超时（${SHUTDOWN_TIMEOUT_MS / 1000} 秒），强制关闭`);
      finish();
    }, SHUTDOWN_TIMEOUT_MS);
    forcedTimer.unref();
    server.close(() => finish());
    // 关闭空闲的 keep-alive 连接，让 close 回调不必等空闲连接超时
    server.closeIdleConnections();
  });

  // 3. 尽力关闭活动的浏览器/录制会话（Playwright context/page）
  try { await closeAllAutoDetectSessions(); } catch (error) {
    console.error("[API] 关闭 auto-detect 会话失败:", error instanceof Error ? error.message : error);
  }
  try { await closeAllRecordingSessions(); } catch (error) {
    console.error("[API] 关闭录制会话失败:", error instanceof Error ? error.message : error);
  }

  // 4. 关闭数据库（WAL 落盘）后退出
  try { closeDb(); } catch (error) {
    console.error("[API] 关闭数据库失败:", error instanceof Error ? error.message : error);
  }
  process.exit(0);
}

process.on("SIGINT", () => { void gracefulShutdown("SIGINT"); });
process.on("SIGTERM", () => { void gracefulShutdown("SIGTERM"); });

import { exec, get, insert, query, remove, update, now } from "./data/db.js";
import { executeCase, wrapScript } from "./execution-engine.js";
import type { ExecutionResult, VisualBaseline } from "./execution-engine.js";
import { deliverExecutionAlerts } from "./alert-delivery.js";
import { randomBytes } from "node:crypto";

/** 安全触发 fire-and-forget 异步任务：任何异常只记日志，避免 unhandledRejection 崩溃进程 */
function safeVoid(promise: Promise<unknown>, label: string): void {
  promise.catch((error) => {
    console.error(`[${label}]`, error instanceof Error ? (error.stack || error.message) : error);
  });
}

interface ExecutionSettings {
  maxConcurrency: number;
  defaultTimeout: number;
  retryOnFailure: boolean;
  maxRetries: number;
  screenshotOnFailure: boolean;
}

interface PendingJob {
  execId: string;
  item: Record<string, any>;
  executionScript: string;
  visualBaselines: Record<string, VisualBaseline>;
  baseUrl: string;
  controller: AbortController;
  /** 批量执行批次 ID：批次内所有用例完成时由批次统一推送一次汇总 */
  batchId?: string;
}

interface PreparedCaseExecution {
  item: Record<string, any>;
  executionScript: string;
  visualBaselines: Record<string, VisualBaseline>;
  baseUrl: string;
}

export interface LocalExecutionJob {
  executionId: string;
  token: string;
  caseId: string;
  caseName: string;
  script: string;
  baseUrl: string;
  reportUrl: string;
  options: {
    timeoutMs: number;
    screenshotOnFailure: boolean;
    retryOnFailure: boolean;
    maxRetries: number;
    visualBaselines: Record<string, VisualBaseline>;
  };
}

function casePreconditionIds(item: Record<string, any>): string[] {
  const value = item.precondition_case_ids;
  let ids: unknown[] = [];
  if (Array.isArray(value)) ids = value;
  else if (typeof value === "string" && value) {
    try { ids = JSON.parse(value); } catch { ids = []; }
  }
  const normalized = ids.map(String).filter(Boolean);
  if (normalized.length === 0 && item.precondition_case_id) normalized.push(String(item.precondition_case_id));
  return normalized;
}

function resolveCaseChain(item: Record<string, any>): Record<string, any>[] {
  const chain: Record<string, any>[] = [];
  const visiting = new Set<string>();
  const completed = new Set<string>();

  const visit = (current: Record<string, any>) => {
    if (visiting.has(current.id)) throw new CaseExecutionError("前置用例存在循环引用", 400);
    if (completed.has(current.id)) return;
    visiting.add(current.id);
    for (const preconditionCaseId of casePreconditionIds(current)) {
      const precondition = get("cases", preconditionCaseId);
      if (!precondition) throw new CaseExecutionError(`前置用例不存在: ${preconditionCaseId}`, 400);
      visit(precondition);
    }
    if (!current.script) throw new CaseExecutionError(`用例“${current.name}”无脚本内容`, 400);
    visiting.delete(current.id);
    completed.add(current.id);
    chain.push(current);
  };

  visit(item);
  return chain;
}

function buildExecutionScript(chain: Record<string, any>[]): string {
  const lines = [
    "import { test, expect } from '@playwright/test';",
    "",
    `test(${JSON.stringify(chain[chain.length - 1].name)}, async ({ page }) => {`,
  ];
  chain.forEach((caseItem, index) => {
    const stage = index < chain.length - 1 ? `前置用例 ${index + 1}/${chain.length - 1}` : "当前用例";
    lines.push(`  console.log(${JSON.stringify(`[${stage}] 开始: ${caseItem.name}`)});`);
    lines.push(wrapScript(String(caseItem.script)));
    lines.push(`  console.log(${JSON.stringify(`[${stage}] 完成: ${caseItem.name}`)});`);
  });
  lines.push("});");
  return lines.join("\n");
}

function buildVisualBaselines(chain: Record<string, any>[]): Record<string, VisualBaseline> {
  const baselines: Record<string, VisualBaseline> = {};
  for (const caseItem of chain) {
    const steps = Array.isArray(caseItem.steps_json) ? caseItem.steps_json : [];
    for (const step of steps) {
      if (step?.action !== "assert" || step?.assertionType !== "image") continue;
      if (!step.expectedImage) throw new CaseExecutionError(`图片断言“${step.description || step.id}”未上传基准截图`, 400);
      baselines[String(step.id)] = {
        image: String(step.expectedImage),
        similarityThreshold: Number(step.imageSimilarityThreshold) || 99,
      };
    }
  }
  return baselines;
}

const activeExecutions = new Map<string, AbortController>();
const pendingJobs: PendingJob[] = [];
let runningCount = 0;

/**
 * 服务重启兜底：进程退出后，内存队列丢失，残留的 pending/running 记录永远无法完成。
 * 启动时把所有卡住的执行（UI 用例 + 接口集合 + 接口用例）标记为失败，并清空本地执行令牌。
 */
export function markInterruptedExecutions(): void {
  const ts = now();
  exec(
    "UPDATE executions SET status = 'failed', end_time = ?, error_message = '服务重启，执行已中断' WHERE status IN ('pending', 'running')",
    ts
  );
  // api_collection_runs 已通过迁移补 error_message 列
  exec(
    "UPDATE api_collection_runs SET status = 'failed', ended_at = ?, error_message = '服务重启，执行已中断' WHERE status IN ('pending', 'running')",
    ts
  );
  // api_executions 已通过迁移补 ended_at 列
  exec(
    "UPDATE api_executions SET status = 'failed', ended_at = ?, error_message = '服务重启，执行已中断' WHERE status IN ('pending', 'running')",
    ts
  );
  exec("UPDATE executions SET runner_token = '' WHERE runner_token IS NOT NULL AND runner_token != ''");
}

export class CaseExecutionError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function readSetting<T>(key: string, fallback: T): T {
  const row = query("SELECT value FROM settings WHERE key = ?", key)[0];
  if (!row) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return fallback; }
}

function getExecutionSettings(): ExecutionSettings {
  return {
    maxConcurrency: Math.max(1, readSetting("maxConcurrency", 5)),
    defaultTimeout: Math.max(1000, readSetting("defaultTimeout", 60000)),
    retryOnFailure: readSetting("retryOnFailure", true),
    maxRetries: Math.max(0, readSetting("maxRetries", 2)),
    screenshotOnFailure: readSetting("screenshotOnFailure", true),
  };
}

function prepareCaseExecution(caseId: string, environmentId?: string): PreparedCaseExecution {
  const item = get("cases", caseId);
  if (!item) throw new CaseExecutionError("用例不存在", 404);
  const caseChain = resolveCaseChain(item);
  const executionScript = buildExecutionScript(caseChain);
  const visualBaselines = buildVisualBaselines(caseChain);

  let baseUrl = "";
  const selectedEnvironmentId = environmentId || item.environment_id;
  if (selectedEnvironmentId) {
    const environment = get("environments", selectedEnvironmentId);
    if (environment && (environment.scope || "platform") !== "platform") {
      throw new CaseExecutionError("所选环境不是平台用例环境", 400);
    }
    if (environment) baseUrl = environment.url || "";
  }
  if (!baseUrl) {
    const gotoMatch = String(item.script).match(/page\.goto\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (gotoMatch) {
      try { baseUrl = new URL(gotoMatch[1]).origin; } catch { /* relative URL */ }
    }
  }
  if (!baseUrl) baseUrl = "about:blank";
  return { item, executionScript, visualBaselines, baseUrl };
}

export function queueCaseExecution(caseId: string, environmentId?: string, batchId?: string): { id: string; status: "pending" | "running" } {
  const { item, executionScript, visualBaselines, baseUrl } = prepareCaseExecution(caseId, environmentId);

  const execId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const willStart = runningCount < getExecutionSettings().maxConcurrency;
  insert("executions", {
    id: execId,
    case_id: item.id,
    case_name: item.name,
    status: willStart ? "running" : "pending",
    start_time: willStart ? now() : null,
    logs: "[]",
    steps: "[]",
    screenshots: "[]",
  });

  pendingJobs.push({ execId, item, executionScript, visualBaselines, baseUrl, controller: new AbortController(), batchId });
  drainQueue();
  return { id: execId, status: willStart ? "running" : "pending" };
}

// ---- UI 批量执行（批次）跟踪：批次内所有用例完成时只推送一次汇总，单条执行不推送 ----
const batches = new Map<string, { name: string; total: number; done: number; pass: number; fail: number }>();

function recordBatchResult(batchId: string | undefined, status: string): void {
  if (!batchId) return;
  const batch = batches.get(batchId);
  if (!batch) return;
  batch.done++;
  if (status === "success") batch.pass++;
  else batch.fail++;
  if (batch.done >= batch.total) {
    batches.delete(batchId);
    const finalStatus = batch.fail === 0 ? "success" : "failed";
    safeVoid(deliverExecutionAlerts(
      "ui",
      batch.name,
      finalStatus,
      batch.fail > 0 ? `${batch.fail} 条失败` : "",
      { total: batch.total, pass: batch.pass, fail: batch.fail },
    ), "Alert");
  }
}

/** 批量执行：把一组用例入队，全部完成后推送一条汇总（单条不推） */
export function queueBatchExecution(caseIds: string[], environmentId?: string, name = "批量执行"): { batchId: string; total: number; failed: number } {
  const ids = caseIds.map(String).filter(Boolean);
  const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  batches.set(batchId, { name, total: ids.length, done: 0, pass: 0, fail: 0 });
  let failed = 0;
  for (const caseId of ids) {
    try {
      queueCaseExecution(caseId, environmentId, batchId);
    } catch {
      // 入队失败（用例不存在/无脚本/循环依赖）也计入批次失败
      failed++;
      recordBatchResult(batchId, "failed");
    }
  }
  return { batchId, total: ids.length, failed };
}

export function createLocalCaseExecution(
  caseId: string,
  reportBaseUrl: string,
  environmentId?: string
): LocalExecutionJob {
  const { item, executionScript, visualBaselines, baseUrl } = prepareCaseExecution(caseId, environmentId);
  const settings = getExecutionSettings();
  const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const token = randomBytes(24).toString("hex");
  insert("executions", {
    id: executionId,
    case_id: item.id,
    case_name: item.name,
    status: "running",
    start_time: now(),
    logs: JSON.stringify([{
      timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      level: "info",
      message: "等待访问者电脑上的本地执行器",
    }]),
    steps: "[]",
    screenshots: "[]",
    runner_token: token,
  });
  return {
    executionId,
    token,
    caseId: item.id,
    caseName: item.name,
    script: executionScript,
    baseUrl,
    reportUrl: `${reportBaseUrl.replace(/\/$/, "")}/api/executions/${executionId}/local-result`,
    options: {
      timeoutMs: settings.defaultTimeout,
      screenshotOnFailure: settings.screenshotOnFailure,
      retryOnFailure: settings.retryOnFailure,
      maxRetries: settings.maxRetries,
      visualBaselines,
    },
  };
}

export function completeLocalCaseExecution(
  executionId: string,
  token: string,
  result: ExecutionResult,
  runnerName = "本地执行器"
): { id: string; status: string } {
  const execution = get("executions", executionId);
  if (!execution) throw new CaseExecutionError("执行记录不存在", 404);
  if (!token || token !== execution.runner_token) throw new CaseExecutionError("本地执行报告令牌无效", 403);
  if (!result || !["pass", "fail"].includes(result.status)) throw new CaseExecutionError("本地执行结果格式无效", 400);

  const item = get("cases", execution.case_id) || { id: execution.case_id, name: execution.case_name };
  const status = result.status === "pass" ? "success" : "failed";
  const endTime = now();
  const logs = [
    { timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }), level: "info", message: `执行节点: ${runnerName}` },
    ...(Array.isArray(result.logs) ? result.logs : []).map((log) => ({
      timestamp: new Date(log.timestamp).toLocaleTimeString("zh-CN", { hour12: false }),
      level: log.level,
      message: log.message,
    })),
  ];
  update("executions", executionId, {
    status,
    duration: Number(result.duration) || 0,
    end_time: endTime,
    logs: JSON.stringify(logs),
    steps: JSON.stringify(Array.isArray(result.steps) ? result.steps : []),
    error_message: result.error || null,
    screenshots: JSON.stringify(result.screenshot ? [result.screenshot] : []),
    runner_token: "",
  });
  persistReport(executionId, item, status, endTime);
  // 本地执行器单条结果：按规则「单条不推送」，仅批量执行完成才推送汇总
  return { id: executionId, status };
}

export function refreshExecutionQueue() {
  drainQueue();
}

function drainQueue() {
  const settings = getExecutionSettings();
  while (pendingJobs.length > 0 && runningCount < settings.maxConcurrency) {
    const job = pendingJobs.shift()!;
    if (job.controller.signal.aborted) continue;
    runningCount++;
    activeExecutions.set(job.execId, job.controller);
    update("executions", job.execId, { status: "running", start_time: now() });
    // runExecution 内部 catch 里的 update/persistReport 再抛错时也不能逃逸成 unhandledRejection
    safeVoid(
      runExecution(job, settings).finally(() => {
        runningCount--;
        activeExecutions.delete(job.execId);
        drainQueue();
      }),
      "CaseExecution"
    );
  }
}

async function runExecution(job: PendingJob, settings: ExecutionSettings) {
  const { execId, item, executionScript, visualBaselines, baseUrl, controller } = job;
  try {
    let result = await executeCase(executionScript, item.name, baseUrl, controller.signal, {
      timeoutMs: settings.defaultTimeout,
      screenshotOnFailure: settings.screenshotOnFailure,
      visualBaselines,
    });
    const retryLimit = settings.retryOnFailure ? settings.maxRetries : 0;
    for (let attempt = 1; result.status === "fail" && !controller.signal.aborted && attempt <= retryLimit; attempt++) {
      result = await executeCase(executionScript, `${item.name}（重试 ${attempt}/${retryLimit}）`, baseUrl, controller.signal, {
        timeoutMs: settings.defaultTimeout,
        screenshotOnFailure: settings.screenshotOnFailure,
        visualBaselines,
      });
      result.logs.unshift({ timestamp: new Date().toISOString(), level: "warn", message: `失败后第 ${attempt} 次重试` });
    }

    const logs = result.logs.map((log) => ({
      timestamp: new Date(log.timestamp).toLocaleTimeString("zh-CN", { hour12: false }),
      level: log.level,
      message: log.message,
    }));
    const screenshots = result.screenshot ? [result.screenshot] : [];
    // 取消竞态修复：以引擎返回的实际结果为准。
    // 只有当 Promise.race 的胜出者是 abort（引擎在结果上标记 cancelled）时才写 cancelled；
    // 若 race 胜出者是执行结果（例如取消发生在结果已产生之后），则如实写执行结果。
    const cancelled = result.cancelled === true;
    const status = cancelled ? "cancelled" : result.status === "pass" ? "success" : "failed";
    const endTime = now();
    update("executions", execId, {
      status,
      duration: result.duration,
      end_time: endTime,
      logs: JSON.stringify(logs),
      steps: JSON.stringify(result.steps),
      error_message: result.error || null,
      screenshots: JSON.stringify(screenshots),
    });
    persistReport(execId, item, status, endTime);
    recordBatchResult(job.batchId, status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cancelled = controller.signal.aborted;
    const status = cancelled ? "cancelled" : "failed";
    const endTime = now();
    update("executions", execId, {
      status,
      end_time: endTime,
      error_message: message,
      logs: JSON.stringify([{
        timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        level: cancelled ? "warn" : "error",
        message: cancelled ? `执行已取消: ${message}` : `执行异常: ${message}`,
      }]),
    });
    persistReport(execId, item, status, endTime);
    recordBatchResult(job.batchId, status);
  }
}

function persistReport(execId: string, item: Record<string, any>, status: string, endTime: string) {
  const execution = get("executions", execId);
  if (!execution) return;
  remove("reports", execId);
  insert("reports", {
    id: execId,
    execution_id: execId,
    case_id: item.id,
    case_name: item.name,
    status,
    start_time: execution.start_time,
    end_time: endTime,
    duration: execution.duration || null,
    error_message: execution.error_message || null,
    steps: JSON.stringify(execution.steps || []),
    screenshots: JSON.stringify(execution.screenshots || []),
    logs: JSON.stringify(execution.logs || []),
    created_at: endTime,
  });
}

export function cancelCaseExecutions(caseId: string): { found: number; cancelled: number } {
  // 只用 SQL 查询所需列（id/case_id/status），避免把全部执行记录（含每条 base64 截图、全部日志）JSON.parse 进内存
  const cancellable = query(
    "SELECT id, case_id, status FROM executions WHERE case_id = ? AND status IN ('running', 'pending')",
    caseId
  );
  let cancelled = 0;
  for (const execution of cancellable) {
    const active = activeExecutions.get(execution.id);
    if (active) {
      active.abort();
      cancelled++;
      continue;
    }
    const index = pendingJobs.findIndex((job) => job.execId === execution.id);
    if (index >= 0) {
      const [job] = pendingJobs.splice(index, 1);
      job.controller.abort();
      const endTime = now();
      update("executions", execution.id, { status: "cancelled", end_time: endTime, error_message: "排队执行已取消" });
      persistReport(execution.id, job.item, "cancelled", endTime);
      cancelled++;
    }
  }
  return { found: cancellable.length, cancelled };
}

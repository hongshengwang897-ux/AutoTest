import { Router } from "express";
import { all, get, insert, query, remove, update, createId, now } from "../data/db.js";
import { cancelPerformanceRun, queuePerformanceRun } from "../performance-runner.js";
import { checkProxyPoolAvailability } from "../proxy-pool.js";
import { readPaging } from "./shared.js";

const router = Router();

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const BODY_TYPES = new Set(["none", "json", "text", "form"]);
const ASSERTION_SOURCES = new Set(["status", "body", "header", "json"]);
const ASSERTION_OPERATORS = new Set(["equals", "not_equals", "contains", "not_contains", "exists", "not_exists", "matches", "greater_than", "less_than"]);

function legacyHeaderItems(value: unknown) {
  return String(value || "").split(/\r?\n/).map((line, index) => {
    const separator = line.indexOf(":");
    if (separator < 1) return null;
    return { id: `legacy-header-${index}`, key: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim(), enabled: true };
  }).filter((item): item is { id: string; key: string; value: string; enabled: boolean } => Boolean(item?.key));
}

function keyValueItems(value: unknown, fieldName: string, requestIndex: number) {
  if (!Array.isArray(value)) return [];
  if (value.length > 100) throw new Error(`第 ${requestIndex + 1} 条手动接口的${fieldName}最多 100 条`);
  return value.map((item, index) => ({
    id: String(item?.id || `${fieldName}-${index}-${createId()}`),
    key: String(item?.key || ""),
    value: String(item?.value || ""),
    enabled: item?.enabled !== false,
  }));
}

function assertionItems(value: unknown, requestIndex: number) {
  if (!Array.isArray(value)) return [];
  if (value.length > 50) throw new Error(`第 ${requestIndex + 1} 条手动接口最多添加 50 条断言`);
  return value.map((item, index) => {
    const source = String(item?.source || "status");
    const operator = String(item?.operator || "equals");
    if (!ASSERTION_SOURCES.has(source)) throw new Error(`第 ${requestIndex + 1} 条手动接口的第 ${index + 1} 条断言对象无效`);
    if (!ASSERTION_OPERATORS.has(operator)) throw new Error(`第 ${requestIndex + 1} 条手动接口的第 ${index + 1} 条断言条件无效`);
    return { id: String(item?.id || `assert-${createId()}`), source, operator, target: String(item?.target || ""), expected: String(item?.expected || "") };
  });
}

function requestVariables(value: unknown, requestIndex: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(([key]) => key.trim());
  if (entries.length > 100) throw new Error(`第 ${requestIndex + 1} 条手动接口最多添加 100 个变量`);
  return Object.fromEntries(entries.map(([key, item]) => [key, String(item ?? "")]));
}

function normalizeCustomRequest(request: Record<string, unknown>, index: number, requireUrl: boolean) {
  const method = String(request?.method || "GET").toUpperCase();
  const url = String(request?.url || "").trim();
  if (requireUrl && !url) throw new Error(`第 ${index + 1} 条手动接口的 URL 不能为空`);
  if (!HTTP_METHODS.has(method)) throw new Error(`第 ${index + 1} 条手动接口的请求方法无效`);
  const bodyType = String(request?.bodyType || "none");
  if (!BODY_TYPES.has(bodyType)) throw new Error(`第 ${index + 1} 条手动接口的 Body 类型无效`);
  const headers = Array.isArray(request?.headers) ? keyValueItems(request.headers, "请求头", index) : legacyHeaderItems(request?.headersText);
  return {
    id: String(request?.id || `custom-${createId()}`),
    name: String(request?.name || `手动接口 ${index + 1}`).trim() || `手动接口 ${index + 1}`,
    method,
    url,
    headers,
    queryParams: keyValueItems(request?.queryParams, "请求参数", index),
    bodyType,
    body: String(request?.body || ""),
    assertions: assertionItems(request?.assertions, index),
    variables: requestVariables(request?.variables, index),
  };
}

function toScenario(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    targetType: row.target_type || "cases",
    targetIds: Array.isArray(row.target_ids) ? row.target_ids : [],
    customRequests: Array.isArray(row.custom_requests) ? row.custom_requests.map((request, index: number) => normalizeCustomRequest(request as Record<string, unknown>, index, false)) : [],
    collectionPath: row.collection_path || "",
    environmentId: row.environment_id || "",
    concurrency: Number(row.concurrency) || 1,
    executionMode: row.execution_mode === "samples" ? "samples" : "duration",
    sampleCount: Number(row.sample_count) || 1000,
    durationSeconds: Number(row.duration_seconds) || 1,
    rampUpSeconds: Number(row.ramp_up_seconds) || 0,
    timeoutMs: Number(row.timeout_ms) || 30000,
    thinkTimeMs: Number(row.think_time_ms) || 0,
    useProxyPool: Boolean(row.use_proxy_pool),
    successRateThreshold: Number(row.success_rate_threshold) || 0,
    p95ThresholdMs: Number(row.p95_threshold_ms) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 运行记录的标量统计列映射（列表契约字段；metrics/errors 等重字段只在详情/进度端点返回） */
function toRunStats(row: Record<string, unknown>) {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    scenarioName: row.scenario_name,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    duration: Number(row.duration) || 0,
    totalRequests: Number(row.total_requests) || 0,
    successfulRequests: Number(row.successful_requests) || 0,
    failedRequests: Number(row.failed_requests) || 0,
    bytesReceived: Number(row.bytes_received) || 0,
    bytesSent: Number(row.bytes_sent) || 0,
    avgResponseTime: Number(row.avg_response_time) || 0,
    minResponseTime: Number(row.min_response_time) || 0,
    maxResponseTime: Number(row.max_response_time) || 0,
    p50ResponseTime: Number(row.p50_response_time) || 0,
    p90ResponseTime: Number(row.p90_response_time) || 0,
    p95ResponseTime: Number(row.p95_response_time) || 0,
    p99ResponseTime: Number(row.p99_response_time) || 0,
    requestsPerSecond: Number(row.requests_per_second) || 0,
    errorRate: Number(row.error_rate) || 0,
    errorMessage: row.error_message || "",
    createdAt: row.created_at,
  };
}

// 列表 SELECT 的标量统计列（与 toRunStats 对应）
const RUN_STATS_COLUMNS = [
  "id", "scenario_id", "scenario_name", "status", "started_at", "ended_at", "duration",
  "total_requests", "successful_requests", "failed_requests", "bytes_received", "bytes_sent",
  "avg_response_time", "min_response_time", "max_response_time",
  "p50_response_time", "p90_response_time", "p95_response_time", "p99_response_time",
  "requests_per_second", "error_rate", "error_message", "created_at",
];

function toRun(row: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawConfig: Record<string, any> = row.config && typeof row.config === "object" ? (row.config as Record<string, any>) : {};
  const config = {
    ...rawConfig,
    targetType: rawConfig.targetType ?? rawConfig.target_type,
    targetIds: rawConfig.targetIds ?? rawConfig.target_ids ?? [],
    customRequests: [],
    collectionPath: rawConfig.collectionPath ?? rawConfig.collection_path ?? "",
    environmentId: rawConfig.environmentId ?? rawConfig.environment_id ?? "",
    executionMode: rawConfig.executionMode ?? rawConfig.execution_mode ?? "duration",
    sampleCount: rawConfig.sampleCount ?? rawConfig.sample_count ?? 1000,
    durationSeconds: rawConfig.durationSeconds ?? rawConfig.duration_seconds,
    rampUpSeconds: rawConfig.rampUpSeconds ?? rawConfig.ramp_up_seconds,
    timeoutMs: rawConfig.timeoutMs ?? rawConfig.timeout_ms,
    thinkTimeMs: rawConfig.thinkTimeMs ?? rawConfig.think_time_ms,
    useProxyPool: rawConfig.useProxyPool ?? rawConfig.use_proxy_pool ?? false,
    successRateThreshold: rawConfig.successRateThreshold ?? rawConfig.success_rate_threshold,
    p95ThresholdMs: rawConfig.p95ThresholdMs ?? rawConfig.p95_threshold_ms,
  };
  return {
    ...toRunStats(row),
    metrics: Array.isArray(row.metrics) ? row.metrics : [],
    errors: Array.isArray(row.errors) ? row.errors : [],
    statusCodes: row.status_codes && typeof row.status_codes === "object" ? row.status_codes : {},
    transactions: Array.isArray(row.transactions) ? row.transactions : [],
    slaResults: Array.isArray(row.sla_results) ? row.sla_results : [],
    config,
  };
}

function numberInRange(value: unknown, name: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${name}必须在 ${min} 到 ${max} 之间`);
  return Math.round(parsed);
}

function decimalInRange(value: unknown, name: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${name}必须在 ${min} 到 ${max} 之间`);
  return Math.round(parsed * 100) / 100;
}

function scenarioRow(body: Record<string, unknown>, existing?: Record<string, unknown>) {
  const name = String(body.name ?? existing?.name ?? "").trim();
  if (!name) throw new Error("场景名称不能为空");
  const targetType = String(body.targetType ?? existing?.target_type ?? "cases");
  if (!['cases', 'collection', 'custom'].includes(targetType)) throw new Error("压测目标类型无效");
  const targetIds = Array.isArray(body.targetIds) ? body.targetIds.map(String).filter(Boolean) : (Array.isArray(existing?.target_ids) ? existing.target_ids : []);
  const sourceCustomRequests = Array.isArray(body.customRequests) ? body.customRequests : (Array.isArray(existing?.custom_requests) ? existing.custom_requests : []);
  if (sourceCustomRequests.length > 50) throw new Error("单个场景最多添加 50 条手动接口");
  const customRequests = sourceCustomRequests.map((request, index: number) => normalizeCustomRequest(request as Record<string, unknown>, index, targetType === "custom"));
  const collectionPath = String(body.collectionPath ?? existing?.collection_path ?? "").trim();
  if (targetType === "cases" && targetIds.length === 0) throw new Error("请至少选择一个接口用例");
  if (targetType === "collection" && !collectionPath) throw new Error("请选择接口集合");
  if (targetType === "custom" && customRequests.length === 0) throw new Error("请至少添加一条手动接口");
  const environmentId = String(body.environmentId ?? existing?.environment_id ?? "");
  if (environmentId) {
    const environment = get("environments", environmentId);
    if (!environment) throw new Error("所选环境不存在");
    if ((environment.scope || "platform") !== "api") throw new Error("性能测试只能使用接口测试环境");
  }
  const executionMode = String(body.executionMode ?? existing?.execution_mode ?? "samples");
  if (!['duration', 'samples'].includes(executionMode)) throw new Error("执行方式无效");
  const timestamp = now();
  return {
    name,
    description: String(body.description ?? existing?.description ?? ""),
    target_type: targetType,
    target_ids: JSON.stringify(targetIds),
    custom_requests: JSON.stringify(customRequests),
    collection_path: collectionPath,
    environment_id: environmentId,
    concurrency: numberInRange(body.concurrency ?? existing?.concurrency ?? 10, "并发用户数", 1, 500),
    execution_mode: executionMode,
    sample_count: numberInRange(body.sampleCount ?? existing?.sample_count ?? 1000, "测试样本数", 1, 1000000),
    duration_seconds: numberInRange(body.durationSeconds ?? existing?.duration_seconds ?? 60, "持续时间", 1, 3600),
    ramp_up_seconds: numberInRange(body.rampUpSeconds ?? existing?.ramp_up_seconds ?? 0, "升压时间", 0, 3600),
    timeout_ms: numberInRange(body.timeoutMs ?? existing?.timeout_ms ?? 30000, "请求超时", 100, 120000),
    think_time_ms: numberInRange(body.thinkTimeMs ?? existing?.think_time_ms ?? 0, "思考时间", 0, 60000),
    use_proxy_pool: (body.useProxyPool ?? existing?.use_proxy_pool ?? false) ? 1 : 0,
    success_rate_threshold: decimalInRange(body.successRateThreshold ?? existing?.success_rate_threshold ?? 95, "成功率阈值", 0, 100),
    p95_threshold_ms: numberInRange(body.p95ThresholdMs ?? existing?.p95_threshold_ms ?? 2000, "P95 阈值", 1, 120000),
    updated_at: timestamp,
  };
}

router.get("/scenarios", (_req, res) => {
  const items = all("performance_scenarios").sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  res.json({ items: items.map(toScenario), total: items.length });
});

router.get("/proxy-pool/status", async (_req, res) => {
  res.json(await checkProxyPoolAvailability());
});

router.post("/scenarios", (req, res) => {
  try {
    const id = `perf-${createId()}`;
    const row = { id, ...scenarioRow(req.body || {}), created_at: now() };
    insert("performance_scenarios", row);
    res.status(201).json(toScenario(get("performance_scenarios", id) || row));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "创建性能场景失败" });
  }
});

router.get("/runs", (req, res) => {
  const scenarioId = String(req.query.scenarioId || "");
  const { page, limit, offset } = readPaging(req.query, 50, 200);

  // 过滤/分页下推到 SQL，列表只查标量统计列（metrics/errors 等重字段不进列表）
  const whereSql = scenarioId ? ` WHERE scenario_id = ?` : "";
  const params: unknown[] = scenarioId ? [scenarioId] : [];
  const total = ((query(`SELECT COUNT(*) as c FROM performance_runs${whereSql}`, ...params)[0] as Record<string, unknown>)?.c as number) || 0;
  const items = query(
    `SELECT ${RUN_STATS_COLUMNS.join(", ")} FROM performance_runs${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...params, limit, offset,
  ).map(toRunStats);

  res.json({ items, total, page, limit });
});

router.get("/runs/:id", (req, res) => {
  const row = get("performance_runs", req.params.id);
  if (!row) { res.status(404).json({ error: "性能测试报告不存在" }); return; }
  res.json(toRun(row));
});

router.get("/runs/:id/progress", (req, res) => {
  const row = get("performance_runs", req.params.id);
  if (!row) { res.status(404).json({ error: "性能测试执行记录不存在" }); return; }
  res.json(toRun(row));
});

router.post("/runs/:id/cancel", (req, res) => {
  const row = get("performance_runs", req.params.id);
  if (!row) { res.status(404).json({ error: "性能测试执行记录不存在" }); return; }
  if (!cancelPerformanceRun(req.params.id)) { res.status(409).json({ error: "该性能测试当前未在执行" }); return; }
  res.status(202).json({ ok: true });
});

router.delete("/runs/:id", (req, res) => {
  const row = get("performance_runs", req.params.id);
  if (!row) { res.status(404).json({ error: "性能测试报告不存在" }); return; }
  if (["pending", "running"].includes(String(row.status))) { res.status(409).json({ error: "执行中的报告不能删除" }); return; }
  remove("performance_runs", req.params.id);
  res.json({ ok: true });
});

router.post("/scenarios/:id/run", async (req, res) => {
  try {
    const run = await queuePerformanceRun(req.params.id);
    res.status(202).json(toRun(run || {}));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "启动性能测试失败" });
  }
});

router.get("/scenarios/:id", (req, res) => {
  const row = get("performance_scenarios", req.params.id);
  if (!row) { res.status(404).json({ error: "性能测试场景不存在" }); return; }
  res.json(toScenario(row));
});

router.put("/scenarios/:id", (req, res) => {
  try {
    const existing = get("performance_scenarios", req.params.id);
    if (!existing) { res.status(404).json({ error: "性能测试场景不存在" }); return; }
    update("performance_scenarios", req.params.id, scenarioRow(req.body || {}, existing));
    res.json(toScenario(get("performance_scenarios", req.params.id) || existing));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "保存性能场景失败" });
  }
});

router.delete("/scenarios/:id", (req, res) => {
  const scenario = get("performance_scenarios", req.params.id);
  if (!scenario) { res.status(404).json({ error: "性能测试场景不存在" }); return; }
  // 只查 id/status 判定可否删除，避免全表加载压测报告的大 JSON 列
  const relatedRuns = query(`SELECT id, status FROM performance_runs WHERE scenario_id = ?`, req.params.id);
  const running = relatedRuns.some((item) => ["pending", "running"].includes(String(item.status)));
  if (running) { res.status(409).json({ error: "场景正在执行，不能删除" }); return; }
  for (const run of relatedRuns) remove("performance_runs", run.id);
  remove("performance_scenarios", req.params.id);
  res.json({ ok: true, removedReports: relatedRuns.length });
});

export default router;

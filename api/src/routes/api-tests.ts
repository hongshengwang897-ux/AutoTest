import { Router } from "express";
import { all, get, insert, update, remove, exec, query, createId, now } from "../data/db.js";
import { parseJson, readPaging, toListApi } from "./shared.js";
import { runApiTest } from "../api-test-runner.js";
import { isPostmanEnvironment, parsePostmanCollection, parsePostmanEnvironment } from "../postman-import.js";
import { exportToPostmanCollection, getCasesForExport } from "../postman-export.js";
import { listApiCollections, queueApiCollectionRun } from "../api-collection-runner.js";
import { buildCollectionRunAllureZip } from "../allure-exporter.js";

const router = Router();

function toApiCase(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    method: row.method || "GET",
    url: row.url || "",
    headers: parseJson(row.headers, []),
    queryParams: parseJson(row.query_params, []),
    bodyType: row.body_type || "none",
    body: row.body || "",
    assertions: parseJson(row.assertions, []),
    variables: parseJson(row.variables, {}),
    extractions: parseJson(row.extractions, []),
    environmentId: row.environment_id || "",
    group: row.group_name || "",
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toApiExecution(row: Record<string, any>) {
  return {
    id: row.id,
    caseId: row.case_id || "",
    caseName: row.case_name || "",
    status: row.status,
    method: row.method,
    url: row.url,
    statusCode: row.status_code,
    duration: row.duration || 0,
    responseSize: row.response_size || 0,
    requestHeaders: parseJson(row.request_headers, {}),
    requestBody: row.request_body || "",
    responseHeaders: parseJson(row.response_headers, {}),
    responseBody: row.response_body || "",
    assertionResults: parseJson(row.assertion_results, []),
    errorMessage: row.error_message || "",
    createdAt: row.created_at,
  };
}

// 执行历史列表契约字段：仅标量列 + camelCase 别名，请求/响应体等重字段不进列表
const EXECUTION_LIST_COLUMNS = ["id", "case_id", "case_name", "status", "method", "url", "status_code", "duration", "response_size", "error_message", "created_at", "ended_at"];
const EXECUTION_LIST_ALIASES: Record<string, string> = {
  case_id: "caseId",
  case_name: "caseName",
  status_code: "statusCode",
  response_size: "responseSize",
  error_message: "errorMessage",
  created_at: "createdAt",
  ended_at: "endedAt",
};

function toApiCollectionRun(row: Record<string, any>) {
  return {
    id: row.id,
    collectionPath: row.collection_path,
    collectionName: row.collection_name,
    scheduleId: row.schedule_id || "",
    triggerType: row.trigger_type || "manual",
    environmentId: row.environment_id || "",
    status: row.status,
    total: Number(row.total) || 0,
    passed: Number(row.passed) || 0,
    failed: Number(row.failed) || 0,
    duration: Number(row.duration) || 0,
    items: parseJson(row.items, []),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
  };
}

function caseRow(body: Record<string, any>, id = createId()) {
  const timestamp = now();
  return {
    id,
    name: String(body.name || "未命名接口"),
    description: String(body.description || ""),
    method: String(body.method || "GET").toUpperCase(),
    url: String(body.url || ""),
    headers: JSON.stringify(Array.isArray(body.headers) ? body.headers : []),
    query_params: JSON.stringify(Array.isArray(body.queryParams) ? body.queryParams : []),
    body_type: String(body.bodyType || "none"),
    body: String(body.body || ""),
    assertions: JSON.stringify(Array.isArray(body.assertions) ? body.assertions : []),
    variables: JSON.stringify(body.variables && typeof body.variables === "object" ? body.variables : {}),
    extractions: JSON.stringify(Array.isArray(body.extractions) ? body.extractions : []),
    environment_id: String(body.environmentId || ""),
    group_name: String(body.group || ""),
    sort_order: Math.max(0, Number(body.sortOrder) || 0),
    created_at: timestamp,
    updated_at: timestamp,
  };
}

router.get("/cases", (req, res) => {
  const search = String(req.query.search || "").toLowerCase();
  const group = String(req.query.group || "");
  let items = all("api_cases");
  if (search) items = items.filter((item) => String(item.name).toLowerCase().includes(search) || String(item.url).toLowerCase().includes(search));
  if (group) items = items.filter((item) => item.group_name === group);
  items.sort((a, b) => {
    if (String(a.group_name || "") === String(b.group_name || "")) {
      const orderDifference = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
      if (orderDifference !== 0) return orderDifference;
    }
    return String(b.updated_at).localeCompare(String(a.updated_at));
  });
  res.json({ items: items.map(toApiCase), total: items.length });
});

router.post("/cases", (req, res) => {
  if (!String(req.body?.name || "").trim()) { res.status(400).json({ error: "用例名称不能为空" }); return; }
  const row = caseRow(req.body);
  insert("api_cases", row);
  res.status(201).json(toApiCase(row));
});

router.post("/run", async (req, res) => {
  // Express 4 不会捕获 async 路由的 rejection，必须自行 try/catch 防止崩进程
  try {
    const result = await runApiTest(req.body || {});
    res.json(toApiExecution(result));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "接口执行失败" });
  }
});

router.get("/collections", (_req, res) => {
  res.json({ items: listApiCollections() });
});

router.post("/collections/run", (req, res) => {
  try {
    const run = queueApiCollectionRun({
      collectionPath: String(req.body?.collectionPath || ""),
      environmentId: req.body?.environmentId ? String(req.body.environmentId) : undefined,
      triggerType: "manual",
    });
    res.status(202).json(toApiCollectionRun(run));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "集合执行失败" });
  }
});

router.get("/collection-runs", (req, res) => {
  const status = String(req.query.status || "");
  const { page, limit, offset } = readPaging(req.query, 50, 100);

  // 过滤/分页下推到 SQL；items 字段按契约保留（前端弹窗直接用列表数据）
  const whereSql = status ? ` WHERE status = ?` : "";
  const params: unknown[] = status ? [status] : [];
  const total = ((query(`SELECT COUNT(*) as c FROM api_collection_runs${whereSql}`, ...params)[0] as Record<string, unknown>)?.c as number) || 0;
  const items = query(
    `SELECT * FROM api_collection_runs${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...params, limit, offset,
  ).map(toApiCollectionRun);

  res.json({ items, total, page, limit });
});

router.get("/collection-runs/:id", (req, res) => {
  const run = get("api_collection_runs", req.params.id);
  if (!run) { res.status(404).json({ error: "集合报告不存在" }); return; }
  res.json(toApiCollectionRun(run));
});

// GET /api/api-tests/collection-runs/:id/allure-report — 生成 Allure 官方 HTML 报告并下载 ZIP
router.get("/collection-runs/:id/allure-report", (req, res) => {
  const run = get("api_collection_runs", req.params.id);
  if (!run) { res.status(404).json({ error: "集合报告不存在" }); return; }
  try {
    const zipBuffer = buildCollectionRunAllureZip(toApiCollectionRun(run));
    const baseName = (run.collection_name || "collection").replace(/[\\/:*?"<>|]/g, "_");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName}-${run.id}-allure.zip`)}`);
    res.send(zipBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 区分 allure CLI 缺失与生成失败
    if (/spawn|ENOENT|not found|不是内部或外部命令/i.test(message)) {
      res.status(500).json({ error: "Allure 命令行不可用，请安装 allure（https://allurereport.org）后重试" });
    } else {
      res.status(500).json({ error: `Allure 报告生成失败：${message.slice(0, 300)}` });
    }
  }
});

router.delete("/collection-runs/:id", (req, res) => {
  if (!remove("api_collection_runs", req.params.id)) { res.status(404).json({ error: "集合报告不存在" }); return; }
  res.json({ ok: true });
});

router.get("/export/postman", (_req, res) => {
  try {
    const cases = getCasesForExport();
    const collection = exportToPostmanCollection(cases, "AutoTest API Collection");
    res.json(collection);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Postman 导出失败" });
  }
});

router.post("/import/postman", (req, res) => {
  try {
    const document = req.body?.collection ?? req.body;

    if (isPostmanEnvironment(document)) {
      const parsed = parsePostmanEnvironment(document);
      if (!parsed || !parsed.name) { res.status(400).json({ error: "不是有效的 Postman 环境 JSON" }); return; }
      const existing = all("environments").find((item) => String(item.name) === parsed.name);
      const environmentRow = {
        name: parsed.name,
        url: parsed.url,
        type: existing?.type || "dev",
        scope: "api",
        variables: JSON.stringify(parsed.variables),
        accounts: JSON.stringify(existing?.accounts || []),
        status: existing?.status || "online",
      };
      let environmentId: string;
      if (existing) {
        environmentId = existing.id;
        update("environments", environmentId, environmentRow);
      } else {
        environmentId = createId();
        insert("environments", { id: environmentId, ...environmentRow });
      }
      res.status(existing ? 200 : 201).json({
        kind: "environment",
        environment: { id: environmentId, ...environmentRow, variables: parsed.variables, accounts: existing?.accounts || [] },
        importedVariables: parsed.enabledCount,
        skippedVariables: parsed.skippedCount,
        updated: Boolean(existing),
        warnings: parsed.skippedCount > 0 ? [`${parsed.skippedCount} 个已禁用变量未导入`] : [],
      });
      return;
    }

    const parsed = parsePostmanCollection(document);
    const imported: Record<string, any>[] = [];
    exec("BEGIN");
    try {
      for (const definition of parsed.cases) {
        const row = caseRow(definition);
        insert("api_cases", row);
        imported.push(toApiCase(row));
      }
      exec("COMMIT");
    } catch (error) {
      exec("ROLLBACK");
      throw error;
    }
    res.status(201).json({
      kind: "collection",
      collectionName: parsed.collectionName,
      imported: imported.length,
      skipped: parsed.skipped,
      warnings: parsed.warnings,
      items: imported,
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Postman Collection 导入失败" });
  }
});

router.get("/executions", (req, res) => {
  const caseId = String(req.query.caseId || "");
  const { page, limit, offset } = readPaging(req.query, 20, 100);

  // 过滤/分页下推到 SQL，列表只查契约内标量列（重字段不进列表）
  const whereSql = caseId ? ` WHERE case_id = ?` : "";
  const params: unknown[] = caseId ? [caseId] : [];
  const total = ((query(`SELECT COUNT(*) as c FROM api_executions${whereSql}`, ...params)[0] as Record<string, unknown>)?.c as number) || 0;
  const items = query(
    `SELECT id, case_id, case_name, status, method, url, status_code, duration, response_size, error_message, created_at, ended_at FROM api_executions${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...params, limit, offset,
  ).map((row: Record<string, unknown>) => toListApi(row, EXECUTION_LIST_COLUMNS, EXECUTION_LIST_ALIASES));

  res.json({ items, total, page, limit });
});

// GET /api/api-tests/executions/:id — 单条详情保持全量（含请求/响应体与断言结果）
router.get("/executions/:id", (req, res) => {
  const row = get("api_executions", req.params.id);
  if (!row) { res.status(404).json({ error: "执行记录不存在" }); return; }
  res.json(toApiExecution(row));
});

router.delete("/executions/:id", (req, res) => {
  if (!remove("api_executions", req.params.id)) { res.status(404).json({ error: "执行记录不存在" }); return; }
  res.json({ ok: true });
});

router.get("/cases/:id", (req, res) => {
  const item = get("api_cases", req.params.id);
  if (!item) { res.status(404).json({ error: "接口用例不存在" }); return; }
  res.json(toApiCase(item));
});

router.put("/cases/reorder", (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) { res.status(400).json({ error: "排序数据不能为空" }); return; }
  if (items.some((item: any) => !String(item?.id || "").trim())) {
    res.status(400).json({ error: "排序数据缺少接口 ID" });
    return;
  }
  const missing = items.find((item: any) => !get("api_cases", String(item.id)));
  if (missing) { res.status(404).json({ error: `接口用例不存在: ${missing.id}` }); return; }

  exec("BEGIN");
  try {
    for (const item of items) {
      update("api_cases", String(item.id), {
        group_name: String(item.group || ""),
        sort_order: Math.max(0, Number(item.sortOrder) || 0),
      });
    }
    exec("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    exec("ROLLBACK");
    throw error;
  }
});

router.put("/cases/:id", (req, res) => {
  const existing = get("api_cases", req.params.id);
  if (!existing) { res.status(404).json({ error: "接口用例不存在" }); return; }
  if (req.body.name !== undefined && !String(req.body.name).trim()) { res.status(400).json({ error: "用例名称不能为空" }); return; }
  const full = caseRow({ ...toApiCase(existing), ...req.body }, req.params.id);
  const { id, created_at, ...changes } = full;
  changes.updated_at = now();
  update("api_cases", req.params.id, changes);
  res.json(toApiCase(get("api_cases", req.params.id) || {}));
});

router.delete("/cases/:id", (req, res) => {
  if (!remove("api_cases", req.params.id)) { res.status(404).json({ error: "接口用例不存在" }); return; }
  exec("DELETE FROM api_executions WHERE case_id = ?", req.params.id);
  res.json({ ok: true });
});

export default router;

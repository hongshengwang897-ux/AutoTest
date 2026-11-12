import { Router } from "express";
import { all, get, insert, update, remove, createId, now } from "../data/db.js";
import { cancelCaseExecutions, CaseExecutionError, createLocalCaseExecution, queueCaseExecution } from "../case-execution.js";
import { deliverExecutionAlerts } from "../alert-delivery.js";
import { safeLimit, safePage } from "../paging.js";
const router = Router();
// ---- 字段映射：camelCase ↔ snake_case ----
function preconditionIds(row) {
    const value = row.precondition_case_ids;
    let ids = [];
    if (Array.isArray(value))
        ids = value;
    else if (typeof value === "string" && value) {
        try {
            ids = JSON.parse(value);
        }
        catch {
            ids = [];
        }
    }
    const normalized = ids.map(String).filter(Boolean);
    if (normalized.length === 0 && row.precondition_case_id)
        normalized.push(String(row.precondition_case_id));
    return normalized;
}
/** 安全解析 JSON 字符串，失败时回退默认值（DB 脏数据不应导致列表 500） */
function safeJsonParse(text, fallback) {
    try {
        return JSON.parse(text);
    }
    catch {
        return fallback;
    }
}
/** DB 行转为 API 响应格式 */
function toApi(row, includeExpectedImages = true) {
    if (!row)
        return row;
    const { steps_json: stepsJson, ...apiRow } = row;
    const parsedSteps = typeof stepsJson === "string"
        ? safeJsonParse(stepsJson, [])
        : (Array.isArray(stepsJson) ? stepsJson : []);
    const orderedPreconditions = preconditionIds(row);
    return {
        ...apiRow,
        environmentId: row.environment_id,
        preconditionCaseId: orderedPreconditions[0] || "",
        preconditionCaseIds: orderedPreconditions,
        group: row.group_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        tags: typeof row.tags === "string" ? safeJsonParse(row.tags, []) : (row.tags || []),
        steps: includeExpectedImages
            ? parsedSteps
            : parsedSteps.map(({ expectedImage: _expectedImage, ...step }) => step),
    };
}
/** API 请求体转为 DB 行（仅用于创建） */
function toDb(body) {
    const envId = body.environmentId || body.environment_id || "";
    const group = body.group || body.group_name || "";
    const orderedPreconditions = Array.isArray(body.preconditionCaseIds)
        ? body.preconditionCaseIds.map(String).filter(Boolean)
        : Array.isArray(body.precondition_case_ids)
            ? body.precondition_case_ids.map(String).filter(Boolean)
            : (body.preconditionCaseId || body.precondition_case_id ? [String(body.preconditionCaseId || body.precondition_case_id)] : []);
    return {
        id: createId(),
        name: body.name || "",
        description: body.description || "",
        script: body.script || "",
        steps_json: JSON.stringify(body.steps || []),
        language: body.language || "typescript",
        tags: JSON.stringify(body.tags || []),
        group_name: group,
        environment_id: envId,
        precondition_case_id: orderedPreconditions[0] || "",
        precondition_case_ids: JSON.stringify(orderedPreconditions),
        status: body.status || "draft",
        version: body.version ?? 1,
        created_at: now(),
        updated_at: now(),
    };
}
function validatePreconditions(caseId, orderedIds) {
    if (new Set(orderedIds).size !== orderedIds.length)
        return "前置用例不能重复选择";
    if (orderedIds.includes(caseId))
        return "不能将当前用例设置为自己的前置用例";
    const visiting = new Set();
    const visited = new Set();
    const visit = (currentId) => {
        if (visiting.has(currentId))
            return "前置用例不能形成循环引用";
        if (visited.has(currentId))
            return null;
        visiting.add(currentId);
        const current = currentId === caseId ? null : get("cases", currentId);
        if (currentId !== caseId && !current)
            return `选择的前置用例不存在: ${currentId}`;
        const dependencies = currentId === caseId ? orderedIds : preconditionIds(current || {});
        for (const dependencyId of dependencies) {
            const error = visit(dependencyId);
            if (error)
                return error;
        }
        visiting.delete(currentId);
        visited.add(currentId);
        return null;
    };
    return visit(caseId);
}
// ---- Routes ----
// GET /api/cases
router.get("/", (req, res) => {
    const { search, status, group, page = "1", limit = "20" } = req.query;
    let list = all("cases");
    if (search) {
        const kw = search.toLowerCase();
        list = list.filter((c) => {
            const name = typeof c.name === "string" ? c.name : "";
            const tags = Array.isArray(c.tags) ? c.tags : [];
            const tagHit = tags.some((t) => typeof t === "string" && t.toLowerCase().includes(kw));
            return name.toLowerCase().includes(kw) || tagHit;
        });
    }
    if (status)
        list = list.filter((c) => c.status === status);
    if (group)
        list = list.filter((c) => c.group_name === group || c.group === group);
    const p = safePage(page, 1);
    const l = safeLimit(limit, 20);
    const total = list.length;
    const items = list.slice((p - 1) * l, p * l).map((item) => toApi(item, false));
    res.json({ items, total, page: p, limit: l });
});
// POST /api/cases
router.post("/", (req, res) => {
    const { name } = req.body;
    if (!name) {
        res.status(400).json({ error: "name is required" });
        return;
    }
    const row = toDb(req.body);
    const preconditionError = validatePreconditions(String(row.id), preconditionIds(row));
    if (preconditionError) {
        res.status(400).json({ error: preconditionError });
        return;
    }
    insert("cases", row);
    res.status(201).json(toApi(row));
});
// GET /api/cases/:id
router.get("/:id", (req, res) => {
    const item = get("cases", req.params.id);
    if (!item) {
        res.status(404).json({ error: "not found" });
        return;
    }
    res.json(toApi(item));
});
// PUT /api/cases/:id
router.put("/:id", (req, res) => {
    const existing = get("cases", req.params.id);
    if (!existing) {
        res.status(404).json({ error: "not found" });
        return;
    }
    const hasPreconditionUpdate = req.body.preconditionCaseIds !== undefined
        || req.body.precondition_case_ids !== undefined
        || req.body.preconditionCaseId !== undefined;
    const nextPreconditionCaseIds = hasPreconditionUpdate
        ? (Array.isArray(req.body.preconditionCaseIds)
            ? req.body.preconditionCaseIds.map(String).filter(Boolean)
            : Array.isArray(req.body.precondition_case_ids)
                ? req.body.precondition_case_ids.map(String).filter(Boolean)
                : (req.body.preconditionCaseId ? [String(req.body.preconditionCaseId)] : []))
        : preconditionIds(existing);
    const preconditionError = validatePreconditions(req.params.id, nextPreconditionCaseIds);
    if (preconditionError) {
        res.status(400).json({ error: preconditionError });
        return;
    }
    const data = { updated_at: now() };
    if (req.body.name !== undefined)
        data.name = req.body.name;
    if (req.body.description !== undefined)
        data.description = req.body.description;
    if (req.body.script !== undefined)
        data.script = req.body.script;
    if (req.body.steps !== undefined)
        data.steps_json = JSON.stringify(req.body.steps);
    if (req.body.language !== undefined)
        data.language = req.body.language;
    if (req.body.tags !== undefined)
        data.tags = JSON.stringify(req.body.tags);
    if (req.body.group !== undefined)
        data.group_name = req.body.group;
    if (req.body.environmentId !== undefined)
        data.environment_id = req.body.environmentId;
    if (hasPreconditionUpdate) {
        data.precondition_case_id = nextPreconditionCaseIds[0] || "";
        data.precondition_case_ids = JSON.stringify(nextPreconditionCaseIds);
    }
    if (req.body.status !== undefined)
        data.status = req.body.status;
    update("cases", req.params.id, data);
    const updated = get("cases", req.params.id);
    res.json(toApi(updated || {}));
});
// DELETE /api/cases/:id
router.delete("/:id", (req, res) => {
    const ok = remove("cases", req.params.id);
    if (!ok) {
        res.status(404).json({ error: "not found" });
        return;
    }
    res.json({ ok: true });
});
// POST /api/cases/:id/execute
router.post("/:id/execute", async (req, res) => {
    try {
        const execution = queueCaseExecution(req.params.id, req.body?.environmentId);
        res.json({ ...execution, message: "已加入执行队列" });
    }
    catch (error) {
        const status = error instanceof CaseExecutionError ? error.status : 500;
        res.status(status).json({ error: error instanceof Error ? error.message : "执行启动失败" });
    }
});
// POST /api/cases/batch-notify — 前端本地执行器批量跑完后，推送一次汇总（单条不推）
router.post("/batch-notify", async (req, res) => {
    const total = Number(req.body?.total) || 0;
    const pass = Number(req.body?.pass) || 0;
    const fail = Number(req.body?.fail) || 0;
    if (total <= 0) {
        res.status(400).json({ error: "total is required" });
        return;
    }
    const status = fail === 0 ? "success" : "failed";
    const name = String(req.body?.name || `批量执行（${total} 条）`);
    try {
        await deliverExecutionAlerts("ui", name, status, fail > 0 ? `${fail} 条失败` : "", { total, pass, fail });
        res.json({ message: "批量汇总已推送" });
    }
    catch (error) {
        res.status(502).json({ error: error instanceof Error ? error.message : "批量汇总推送失败" });
    }
});
// POST /api/cases/:id/execute-local — 为访问者电脑上的执行器创建任务
router.post("/:id/execute-local", (req, res) => {
    try {
        const requestOrigin = req.get("origin") || "";
        const requestedBase = String(req.body?.publicApiBaseUrl || requestOrigin || `${req.protocol}://${req.get("host")}`);
        const requestedUrl = new URL(requestedBase);
        if (!["http:", "https:"].includes(requestedUrl.protocol))
            throw new CaseExecutionError("报告回传地址无效", 400);
        if (requestOrigin && new URL(requestOrigin).hostname !== requestedUrl.hostname) {
            throw new CaseExecutionError("报告回传地址与平台地址不一致", 400);
        }
        const job = createLocalCaseExecution(req.params.id, requestedUrl.origin, req.body?.environmentId);
        res.json(job);
    }
    catch (error) {
        const status = error instanceof CaseExecutionError ? error.status : 500;
        res.status(status).json({ error: error instanceof Error ? error.message : "本地执行任务创建失败" });
    }
});
// POST /api/cases/:id/cancel — 取消正在执行的用例
router.post("/:id/cancel", (req, res) => {
    const item = get("cases", req.params.id);
    if (!item) {
        res.status(404).json({ error: "not found" });
        return;
    }
    const result = cancelCaseExecutions(item.id);
    if (result.found === 0) {
        res.json({ ok: false, message: "没有正在执行的用例" });
        return;
    }
    res.json({ ok: true, message: `已取消 ${result.cancelled} 个执行` });
});
export default router;
//# sourceMappingURL=cases.js.map
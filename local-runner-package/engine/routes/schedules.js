import { Router } from "express";
import { all, get, insert, update, remove, createId } from "../data/db.js";
import { isValidCron, reloadSchedule, removeScheduleTask, refreshNextRunTime } from "../scheduler.js";
import { queueBatchExecution } from "../case-execution.js";
import { queueApiCollectionRun } from "../api-collection-runner.js";
const router = Router();
/** 安全解析 JSON 字符串，失败时回退默认值（DB 脏数据不应导致列表 500） */
function safeJsonParse(text, fallback) {
    try {
        return JSON.parse(text);
    }
    catch {
        return fallback;
    }
}
function toApi(row) {
    return {
        ...row,
        cronExpression: row.cron_expression,
        caseIds: typeof row.case_ids === "string" ? safeJsonParse(row.case_ids, []) : (row.case_ids || []),
        environmentId: row.environment_id,
        targetType: row.target_type || "platform",
        collectionPath: row.collection_path || "",
        lastRunTime: row.last_run_time,
        nextRunTime: row.next_run_time,
        enabled: !!row.enabled,
    };
}
// GET /api/schedules
router.get("/", (_req, res) => {
    res.json({ items: all("schedules").map(toApi) });
});
// POST /api/schedules
router.post("/", (req, res) => {
    const { name } = req.body;
    if (!name) {
        res.status(400).json({ error: "name is required" });
        return;
    }
    const expression = req.body.cronExpression || req.body.cron_expression || "";
    if (!isValidCron(expression)) {
        res.status(400).json({ error: "Cron 表达式无效" });
        return;
    }
    const targetType = req.body.targetType === "api_collection" ? "api_collection" : "platform";
    const collectionPath = String(req.body.collectionPath || "").trim();
    if (targetType === "api_collection" && !collectionPath) {
        res.status(400).json({ error: "请选择接口测试集合" });
        return;
    }
    const row = {
        id: createId(),
        name,
        cron_expression: expression,
        case_ids: JSON.stringify(req.body.caseIds || req.body.case_ids || []),
        environment_id: req.body.environmentId || req.body.environment_id || "",
        enabled: req.body.enabled ? 1 : 0,
        last_run_time: req.body.lastRunTime || null,
        next_run_time: req.body.nextRunTime || null,
        target_type: targetType,
        collection_path: collectionPath,
    };
    insert("schedules", row);
    reloadSchedule(row.id);
    refreshNextRunTime(row.id);
    res.status(201).json(toApi(get("schedules", row.id) || row));
});
// PUT /api/schedules/:id
router.put("/:id", (req, res) => {
    const existing = get("schedules", req.params.id);
    if (!existing) {
        res.status(404).json({ error: "not found" });
        return;
    }
    const expression = req.body.cronExpression ?? existing.cron_expression;
    if (!isValidCron(expression)) {
        res.status(400).json({ error: "Cron 表达式无效" });
        return;
    }
    const data = {};
    if (req.body.name !== undefined)
        data.name = req.body.name;
    if (req.body.cronExpression !== undefined)
        data.cron_expression = req.body.cronExpression;
    if (req.body.caseIds !== undefined)
        data.case_ids = JSON.stringify(req.body.caseIds);
    if (req.body.environmentId !== undefined)
        data.environment_id = req.body.environmentId;
    if (req.body.enabled !== undefined)
        data.enabled = req.body.enabled ? 1 : 0;
    if (req.body.lastRunTime !== undefined)
        data.last_run_time = req.body.lastRunTime;
    if (req.body.nextRunTime !== undefined)
        data.next_run_time = req.body.nextRunTime;
    if (req.body.targetType !== undefined)
        data.target_type = req.body.targetType === "api_collection" ? "api_collection" : "platform";
    if (req.body.collectionPath !== undefined)
        data.collection_path = String(req.body.collectionPath || "").trim();
    const nextTargetType = data.target_type || existing.target_type || "platform";
    const nextCollectionPath = data.collection_path ?? existing.collection_path ?? "";
    if (nextTargetType === "api_collection" && !nextCollectionPath) {
        res.status(400).json({ error: "请选择接口测试集合" });
        return;
    }
    update("schedules", req.params.id, data);
    reloadSchedule(req.params.id);
    refreshNextRunTime(req.params.id);
    const updated = get("schedules", req.params.id);
    res.json(toApi(updated || {}));
});
// POST /api/schedules/:id/toggle
router.post("/:id/toggle", (req, res) => {
    const existing = get("schedules", req.params.id);
    if (!existing) {
        res.status(404).json({ error: "not found" });
        return;
    }
    const newVal = existing.enabled ? 0 : 1;
    update("schedules", req.params.id, { enabled: newVal });
    reloadSchedule(req.params.id);
    refreshNextRunTime(req.params.id);
    const toggled = get("schedules", req.params.id);
    res.json(toApi(toggled || {}));
});
// POST /api/schedules/:id/run
router.post("/:id/run", (req, res) => {
    const existing = get("schedules", req.params.id);
    if (!existing) {
        res.status(404).json({ error: "not found" });
        return;
    }
    update("schedules", req.params.id, { last_run_time: new Date().toISOString() });
    try {
        if ((existing.target_type || "platform") === "api_collection") {
            const run = queueApiCollectionRun({
                collectionPath: String(existing.collection_path || ""),
                environmentId: existing.environment_id || undefined,
                scheduleId: existing.id,
                triggerType: "manual",
            });
            res.status(202).json({ accepted: true, runId: run.id });
            return;
        }
        const caseIds = Array.isArray(existing.case_ids) ? existing.case_ids.map(String).filter(Boolean) : [];
        // 一次触发视为一个批次：全部完成后只推送一次汇总，不逐条推送
        const result = queueBatchExecution(caseIds, existing.environment_id || undefined, `${existing.name}（定时任务）`);
        res.status(202).json({ accepted: result.total - result.failed > 0, total: result.total, failed: result.failed });
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : "任务执行失败" });
    }
});
// DELETE /api/schedules/:id
router.delete("/:id", (req, res) => {
    removeScheduleTask(req.params.id);
    const ok = remove("schedules", req.params.id);
    if (!ok) {
        res.status(404).json({ error: "not found" });
        return;
    }
    res.json({ ok: true });
});
export default router;
//# sourceMappingURL=schedules.js.map
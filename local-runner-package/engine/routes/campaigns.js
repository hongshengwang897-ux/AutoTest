import { Router } from "express";
import { all, get, insert, update, remove, query, createId, now } from "../data/db.js";
import { parseJson, placeholders } from "./shared.js";
const router = Router();
function toCampaign(row) {
    const uiCases = parseJson(row.ui_case_ids, []);
    const apiCases = parseJson(row.api_case_ids, []);
    const perfScenarios = parseJson(row.performance_scenario_ids, []);
    const total = uiCases.length + apiCases.length + perfScenarios.length;
    return {
        id: row.id,
        name: row.name,
        description: row.description || "",
        status: row.status || "draft",
        uiCaseIds: uiCases,
        apiCaseIds: apiCases,
        performanceScenarioIds: perfScenarios,
        total,
        deadline: row.deadline || "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
/** GET /api/campaigns — 获取所有测试计划 */
router.get("/", (req, res) => {
    const status = String(req.query.status || "");
    let items = all("campaigns");
    if (status)
        items = items.filter((item) => item.status === status);
    items.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    res.json({ items: items.map(toCampaign), total: items.length });
});
/** GET /api/campaigns/:id — 获取单个测试计划 */
router.get("/:id", (req, res) => {
    const item = get("campaigns", req.params.id);
    if (!item) {
        res.status(404).json({ error: "测试计划不存在" });
        return;
    }
    res.json(toCampaign(item));
});
/** POST /api/campaigns — 创建测试计划 */
router.post("/", (req, res) => {
    const body = req.body || {};
    if (!String(body.name || "").trim()) {
        res.status(400).json({ error: "测试计划名称不能为空" });
        return;
    }
    const timestamp = now();
    const id = createId();
    const row = {
        id,
        name: String(body.name).trim(),
        description: String(body.description || ""),
        status: (body.status || "draft"),
        ui_case_ids: JSON.stringify(Array.isArray(body.uiCaseIds) ? body.uiCaseIds : []),
        api_case_ids: JSON.stringify(Array.isArray(body.apiCaseIds) ? body.apiCaseIds : []),
        performance_scenario_ids: JSON.stringify(Array.isArray(body.performanceScenarioIds) ? body.performanceScenarioIds : []),
        deadline: String(body.deadline || ""),
        created_at: timestamp,
        updated_at: timestamp,
    };
    insert("campaigns", row);
    res.status(201).json(toCampaign(row));
});
/** PUT /api/campaigns/:id — 更新测试计划 */
router.put("/:id", (req, res) => {
    const existing = get("campaigns", req.params.id);
    if (!existing) {
        res.status(404).json({ error: "测试计划不存在" });
        return;
    }
    const body = req.body || {};
    const changes = { updated_at: now() };
    if (body.name !== undefined) {
        if (!String(body.name || "").trim()) {
            res.status(400).json({ error: "测试计划名称不能为空" });
            return;
        }
        changes.name = String(body.name).trim();
    }
    if (body.description !== undefined)
        changes.description = String(body.description);
    if (body.status !== undefined)
        changes.status = String(body.status);
    if (body.uiCaseIds !== undefined)
        changes.ui_case_ids = JSON.stringify(Array.isArray(body.uiCaseIds) ? body.uiCaseIds : []);
    if (body.apiCaseIds !== undefined)
        changes.api_case_ids = JSON.stringify(Array.isArray(body.apiCaseIds) ? body.apiCaseIds : []);
    if (body.performanceScenarioIds !== undefined)
        changes.performance_scenario_ids = JSON.stringify(Array.isArray(body.performanceScenarioIds) ? body.performanceScenarioIds : []);
    if (body.deadline !== undefined)
        changes.deadline = String(body.deadline || "");
    update("campaigns", req.params.id, changes);
    res.json(toCampaign(get("campaigns", req.params.id) || {}));
});
/** DELETE /api/campaigns/:id — 删除测试计划 */
router.delete("/:id", (req, res) => {
    if (!remove("campaigns", req.params.id)) {
        res.status(404).json({ error: "测试计划不存在" });
        return;
    }
    res.json({ ok: true });
});
/** GET /api/campaigns/:id/progress — 获取测试计划进度 */
router.get("/:id/progress", (req, res) => {
    const campaign = get("campaigns", req.params.id);
    if (!campaign) {
        res.status(404).json({ error: "测试计划不存在" });
        return;
    }
    const uiCaseIds = parseJson(campaign.ui_case_ids, []);
    const apiCaseIds = parseJson(campaign.api_case_ids, []);
    const perfScenarioIds = parseJson(campaign.performance_scenario_ids, []);
    const total = uiCaseIds.length + apiCaseIds.length + perfScenarioIds.length;
    if (total === 0) {
        res.json({
            total: 0,
            passed: 0,
            failed: 0,
            pending: 0,
            passRate: 100,
            uiCases: { total: 0, passed: 0, failed: 0, pending: 0 },
            apiCases: { total: 0, passed: 0, failed: 0, pending: 0 },
            performance: { total: 0, passed: 0, failed: 0, pending: 0 },
        });
        return;
    }
    /** 从执行行中取每个目标 id 最新一条的状态（按时间戳取最大，与原全表遍历语义一致） */
    function latestStatuses(rows, idKey, timeKey) {
        const times = new Map();
        const statuses = new Map();
        for (const row of rows) {
            const id = String(row[idKey]);
            const time = String(row[timeKey] ?? "");
            const prevTime = times.get(id);
            if (prevTime === undefined || time > prevTime) {
                times.set(id, time);
                statuses.set(id, String(row.status ?? ""));
            }
        }
        return statuses;
    }
    // UI 用例进度：按 campaign 内 id 集合走 SQL IN 查询，只取状态判定所需列，避免加载大 JSON 列。
    // 注意：executions 表没有 created_at 列（那是 api_executions 的），"最新记录"必须按 start_time 比较。
    const uiExecMap = uiCaseIds.length > 0
        ? latestStatuses(query(`SELECT case_id, status, start_time FROM executions WHERE case_id IN (${placeholders(uiCaseIds)}) ORDER BY start_time ASC`, ...uiCaseIds), "case_id", "start_time")
        : new Map();
    // API 用例进度（api_executions 的时间戳列是 created_at）
    const apiExecMap = apiCaseIds.length > 0
        ? latestStatuses(query(`SELECT case_id, status, created_at FROM api_executions WHERE case_id IN (${placeholders(apiCaseIds)}) ORDER BY created_at ASC`, ...apiCaseIds), "case_id", "created_at")
        : new Map();
    // 性能场景进度（performance_runs 的 created_at 为 NOT NULL，比可空的 started_at 更稳）
    const perfMap = perfScenarioIds.length > 0
        ? latestStatuses(query(`SELECT scenario_id, status, created_at FROM performance_runs WHERE scenario_id IN (${placeholders(perfScenarioIds)}) ORDER BY created_at ASC`, ...perfScenarioIds), "scenario_id", "created_at")
        : new Map();
    function countProgress(execMap, ids) {
        let passed = 0, failed = 0, pending = 0;
        for (const id of ids) {
            const status = execMap.get(id);
            if (!status) {
                pending++;
                continue;
            }
            if (status === "success" || status === "pass")
                passed++;
            else if (status === "failed" || status === "fail" || status === "error")
                failed++;
            else
                pending++;
        }
        return { total: ids.length, passed, failed, pending };
    }
    const uiProgress = countProgress(uiExecMap, uiCaseIds);
    const apiProgress = countProgress(apiExecMap, apiCaseIds);
    const perfProgress = countProgress(perfMap, perfScenarioIds);
    const passed = uiProgress.passed + apiProgress.passed + perfProgress.passed;
    const failed = uiProgress.failed + apiProgress.failed + perfProgress.failed;
    const pending = uiProgress.pending + apiProgress.pending + perfProgress.pending;
    res.json({
        total,
        passed,
        failed,
        pending,
        passRate: total > 0 ? Math.round((passed / total) * 100) : 100,
        uiCases: uiProgress,
        apiCases: apiProgress,
        performance: perfProgress,
    });
});
export default router;
//# sourceMappingURL=campaigns.js.map
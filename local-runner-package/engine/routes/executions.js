import { Router } from "express";
import { exec, get, query, remove } from "../data/db.js";
import { CaseExecutionError, completeLocalCaseExecution } from "../case-execution.js";
import { readPaging, toListApi } from "./shared.js";
import { convertToAllure } from "../allure-exporter.js";
const router = Router();
// 列表契约字段：仅标量列 + camelCase 别名，重 JSON 字段（logs/steps/screenshots）只在详情端点返回
const LIST_COLUMNS = ["id", "case_id", "case_name", "status", "start_time", "end_time", "duration", "error_message"];
const LIST_ALIASES = {
    case_id: "caseId",
    case_name: "caseName",
    start_time: "startTime",
    end_time: "endTime",
    error_message: "errorMessage",
};
// GET /api/executions — 过滤/分页下推到 SQL，列表只查契约字段
router.get("/", (req, res) => {
    const status = String(req.query.status || "");
    const caseId = String(req.query.caseId || "");
    const { page, limit, offset } = readPaging(req.query, 20);
    const where = [];
    const params = [];
    if (status) {
        where.push("status = ?");
        params.push(status);
    }
    if (caseId) {
        where.push("case_id = ?");
        params.push(caseId);
    }
    const whereSql = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
    const total = query(`SELECT COUNT(*) as c FROM executions${whereSql}`, ...params)[0]?.c || 0;
    const items = query(`SELECT id, case_id, case_name, status, start_time, end_time, duration, error_message FROM executions${whereSql} ORDER BY start_time DESC LIMIT ? OFFSET ?`, ...params, limit, offset).map((row) => toListApi(row, LIST_COLUMNS, LIST_ALIASES));
    res.json({ items, total, page, limit });
});
// GET /api/executions/allure — 导出 Allure 格式结果（只 SELECT 所需列）
router.get("/allure", (req, res) => {
    const status = String(req.query.status || "");
    const caseId = String(req.query.caseId || "");
    const where = [];
    const params = [];
    if (status) {
        where.push("status = ?");
        params.push(status);
    }
    if (caseId) {
        where.push("case_id = ?");
        params.push(caseId);
    }
    const whereSql = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
    const list = query(`SELECT id, case_id, case_name, status, start_time, end_time, duration, error_message, steps FROM executions${whereSql} ORDER BY start_time DESC`, ...params);
    const results = list.map((row) => ({
        executionId: row.id,
        caseId: row.case_id,
        caseName: row.case_name,
        status: row.status,
        startTime: row.start_time,
        endTime: row.end_time,
        duration: row.duration,
        error: row.error_message,
        steps: Array.isArray(row.steps) ? row.steps : [],
    }));
    const { testCases, suites, containers } = convertToAllure(results);
    res.json({ testCases, suites, containers });
});
// GET /api/executions/:id — 详情保持全量（含 logs/steps/screenshots）
router.get("/:id", (req, res) => {
    const item = get("executions", req.params.id);
    if (!item) {
        res.status(404).json({ error: "not found" });
        return;
    }
    res.json(toApi(item));
});
// DELETE /api/executions/:id — 事务内级联删除同 execution_id 的报告，避免孤儿数据
router.delete("/:id", (req, res) => {
    exec("BEGIN");
    try {
        const ok = remove("executions", req.params.id);
        if (!ok) {
            exec("ROLLBACK");
            res.status(404).json({ error: "not found" });
            return;
        }
        exec("DELETE FROM reports WHERE execution_id = ?", req.params.id);
        exec("COMMIT");
        res.json({ ok: true });
    }
    catch (error) {
        try {
            exec("ROLLBACK");
        }
        catch { /* 事务未激活 */ }
        throw error;
    }
});
// GET /api/executions/:id/logs — 只查 logs 列
router.get("/:id/logs", (req, res) => {
    const rows = query(`SELECT logs FROM executions WHERE id = ?`, req.params.id);
    const item = rows[0];
    if (!item) {
        res.status(404).json({ error: "not found" });
        return;
    }
    res.json({ logs: item.logs });
});
// POST /api/executions/:id/verify — 本地执行器执行前校验任务令牌（防任意脚本提交）
router.post("/:id/verify", (req, res) => {
    const rows = query(`SELECT id, case_name, runner_token FROM executions WHERE id = ?`, req.params.id);
    const execution = rows[0];
    const token = String(req.body?.token || "");
    if (!execution) {
        res.status(404).json({ error: "执行记录不存在" });
        return;
    }
    if (!token || token !== execution.runner_token) {
        res.status(403).json({ error: "任务令牌无效" });
        return;
    }
    res.json({ ok: true, executionId: execution.id, caseName: execution.case_name });
});
// POST /api/executions/:id/local-result — 接收访问者本机执行器的结果
router.post("/:id/local-result", (req, res) => {
    try {
        const completed = completeLocalCaseExecution(req.params.id, String(req.body?.token || ""), req.body?.result, String(req.body?.runnerName || "本地执行器"));
        res.json(completed);
    }
    catch (error) {
        const status = error instanceof CaseExecutionError ? error.status : 500;
        res.status(status).json({ error: error instanceof Error ? error.message : "本地执行报告保存失败" });
    }
});
function toApi(row) {
    const { runner_token: _, ...publicRow } = row;
    return {
        ...publicRow,
        caseId: row.case_id,
        caseName: row.case_name,
        startTime: row.start_time,
        endTime: row.end_time,
        errorMessage: row.error_message,
    };
}
export default router;
//# sourceMappingURL=executions.js.map
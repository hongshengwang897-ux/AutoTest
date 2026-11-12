import { Router } from "express";
import { get, query } from "../data/db.js";
import { readPaging, toListApi } from "./shared.js";
const router = Router();
// 列表契约字段：仅标量列 + camelCase 别名，steps/screenshots/logs 等重字段只在详情端点返回
const LIST_COLUMNS = ["id", "execution_id", "case_id", "case_name", "status", "start_time", "end_time", "duration", "error_message", "created_at"];
const LIST_ALIASES = {
    execution_id: "executionId",
    case_id: "caseId",
    case_name: "caseName",
    start_time: "startTime",
    end_time: "endTime",
    error_message: "errorMessage",
    created_at: "createdAt",
};
function toApi(row) {
    return {
        ...row,
        executionId: row.execution_id,
        caseId: row.case_id,
        caseName: row.case_name,
        startTime: row.start_time,
        endTime: row.end_time,
        errorMessage: row.error_message,
        createdAt: row.created_at,
    };
}
// GET /api/reports — 过滤/分页下推到 SQL，列表只查契约字段
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
    const total = query(`SELECT COUNT(*) as c FROM reports${whereSql}`, ...params)[0]?.c || 0;
    const items = query(`SELECT id, execution_id, case_id, case_name, status, start_time, end_time, duration, error_message, created_at FROM reports${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`, ...params, limit, offset).map((row) => toListApi(row, LIST_COLUMNS, LIST_ALIASES));
    res.json({ items, total, page, limit });
});
// GET /api/reports/:id — 详情保持全量
router.get("/:id", (req, res) => {
    const item = get("reports", req.params.id);
    if (!item) {
        res.status(404).json({ error: "not found" });
        return;
    }
    res.json(toApi(item));
});
export default router;
//# sourceMappingURL=reports.js.map
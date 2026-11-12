import { Router } from "express";
import { query } from "../data/db.js";

const router = Router();

/** COUNT 查询辅助：取第一条的 c 列并转为数字 */
function count(sql: string, ...params: unknown[]): number {
  const row = query(sql, ...params)[0] as Record<string, unknown> | undefined;
  return Number(row?.c) || 0;
}

// GET /api/stats — Dashboard 统计数据
router.get("/", (_req, res) => {
  // 计数全部下推 SQL，避免全表加载（cases.steps_json 可能内嵌 base64 基准图）
  const totalCases = count(`SELECT COUNT(*) as c FROM cases`);
  const activeCases = count(`SELECT COUNT(*) as c FROM cases WHERE status = 'active'`);
  const totalElements = count(`SELECT COUNT(*) as c FROM elements`);
  const totalEnvironments = count(`SELECT COUNT(*) as c FROM environments`);
  const totalAlerts = count(`SELECT COUNT(*) as c FROM alerts WHERE enabled <> 0`);
  const totalExecutions = count(`SELECT COUNT(*) as c FROM executions`);

  // 最近 20 条执行：只查契约内标量列，不加载 logs/steps/screenshots
  const recentExecs = query(
    `SELECT id, case_id, case_name, status, start_time, end_time, duration FROM executions WHERE start_time IS NOT NULL ORDER BY start_time DESC LIMIT 20`
  );

  const passed = recentExecs.filter((e: Record<string, unknown>) => e.status === "success").length;
  const failed = recentExecs.filter((e: Record<string, unknown>) => e.status === "failed").length;
  const passRate = recentExecs.length > 0 ? Math.round((passed / recentExecs.length) * 100) : 0;

  // 近 7 天趋势：一条按日 GROUP BY 取数，JS 组装补零
  const trends: { date: string; total: number; passed: number; failed: number }[] = [];
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 6);
  const windowStartDay = windowStart.toISOString().slice(0, 10);
  const dayRows = query(
    `SELECT substr(start_time, 1, 10) as day,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as passed,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
     FROM executions
     WHERE start_time >= ?
     GROUP BY day`,
    windowStartDay,
  );
  const dayMap = new Map<string, { total: number; passed: number; failed: number }>();
  for (const row of dayRows) {
    dayMap.set(String(row.day), {
      total: Number(row.total) || 0,
      passed: Number(row.passed) || 0,
      failed: Number(row.failed) || 0,
    });
  }
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const day = dayMap.get(ds) || { total: 0, passed: 0, failed: 0 };
    trends.push({ date: ds.slice(5), total: day.total, passed: day.passed, failed: day.failed });
  }

  // 今日执行数复用趋势数据（今日记录必然落在近 7 天窗口内）
  const today = new Date().toISOString().slice(0, 10);
  const todayExecutions = dayMap.get(today)?.total ?? 0;

  res.json({
    totalCases,
    activeCases,
    totalExecutions,
    todayExecutions,
    passRate,
    totalElements,
    totalEnvironments,
    totalAlerts,
    recentExecutions: recentExecs.slice(0, 8).map((e: Record<string, unknown>) => ({
      id: e.id,
      caseId: e.case_id,
      caseName: e.case_name,
      status: e.status,
      startTime: e.start_time,
      endTime: e.end_time,
      duration: e.duration,
    })),
    trends,
  });
});

export default router;

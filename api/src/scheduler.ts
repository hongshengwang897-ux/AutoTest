import cron, { type ScheduledTask } from "node-cron";
import { all, get, update, now } from "./data/db.js";
import { queueBatchExecution } from "./case-execution.js";
import { queueApiCollectionRun } from "./api-collection-runner.js";

const tasks = new Map<string, ScheduledTask>();

function stopTask(id: string) {
  const task = tasks.get(id);
  if (task) {
    task.stop();
    task.destroy();
    tasks.delete(id);
  }
}

export function reloadSchedule(id: string) {
  stopTask(id);
  const schedule = get("schedules", id);
  if (!schedule) return;
  if (!schedule.enabled) {
    // 停用的任务不注册，同时清空残留的 next_run_time，避免 UI 显示过期时间
    update("schedules", id, { next_run_time: null });
    return;
  }
  if (!cron.validate(schedule.cron_expression)) {
    // Cron 表达式非法：不能静默跳过，否则任务未注册但 UI 仍显示“已启用”且 next_run_time 残留旧值
    console.warn(`[Scheduler] ${schedule.name}(${id}) 的 Cron 表达式无效: "${schedule.cron_expression}"，任务未注册`);
    update("schedules", id, { next_run_time: null });
    return;
  }

  const task = cron.schedule(schedule.cron_expression, () => {
    const current = get("schedules", id);
    if (!current?.enabled) return;
    if (current.target_type === "api_collection") {
      try {
        queueApiCollectionRun({
          collectionPath: String(current.collection_path || ""),
          environmentId: current.environment_id || undefined,
          scheduleId: id,
          triggerType: "schedule",
        });
        update("schedules", id, { last_run_time: now() });
      } catch (error) {
        console.error(`[Scheduler] ${current.name}:`, error instanceof Error ? error.message : error);
      }
    } else {
      const caseIds = Array.isArray(current.case_ids) ? current.case_ids.map(String).filter(Boolean) : [];
      if (caseIds.length > 0) {
        try {
          // 一次调度触发视为一个批次：全部完成后推送一次汇总，不逐条推送
          const result = queueBatchExecution(caseIds, current.environment_id || undefined, `${current.name}（定时任务）`);
          // 至少成功入队一次才认为本次调度真实执行过，避免“假运行”
          if (result.total - result.failed > 0) update("schedules", id, { last_run_time: now() });
        } catch (error) {
          console.error(`[Scheduler] ${current.name}:`, error instanceof Error ? error.message : error);
        }
      }
    }
    // 触发后重新计算并持久化下次运行时间
    refreshNextRunTime(id);
  });
  tasks.set(id, task);
  refreshNextRunTime(id);
}

/** 计算并持久化 next_run_time（使用 node-cron 内部下一次触发时间） */
export function refreshNextRunTime(id: string): void {
  try {
    const task = tasks.get(id);
    const schedule = get("schedules", id);
    if (!task || !schedule?.enabled) {
      update("schedules", id, { next_run_time: null });
      return;
    }
    const ms = task.msToNext();
    if (typeof ms === "number" && Number.isFinite(ms) && ms > 0) {
      update("schedules", id, { next_run_time: new Date(Date.now() + ms).toISOString() });
    }
  } catch (error) {
    console.error("[Scheduler] 计算 next_run_time 失败:", error instanceof Error ? error.message : error);
  }
}

export function computeNextRunTime(id: string): string | null {
  try {
    const task = tasks.get(id);
    if (!task) return null;
    const ms = task.msToNext();
    return typeof ms === "number" && Number.isFinite(ms) && ms > 0
      ? new Date(Date.now() + ms).toISOString()
      : null;
  } catch {
    return null;
  }
}

export function removeScheduleTask(id: string) {
  stopTask(id);
}

export function initializeScheduler() {
  for (const id of [...tasks.keys()]) stopTask(id);
  for (const schedule of all("schedules")) reloadSchedule(String(schedule.id));
  console.log(`[Scheduler] 已注册 ${tasks.size} 个定时任务`);
}

export function shutdownScheduler() {
  for (const id of [...tasks.keys()]) stopTask(id);
}

export function isValidCron(expression: string): boolean {
  return cron.validate(expression);
}

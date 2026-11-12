export declare function reloadSchedule(id: string): void;
/** 计算并持久化 next_run_time（使用 node-cron 内部下一次触发时间） */
export declare function refreshNextRunTime(id: string): void;
export declare function computeNextRunTime(id: string): string | null;
export declare function removeScheduleTask(id: string): void;
export declare function initializeScheduler(): void;
export declare function shutdownScheduler(): void;
export declare function isValidCron(expression: string): boolean;

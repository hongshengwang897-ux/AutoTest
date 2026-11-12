import type { ExecutionResult, VisualBaseline } from "./execution-engine.js";
export interface LocalExecutionJob {
    executionId: string;
    token: string;
    caseId: string;
    caseName: string;
    script: string;
    baseUrl: string;
    reportUrl: string;
    options: {
        timeoutMs: number;
        screenshotOnFailure: boolean;
        retryOnFailure: boolean;
        maxRetries: number;
        visualBaselines: Record<string, VisualBaseline>;
    };
}
/**
 * 服务重启兜底：进程退出后，内存队列丢失，残留的 pending/running 记录永远无法完成。
 * 启动时把所有卡住的执行（UI 用例 + 接口集合 + 接口用例）标记为失败，并清空本地执行令牌。
 */
export declare function markInterruptedExecutions(): void;
export declare class CaseExecutionError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
export declare function queueCaseExecution(caseId: string, environmentId?: string, batchId?: string): {
    id: string;
    status: "pending" | "running";
};
/** 批量执行：把一组用例入队，全部完成后推送一条汇总（单条不推） */
export declare function queueBatchExecution(caseIds: string[], environmentId?: string, name?: string): {
    batchId: string;
    total: number;
    failed: number;
};
export declare function createLocalCaseExecution(caseId: string, reportBaseUrl: string, environmentId?: string): LocalExecutionJob;
export declare function completeLocalCaseExecution(executionId: string, token: string, result: ExecutionResult, runnerName?: string): {
    id: string;
    status: string;
};
export declare function refreshExecutionQueue(): void;
export declare function cancelCaseExecutions(caseId: string): {
    found: number;
    cancelled: number;
};

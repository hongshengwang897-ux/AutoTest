export interface ExecutionResult {
    status: "pass" | "fail";
    logs: {
        timestamp: string;
        level: "info" | "warn" | "error";
        message: string;
    }[];
    duration: number;
    error?: string;
    steps: {
        id: string;
        action: string;
        selector: string;
        status: string;
        duration: number;
    }[];
    screenshot?: string;
    /** 仅当 Promise.race 的胜出者是 abort（用户取消）时为 true，用于取消竞态下区分「被取消」与「真实失败」 */
    cancelled?: boolean;
}
export interface ExecutionOptions {
    timeoutMs?: number;
    screenshotOnFailure?: boolean;
    visualBaselines?: Record<string, VisualBaseline>;
}
export interface VisualBaseline {
    image: string;
    similarityThreshold: number;
}
/** 延迟数值 clamp（0~10000ms），防止脏配置产生极端值 */
export declare function clampDelayMs(value: unknown, fallback: number): number;
/**
 * 包装用户脚本为可执行函数体
 * 去掉 import 声明、test() 包装，只保留测试步骤
 */
export declare function wrapScript(script: string): string;
/**
 * 执行用例脚本并返回结果
 */
export declare function executeCase(script: string, scriptName?: string, baseUrl?: string, signal?: AbortSignal, options?: ExecutionOptions): Promise<ExecutionResult>;

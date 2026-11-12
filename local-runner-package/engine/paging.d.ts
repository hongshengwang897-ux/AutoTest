/**
 * 分页参数安全解析：非法/缺失值回落到默认值，避免 parseInt(NaN) 导致 slice(NaN) 返回空列表
 */
export declare function safePage(value: unknown, fallback?: number): number;
export declare function safeLimit(value: unknown, fallback?: number, max?: number): number;

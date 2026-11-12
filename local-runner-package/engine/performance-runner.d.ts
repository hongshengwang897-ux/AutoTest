/**
 * 延迟样本增量统计：
 * - samples：完整样本集（capped maxSamples），仅结束时精确排序一次；
 * - sum/min/max：标量计数器，快照时 O(1) 得到 avg/min/max；
 * - ring：有界环形缓冲（环形覆盖保留最近样本），快照分位数用它估算，
 *   避免每秒对最多 200 万条样本做 O(n log n) 全量排序、扭曲测量延迟。
 */
export interface LatencyStats {
    samples: number[];
    sum: number;
    min: number;
    max: number;
    ring: Float64Array;
    ringIndex: number;
    ringFilled: number;
    maxSamples: number;
}
export declare function createLatencyStats(ringCapacity: number, maxSamples?: number): LatencyStats;
/** 增量记录一条延迟样本：标量计数器 O(1) 更新；环形缓冲环形覆盖保留最近 ringCapacity 条 */
export declare function recordLatency(stats: LatencyStats, value: number): void;
/** O(1) 平均响应时间（标量计数器，与对完整样本集 reduce 的结果一致） */
export declare function latencyAvg(stats: LatencyStats): number;
/** 快照用分位数估算：对环形缓冲中的最近样本排序（O(R log R)，R ≤ 5 万，远小于全量 200 万） */
export declare function latencyPercentileEstimate(stats: LatencyStats, q: number): number;
export declare function queuePerformanceRun(scenarioId: string): Promise<Record<string, any> | null>;
export declare function cancelPerformanceRun(runId: string): boolean;
export declare function markInterruptedPerformanceRuns(): void;

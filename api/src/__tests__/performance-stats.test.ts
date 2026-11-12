import { describe, it, expect, vi } from "vitest";

// db.ts 在模块加载期就会打开真实 SQLite（建表 + 迁移），单测中 mock 掉，避免测试触碰真实数据库
vi.mock("../data/db.js", () => ({
  all: () => [],
  get: () => null,
  insert: () => {},
  update: () => true,
  remove: () => false,
  query: () => [],
  exec: () => 0,
  createId: () => "test-id",
  now: () => "2026-01-01T00:00:00.000Z",
}));

import {
  createLatencyStats,
  recordLatency,
  latencyAvg,
  latencyPercentileEstimate,
  type LatencyStats,
} from "../performance-runner.js";

/** 确定性伪随机样本（Lehmer RNG，乘法结果不超过 2^53，保证可复现、不抖动） */
function makeSamples(count: number): number[] {
  const samples: number[] = [];
  let seed = 42;
  for (let index = 0; index < count; index += 1) {
    seed = (seed * 48271) % 2147483647;
    samples.push(20 + (seed % 500) + (index % 7));
  }
  return samples;
}

/** 与 performance-runner 的 percentile 相同定义的参照实现（有序数组取 ceil(q*n)-1 位） */
function manualPercentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

function recordAll(stats: LatencyStats, samples: number[]): void {
  for (const value of samples) recordLatency(stats, value);
}

describe("performance-runner 增量延迟统计", () => {
  it("标量计数器（sum/avg/min/max）与对全量样本 reduce/sort 的结果一致", () => {
    const samples = makeSamples(10_000);
    const stats = createLatencyStats(50_000);
    recordAll(stats, samples);

    expect(stats.samples).toEqual(samples); // 未超上限时完整样本集逐一保留
    const manualSum = samples.reduce((total, value) => total + value, 0);
    expect(stats.sum).toBe(manualSum);
    expect(latencyAvg(stats)).toBeCloseTo(manualSum / samples.length, 6);
    expect(stats.min).toBe(samples.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY));
    expect(stats.max).toBe(samples.reduce((max, value) => Math.max(max, value), 0));
  });

  it("样本未超环形缓冲容量时，快照估算分位数与精确分位数完全一致", () => {
    const samples = makeSamples(10_000);
    const stats = createLatencyStats(50_000);
    recordAll(stats, samples);
    for (const q of [0.5, 0.9, 0.95, 0.99]) {
      expect(latencyPercentileEstimate(stats, q)).toBe(manualPercentile(samples, q));
    }
  });

  it("环形缓冲覆盖后，估算分位数对应最近 capacity 条样本", () => {
    const samples = makeSamples(2_500);
    const stats = createLatencyStats(1_000);
    recordAll(stats, samples);

    expect(stats.ringFilled).toBe(1_000);
    const recent = samples.slice(samples.length - 1_000);
    for (const q of [0.5, 0.95]) {
      expect(latencyPercentileEstimate(stats, q)).toBe(manualPercentile(recent, q));
    }
  });

  it("样本数达到 maxSamples 后停止计入完整样本集与标量，环形缓冲继续滚动", () => {
    const all: number[] = [];
    for (let value = 0; value < 150; value += 1) all.push(value);
    const stats = createLatencyStats(50, 100);
    recordAll(stats, all);

    expect(stats.samples).toEqual(all.slice(0, 100)); // 完整样本集截断到 maxSamples
    expect(stats.sum).toBe(4950); // 0+1+...+99，与原“capped 数组 reduce”语义一致
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(99);
    expect(stats.ringFilled).toBe(50);
    // 估算基于最近 50 条（100~149），而非被截断的完整样本集
    expect(latencyPercentileEstimate(stats, 0.5)).toBe(manualPercentile(all.slice(100), 0.5));
  });

  it("空样本时统计不产生 NaN", () => {
    const stats = createLatencyStats(100);
    expect(latencyAvg(stats)).toBe(0);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(latencyPercentileEstimate(stats, 0.95)).toBe(0);
  });

  it("大样本量下环形缓冲估算与精确分位数偏差在允许范围内（<5%）", () => {
    const samples = makeSamples(120_000);
    const stats = createLatencyStats(50_000);
    recordAll(stats, samples);
    for (const q of [0.5, 0.95]) {
      const estimate = latencyPercentileEstimate(stats, q);
      const exact = manualPercentile(samples, q);
      expect(Math.abs(estimate - exact) / Math.max(exact, 1)).toBeLessThan(0.05);
    }
  });
});

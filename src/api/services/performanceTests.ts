import { del, get, post, put } from "../client";
import { API } from "../endpoints";
import type { ApiAssertion, ApiKeyValue } from "./apiTests";

export interface PerformanceCustomRequest {
  id: string;
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  url: string;
  headers: ApiKeyValue[];
  queryParams: ApiKeyValue[];
  bodyType: "none" | "json" | "text" | "form";
  body: string;
  assertions: ApiAssertion[];
  variables: Record<string, string>;
}

export interface PerformanceScenario {
  id: string;
  name: string;
  description: string;
  targetType: "cases" | "collection" | "custom";
  targetIds: string[];
  customRequests: PerformanceCustomRequest[];
  collectionPath: string;
  environmentId: string;
  concurrency: number;
  executionMode: "duration" | "samples";
  sampleCount: number;
  durationSeconds: number;
  rampUpSeconds: number;
  timeoutMs: number;
  thinkTimeMs: number;
  useProxyPool: boolean;
  successRateThreshold: number;
  p95ThresholdMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceMetric {
  timestamp: string;
  elapsedSeconds: number;
  activeUsers: number;
  requests: number;
  success: number;
  failure: number;
  rps: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  bytes: number;
  bytesSent: number;
}

export interface PerformanceTransaction {
  caseId: string;
  caseName: string;
  method: string;
  url: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  requestsPerSecond: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50ResponseTime: number;
  p90ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  bytesReceived: number;
  bytesSent: number;
  statusCodes: Record<string, number>;
}

export interface PerformanceSlaResult {
  id: string;
  name: string;
  operator: ">=" | "<=";
  target: number;
  actual: number;
  unit: string;
  passed: boolean;
}

export interface PerformanceRun {
  id: string;
  scenarioId: string;
  scenarioName: string;
  status: "pending" | "running" | "success" | "failed" | "cancelled";
  startedAt?: string;
  endedAt?: string;
  duration: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  bytesReceived: number;
  bytesSent: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50ResponseTime: number;
  p90ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
  metrics: PerformanceMetric[];
  errors: { message: string; count: number }[];
  statusCodes: Record<string, number>;
  transactions: PerformanceTransaction[];
  slaResults: PerformanceSlaResult[];
  config: Partial<PerformanceScenario> & { caseCount?: number; proxyCount?: number };
  errorMessage: string;
  createdAt: string;
}

export const performanceTestsService = {
  checkProxyPool() {
    return get<{ available: boolean; count: number; source: string; message: string }>(API.performanceTests.proxyPoolStatus, { timeout: 20000 });
  },
  listScenarios() {
    return get<{ items: PerformanceScenario[]; total: number }>(API.performanceTests.scenarios);
  },
  createScenario(data: Partial<PerformanceScenario>) {
    return post<PerformanceScenario>(API.performanceTests.scenarios, data);
  },
  updateScenario(id: string, data: Partial<PerformanceScenario>) {
    return put<PerformanceScenario>(API.performanceTests.scenario(id), data);
  },
  removeScenario(id: string) {
    return del(API.performanceTests.scenario(id));
  },
  startRun(id: string) {
    return post<PerformanceRun>(API.performanceTests.runScenario(id), undefined, { timeout: 30000 });
  },
  listRuns(params?: { scenarioId?: string; limit?: number }) {
    return get<{ items: PerformanceRun[]; total: number }>(API.performanceTests.runs, { params });
  },
  getRun(id: string) {
    return get<PerformanceRun>(API.performanceTests.run(id));
  },
  getProgress(id: string) {
    return get<PerformanceRun>(API.performanceTests.progress(id));
  },
  cancelRun(id: string) {
    return post<{ ok: true }>(API.performanceTests.cancel(id));
  },
  removeRun(id: string) {
    return del(API.performanceTests.run(id));
  },
};

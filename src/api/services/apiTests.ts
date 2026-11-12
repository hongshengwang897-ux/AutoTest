import { get, post, put, del } from "../client";
import { API } from "../endpoints";
import type { EnvironmentItem } from "./environments";

export interface ApiKeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface ApiAssertion {
  id: string;
  source: "status" | "body" | "header" | "json";
  operator: "equals" | "not_equals" | "contains" | "not_contains" | "exists" | "not_exists" | "matches" | "greater_than" | "less_than";
  target: string;
  expected: string;
}

export interface ApiExtraction {
  id: string;
  /** 目标变量名 */
  variable: string;
  /** 响应 JSON 路径，支持 data.token 与 $.data.token */
  path: string;
  /** 写入位置：当前用例变量 或 接口环境变量 */
  scope: "case" | "environment";
}

export interface ApiTestCase {
  id: string;
  name: string;
  description: string;
  method: string;
  url: string;
  headers: ApiKeyValue[];
  queryParams: ApiKeyValue[];
  bodyType: "none" | "json" | "text" | "form";
  body: string;
  assertions: ApiAssertion[];
  variables: Record<string, string>;
  extractions: ApiExtraction[];
  environmentId: string;
  group: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiAssertionResult extends ApiAssertion {
  actual: string;
  passed: boolean;
  message: string;
}

export interface ApiTestExecution {
  id: string;
  caseId: string;
  caseName: string;
  status: "success" | "failed" | "error";
  method: string;
  url: string;
  statusCode: number | null;
  duration: number;
  responseSize: number;
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
  assertionResults: ApiAssertionResult[];
  errorMessage: string;
  createdAt: string;
}

export interface ApiCollectionSummary {
  path: string;
  name: string;
  total: number;
}

export interface ApiCollectionRunItem {
  id: string;
  executionId: string;
  caseId: string;
  caseName: string;
  method: string;
  url: string;
  status: "success" | "failed" | "error";
  statusCode: number | null;
  duration: number;
  assertionTotal: number;
  assertionPassed: number;
  errorMessage: string;
  sortOrder: number;
}

export interface ApiCollectionRun {
  id: string;
  collectionPath: string;
  collectionName: string;
  scheduleId: string;
  triggerType: "manual" | "schedule";
  environmentId: string;
  status: "running" | "success" | "failed";
  total: number;
  passed: number;
  failed: number;
  duration: number;
  items: ApiCollectionRunItem[];
  startedAt: string;
  endedAt?: string;
  createdAt: string;
}

export type PostmanImportResult =
  | {
      kind: "collection";
      collectionName: string;
      imported: number;
      skipped: number;
      warnings: string[];
      items: ApiTestCase[];
    }
  | {
      kind: "environment";
      environment: EnvironmentItem;
      importedVariables: number;
      skippedVariables: number;
      updated: boolean;
      warnings: string[];
    };

export const apiTestsService = {
  listCases(params?: { search?: string; group?: string }) {
    return get<{ items: ApiTestCase[]; total: number }>(API.apiTests.cases, { params });
  },
  getCase(id: string) {
    return get<ApiTestCase>(API.apiTests.case(id));
  },
  createCase(data: Partial<ApiTestCase>) {
    return post<ApiTestCase>(API.apiTests.cases, data);
  },
  updateCase(id: string, data: Partial<ApiTestCase>) {
    return put<ApiTestCase>(API.apiTests.case(id), data);
  },
  removeCase(id: string) {
    return del(API.apiTests.case(id));
  },
  reorderCases(items: { id: string; group: string; sortOrder: number }[]) {
    return put<{ ok: true }>(`${API.apiTests.cases}/reorder`, { items });
  },
  run(data: Partial<ApiTestCase> & { timeoutMs?: number }) {
    return post<ApiTestExecution>(API.apiTests.run, data, { timeout: 125000 });
  },
  importPostman(collection: unknown) {
    return post<PostmanImportResult>(API.apiTests.importPostman, { collection }, { timeout: 60000 });
  },
  listExecutions(params?: { caseId?: string; limit?: number }) {
    return get<{ items: ApiTestExecution[]; total: number }>(API.apiTests.executions, { params });
  },
  listCollections() {
    return get<{ items: ApiCollectionSummary[] }>(API.apiTests.collections);
  },
  runCollection(data: { collectionPath: string; environmentId?: string }) {
    return post<ApiCollectionRun>(API.apiTests.collectionRun, data);
  },
  listCollectionRuns(params?: { status?: string; limit?: number }) {
    return get<{ items: ApiCollectionRun[]; total: number }>(API.apiTests.collectionRuns, { params });
  },
  getCollectionRun(id: string) {
    return get<ApiCollectionRun>(API.apiTests.collectionRunDetail(id));
  },
  removeCollectionRun(id: string) {
    return del(API.apiTests.collectionRunDetail(id));
  },
  // 执行历史列表为瘦身数据，响应体/断言等重字段需按 id 拉详情
  getExecution(id: string) {
    return get<ApiTestExecution>(API.apiTests.execution(id));
  },
  removeExecution(id: string) {
    return del(API.apiTests.execution(id));
  },
};

import { get, post, put, del } from "../client";
import { API } from "../endpoints";
import type { ElementAction } from "@/types";

const LOCAL_RUNNER_URL = "http://127.0.0.1:3210";

export interface LocalRunnerStatus {
  status: "ready";
  runnerName: string;
  busy: boolean;
  version: string;
}

interface LocalExecutionJob {
  executionId: string;
  token: string;
  caseId: string;
  caseName: string;
  script: string;
  baseUrl: string;
  reportUrl: string;
  options: Record<string, any>;
}

async function fetchLocalRunner(path: string, init?: RequestInit, timeoutMs = 3000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${LOCAL_RUNNER_URL}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface CaseStep {
  id: string;
  description: string;
  action: ElementAction;
  selector: string;
  value: string;
  expectedResult: string;
  assertionType?: CaseAssertionType;
  assertionAttribute?: string;
  expectedImage?: string;
  imageSimilarityThreshold?: number;
}

export type CaseAssertionType =
  | "visible"
  | "hidden"
  | "exists"
  | "not_exists"
  | "text_equals"
  | "text_contains"
  | "value_equals"
  | "attribute_equals"
  | "count_equals"
  | "enabled"
  | "disabled"
  | "checked"
  | "unchecked"
  | "url_equals"
  | "url_contains"
  | "title_equals"
  | "title_contains"
  | "image";

export interface CaseItem {
  id: string;
  name: string;
  description: string;
  script: string;
  steps: CaseStep[];
  language: string;
  tags: string[];
  group: string;
  environmentId: string;
  preconditionCaseId: string;
  preconditionCaseIds: string[];
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export const casesService = {
  async getLocalRunnerStatus(): Promise<LocalRunnerStatus | null> {
    try {
      const response = await fetchLocalRunner("/health");
      return response.ok ? await response.json() as LocalRunnerStatus : null;
    } catch {
      return null;
    }
  },
  list(params?: { search?: string; status?: string; group?: string; page?: number; limit?: number }) {
    return get<{ items: CaseItem[]; total: number }>(API.cases, { params } as any);
  },
  getById(id: string) {
    return get<CaseItem>(API.case(id));
  },
  create(data: Partial<CaseItem>) {
    return post<CaseItem>(API.cases, data);
  },
  update(id: string, data: Partial<CaseItem>) {
    return put<CaseItem>(API.case(id), data);
  },
  remove(id: string) {
    return del(API.case(id));
  },
  /** 本地执行器批量跑完后，推送一次汇总（单条不推） */
  batchNotify(data: { name?: string; total: number; pass: number; fail: number }) {
    return post<{ message: string }>(API.caseBatchNotify, data);
  },
  async execute(id: string) {
    const runner = await this.getLocalRunnerStatus();
    if (!runner) {
      return { ok: false, data: null, error: "本地执行器未启动，请先下载安装并运行本地执行器", status: 0 };
    }

    const prepared = await post<LocalExecutionJob>(API.caseExecuteLocal(id), {
      publicApiBaseUrl: window.location.origin,
    }, { timeout: 60000 });
    if (!prepared.ok) return prepared;
    const job = prepared.data;
    const startedAt = Date.now();
    try {
      const runnerResponse = await fetchLocalRunner("/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(job),
      }, 30 * 60 * 1000);
      const local = await runnerResponse.json().catch(() => ({}));
      if (!local.reported && local.result) {
        const reported = await post(API.executionLocalResult(job.executionId), {
          token: job.token,
          result: local.result,
          runnerName: local.runnerName || runner.runnerName,
        }, { timeout: 60000 });
        if (!reported.ok) return { ...reported, error: `本机已执行，但报告保存失败: ${reported.error}` };
      }
      if (!runnerResponse.ok) {
        return { ok: false, data: null, error: local.error || local.result?.error || "本地执行失败", status: runnerResponse.status };
      }
      return {
        ok: true,
        data: { id: job.executionId, status: local.result?.status === "pass" ? "success" : "failed" },
        status: 200,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法连接本地执行器";
      await post(API.executionLocalResult(job.executionId), {
        token: job.token,
        runnerName: runner.runnerName,
        result: {
          status: "fail",
          logs: [{ timestamp: new Date().toISOString(), level: "error", message }],
          duration: Date.now() - startedAt,
          error: message,
          steps: [],
        },
      }, { timeout: 60000 });
      return { ok: false, data: null, error: `本地执行器连接中断: ${message}`, status: 0 };
    }
  },
  async cancel(id: string) {
    try {
      const response = await fetchLocalRunner(`/cancel/${encodeURIComponent(id)}`, { method: "POST" });
      if (response.ok) {
        const result = await response.json();
        if (result.ok) return { ok: true, data: result, status: 200 };
      }
    } catch { /* server-side executions still use the central cancellation endpoint */ }
    return post(API.caseCancel(id));
  },
};

import { get, del } from "../client";
import { API } from "../endpoints";

export interface ExecutionItem {
  id: string;
  caseId: string;
  caseName: string;
  status: "pending" | "running" | "success" | "failed" | "timeout" | string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  logs: { timestamp: string; level: string; message: string }[];
  steps: { id: string; name?: string; action: string; selector: string; status: string; duration?: number; elementDiff?: any }[];
  screenshots?: string[];
  errorMessage?: string;
}

export const executionsService = {
  list(params?: { status?: string; caseId?: string; page?: number; limit?: number }) {
    return get<{ items: ExecutionItem[]; total: number }>(API.executions, { params } as any);
  },
  getById(id: string) {
    return get<ExecutionItem>(API.execution(id));
  },
  getLogs(id: string) {
    return get<{ logs: ExecutionItem["logs"] }>(API.executionLogs(id));
  },
  remove(id: string) {
    return del(API.execution(id));
  },
};

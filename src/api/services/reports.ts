import { get } from "../client";
import { API } from "../endpoints";

export interface ReportItem {
  id: string;
  executionId: string;
  caseId: string;
  caseName: string;
  status: string;
  startTime: string;
  endTime: string;
  duration: number;
  steps: { id: string; action: string; selector: string; status: string; duration?: number; error?: string }[];
  screenshots: string[];
  errorMessage?: string;
  createdAt: string;
}

export const reportsService = {
  list(params?: { status?: string; caseId?: string; page?: number; limit?: number }) {
    return get<{ items: ReportItem[]; total: number }>(API.reports, { params } as any);
  },
  getById(id: string) {
    return get<ReportItem>(API.report(id));
  },
};

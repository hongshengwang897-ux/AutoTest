import { get } from "../client";
import { API } from "../endpoints";

export interface DashboardStats {
  totalCases: number;
  activeCases: number;
  totalExecutions: number;
  todayExecutions: number;
  passRate: number;
  totalElements: number;
  totalEnvironments: number;
  totalAlerts: number;
  recentExecutions: {
    id: string;
    caseId: string;
    caseName: string;
    status: string;
    startTime?: string;
    endTime?: string;
    duration?: number;
  }[];
  trends: {
    date: string;
    total: number;
    passed: number;
    failed: number;
  }[];
}

export const statsService = {
  get() {
    return get<DashboardStats>(API.stats);
  },
};

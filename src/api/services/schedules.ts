import { get, post, put, del } from "../client";
import { API } from "../endpoints";

export interface ScheduleItem {
  id: string;
  name: string;
  cronExpression: string;
  caseIds: string[];
  environmentId: string;
  enabled: boolean;
  lastRunTime?: string;
  nextRunTime?: string;
  targetType: "platform" | "api_collection";
  collectionPath: string;
}

export const schedulesService = {
  list() {
    return get<{ items: ScheduleItem[] }>(API.schedules);
  },
  create(data: Partial<ScheduleItem>) {
    return post<ScheduleItem>(API.schedules, data);
  },
  update(id: string, data: Partial<ScheduleItem>) {
    return put<ScheduleItem>(API.schedule(id), data);
  },
  toggle(id: string) {
    return post<ScheduleItem>(API.scheduleToggle(id));
  },
  run(id: string) {
    return post<{ accepted: boolean; runId?: string }>(API.scheduleRun(id));
  },
  remove(id: string) {
    return del(API.schedule(id));
  },
};

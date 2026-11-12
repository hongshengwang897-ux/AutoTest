import { get, post, put } from "../client";
import { API } from "../endpoints";

export interface SettingsData {
  profile: {
    name: string;
    email: string;
    title: string;
    department: string;
    avatar?: string;
  };
  notifications: {
    executionComplete: boolean;
    failureOnly: boolean;
    systemAlerts: boolean;
    dailyDigest: boolean;
  };
  maxConcurrency: number;
  defaultTimeout: number;
  retryOnFailure: boolean;
  maxRetries: number;
  screenshotOnFailure: boolean;
  videoRecording: boolean;
  notifyOnComplete: boolean;
}

export const settingsService = {
  get() {
    return get<SettingsData>(API.settings);
  },
  update(data: SettingsData) {
    return put<SettingsData>(API.settings, data);
  },
  exportData() {
    return get<Record<string, unknown>>(API.settingsExport);
  },
  importData(data: Record<string, unknown>) {
    return post<{ imported: Record<string, number> }>(API.settingsImport, data);
  },
};

import { get, post, put, del } from "../client";
import { API } from "../endpoints";

export interface EnvironmentItem {
  id: string;
  name: string;
  url: string;
  type: string;
  scope: "platform" | "api";
  variables: Record<string, string>;
  accounts: { username: string; password: string; role: string }[];
  status: string;
}

/** Postman 环境导入结果（支持单环境对象与多环境数组） */
export type PostmanEnvironmentsImportResult = {
  kind: "environments";
  imported: number;
  updated: number;
  skipped: number;
  environments: EnvironmentItem[];
  warnings: string[];
};

export const environmentsService = {
  list(params?: { scope?: "platform" | "api" }) {
    return get<{ items: EnvironmentItem[] }>(API.environments, { params });
  },
  create(data: Partial<EnvironmentItem>) {
    return post<EnvironmentItem>(API.environments, data);
  },
  update(id: string, data: Partial<EnvironmentItem>) {
    return put<EnvironmentItem>(API.environment(id), data);
  },
  remove(id: string) {
    return del(API.environment(id));
  },
  importPostman(collection: unknown, scope: "platform" | "api") {
    return post<PostmanEnvironmentsImportResult>(API.environmentsImportPostman, { collection, scope }, { timeout: 60000 });
  },
};

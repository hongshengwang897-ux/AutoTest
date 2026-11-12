import { get, post, put, del } from "../client";
import { API } from "../endpoints";

export interface ModuleItem {
  id: string;
  name: string;
  parentId: string;
  sortOrder: number;
  createdAt: string;
}

export const modulesService = {
  list() {
    return get<{ items: ModuleItem[] }>(API.modules);
  },
  create(data: { name: string; parentId?: string }) {
    return post<ModuleItem>(API.modules, data);
  },
  update(id: string, data: { name?: string; parentId?: string }) {
    return put<ModuleItem>(API.module(id), data);
  },
  remove(id: string) {
    return del(API.module(id));
  },
};

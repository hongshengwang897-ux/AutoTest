import { get, post, put, del } from "../client";
import { API } from "../endpoints";

export interface ElementItem {
  id: string;
  name: string;
  type: string;
  selector: string;
  selectorType: "css" | "xpath" | "text" | "role";
  page: string;
  description?: string;
  tags: string[];
  source: "recording" | "auto-import" | "manual";
  usageCount: number;
  lastUsed?: string;
  createdAt: string;
}

export const elementsService = {
  list(params?: { search?: string; type?: string; source?: string; page?: number; limit?: number }) {
    return get<{ items: ElementItem[]; total: number }>(API.elements, { params } as any);
  },
  getById(id: string) {
    return get<ElementItem>(API.element(id));
  },
  create(data: Partial<ElementItem>) {
    return post<ElementItem>(API.elements, data);
  },
  batchCreate(items: Partial<ElementItem>[]) {
    return post<{ created: number; items: ElementItem[] }>(API.elementsBatch, { elements: items });
  },
  update(id: string, data: Partial<ElementItem>) {
    return put<ElementItem>(API.element(id), data);
  },
  remove(id: string) {
    return del(API.element(id));
  },
};

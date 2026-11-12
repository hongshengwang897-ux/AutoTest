import { create } from "zustand";
import { elementsService } from "@/api/services";
import type { ElementItem as ApiElement } from "@/api/services";

export interface ElementItem {
  id: string;
  name: string;
  type: string;
  selector: string;
  selectorType: "css" | "xpath" | "text" | "role";
  page: string;
  pageTitle?: string;
  description?: string;
  tags: string[];
  source: string;
  usageCount: number;
  lastUsed?: string;
  createdAt: string;
}

interface ElementState {
  elements: ElementItem[];
  loading: boolean;
  error: string | null;

  /** 从 API 加载元素列表 */
  loadElements: () => Promise<void>;

  /** 批量添加（调用 API） */
  addElements: (items: Partial<ElementItem>[]) => Promise<{ ok: boolean; error?: string }>;

  /** 删除元素 */
  removeElement: (id: string) => Promise<{ ok: boolean; error?: string }>;

  /** 更新元素 */
  updateElement: (id: string, updates: Partial<ElementItem>) => Promise<{ ok: boolean; error?: string }>;

  /** 按来源统计 */
  getElementCountBySource: () => Record<string, number>;
}

function mapApi(el: ApiElement): ElementItem {
  return {
    id: el.id,
    name: el.name,
    type: el.type,
    selector: el.selector,
    selectorType: el.selectorType,
    page: el.page,
    pageTitle: el.page,
    description: el.description,
    tags: el.tags,
    source: el.source,
    usageCount: el.usageCount,
    lastUsed: el.lastUsed,
    createdAt: el.createdAt,
  };
}

export const useElementStore = create<ElementState>((set, get) => ({
  elements: [],
  loading: false,
  error: null,

  loadElements: async () => {
    set({ loading: true, error: null });
    const res = await elementsService.list({ limit: 200 });
    if (res.ok) {
      set({ elements: res.data.items.map(mapApi), loading: false });
    } else {
      set({ error: res.error || "加载失败", loading: false });
    }
  },

  addElements: async (items) => {
    const res = await elementsService.batchCreate(items as any);
    if (res.ok) {
      const mapped = res.data.items.map(mapApi);
      set((state) => ({ elements: [...mapped, ...state.elements], error: null }));
      return { ok: true };
    }
    const error = res.error || "保存元素失败";
    set({ error });
    return { ok: false, error };
  },

  removeElement: async (id) => {
    const res = await elementsService.remove(id);
    if (res.ok) {
      set((state) => ({ elements: state.elements.filter((el) => el.id !== id), error: null }));
      return { ok: true };
    }
    const error = res.error || "删除元素失败";
    set({ error });
    return { ok: false, error };
  },

  updateElement: async (id, updates) => {
    const res = await elementsService.update(id, updates as any);
    if (res.ok) {
      set((state) => ({
        elements: state.elements.map((el) => (el.id === id ? { ...el, ...updates } : el)),
        error: null,
      }));
      return { ok: true };
    }
    const error = res.error || "更新元素失败";
    set({ error });
    return { ok: false, error };
  },

  getElementCountBySource: () => {
    const { elements } = get();
    return {
      recording: elements.filter((el) => el.source === "recording").length,
      "auto-import": elements.filter((el) => el.source === "auto-import").length,
      manual: elements.filter((el) => el.source === "manual").length,
    };
  },
}));

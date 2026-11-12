import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Search,
  Plus,
  Copy,
  Tag,
  Filter,
  Grid3X3,
  List,
  Star,
  Edit,
  Trash2,
  ChevronDown,
  Eye,
  Hash,
  MousePointerClick,
  Type,
  Link2,
  Image as ImageIcon,
  Sparkles,
  CheckCircle,
  X,
  Zap,
  Globe,
  Download,
  Play,
  Square,
  CheckSquare,
  Folder,
  FolderDot,
  FolderOpen,
  Loader2,
  Monitor,
} from "lucide-react";
import {
  elementTypeLabels,
  elementSourceLabels,
} from "@/data/elements";
import { useElementStore } from "@/store/elementStore";
import type { ElementItem, ElementType, ElementSource, DetectedElement } from "@/types";
import { confirmAction } from "@/components/ConfirmDialog";
import { writeClipboard } from "@/lib/clipboard";
import { get, post } from "@/api/client";

const typeIcons: Record<ElementType, typeof Type> = {
  button: MousePointerClick,
  input: Type,
  text: Type,
  link: Link2,
  image: ImageIcon,
  select: ChevronDown,
  checkbox: CheckCircle,
  radio: CheckCircle,
  container: Grid3X3,
};

type DialogMode = "none" | "manual" | "auto-import" | "page-import";

export default function ElementLibrary() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ElementType | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<ElementSource | "all">("all");
  const [pageFilter, setPageFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<ElementItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>("none");
  const [editingElement, setEditingElement] = useState<ElementItem | null>(null);

  // 批量选择
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const elements = useElementStore((s) => s.elements);
  const addElements = useElementStore((s) => s.addElements);
  const removeElement = useElementStore((s) => s.removeElement);
  const updateElement = useElementStore((s) => s.updateElement);
  const loadElements = useElementStore((s) => s.loadElements);

  useEffect(() => { loadElements(); }, []);

  const allPages = useMemo(
    () => Array.from(new Set(elements.map((e) => e.page).filter(Boolean))).sort(),
    [elements]
  );
  const allTypes = Array.from(new Set(elements.map((e) => e.type))) as ElementType[];

  const filtered = elements.filter((el) => {
    const matchSearch =
      el.name.toLowerCase().includes(search.toLowerCase()) ||
      el.selector.toLowerCase().includes(search.toLowerCase()) ||
      (el.description || "").toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || el.type === typeFilter;
    const matchSource = sourceFilter === "all" || el.source === sourceFilter;
    const matchPage = pageFilter === "all" || el.page === pageFilter;
    return matchSearch && matchType && matchSource && matchPage;
  });

  // 批量选择逻辑
  const allFilteredSelected = filtered.length > 0 && filtered.every((el) => selectedIds.has(el.id));
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((el) => el.id)));
    }
  };
  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toastTimerRef = useRef<number | undefined>(undefined);
  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    // 新消息先清掉旧定时器，避免互相覆盖提前消失
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  // 卸载时清理 toast 定时器
  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!await confirmAction({ title: "批量删除元素？", message: `将删除选中的 ${selectedIds.size} 个元素。`, detail: "此操作无法恢复。", confirmLabel: "确认删除" })) return;
    setBatchDeleting(true);
    let done = 0;
    for (const id of selectedIds) {
      await removeElement(id);
      done++;
    }
    flashToast(`已删除 ${done} 个元素`);
    setBatchDeleting(false);
    setSelectedIds(new Set());
    if (selected && selectedIds.has(selected.id)) setSelected(null);
  };

  const copySelector = async (el: ElementItem) => {
    if (await writeClipboard(el.selector)) {
      setCopiedId(el.id);
      setTimeout(() => setCopiedId(null), 1500);
    } else {
      flashToast("复制失败，请手动选择选择器");
    }
  };

  const addElement = async (newEl: ElementItem) => {
    const result = await addElements([newEl]);
    if (result.ok) flashToast("元素已保存");
    else flashToast(result.error || "保存元素失败");
    return result.ok;
  };

  const deleteElement = async (id: string) => {
    const result = await removeElement(id);
    if (!result.ok) {
      flashToast(result.error || "删除元素失败");
      return;
    }
    if (selected?.id === id) setSelected(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  return (
    <div className="h-screen flex flex-col animate-fade-in">
      {/* Header */}
      <div className="px-6 py-3 border-b border-border/60 bg-bg-card flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold mb-1 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            元素库
          </h1>
          <p className="text-sm text-text-tertiary">
            管理和复用页面元素选择器，共 {elements.length} 个元素
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDialogMode("page-import")}
            className="btn-secondary"
          >
            <Monitor className="w-4 h-4" />
            按页面导入
          </button>
          <button
            onClick={() => setDialogMode("auto-import")}
            className="btn-secondary"
          >
            <Zap className="w-4 h-4" />
            自动识别导入
          </button>
          <button
            onClick={() => { setEditingElement(null); setDialogMode("manual"); }}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            新建元素
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar — page groups */}
        <div className="w-56 border-r border-border/60 bg-bg-card flex flex-col overflow-hidden">
          {/* 页面分组标题 */}
          <div className="p-3 border-b border-border/60">
            <h3 className="text-xs font-medium text-text-tertiary uppercase flex items-center gap-2">
              <FolderOpen className="w-3.5 h-3.5" />
              页面分组
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            <button
              onClick={() => setPageFilter("all")}
              className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                pageFilter === "all"
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-text-secondary hover:bg-bg-elevated"
              }`}
            >
              <Folder className="w-4 h-4" />
              全部页面
              <span className="ml-auto text-xs text-text-tertiary">{elements.length}</span>
            </button>
            {allPages.map((p) => {
              const count = elements.filter((e) => e.page === p).length;
              return (
                <button
                  key={p}
                  onClick={() => setPageFilter(p)}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                    pageFilter === p
                      ? "bg-accent/10 text-accent font-medium"
                      : "text-text-secondary hover:bg-bg-elevated"
                  }`}
                >
                  <FolderDot className="w-4 h-4 shrink-0" />
                  <span className="truncate">{p}</span>
                  <span className="ml-auto text-xs text-text-tertiary">{count}</span>
                </button>
              );
            })}
          </div>

          {/* 分隔 */}
          <div className="border-t border-border/60" />

          {/* 元素类型筛选 */}
          <div className="p-3 border-b border-border/60">
            <h3 className="text-xs font-medium text-text-tertiary uppercase mb-2">元素类型</h3>
            <div className="space-y-0.5">
              <button
                onClick={() => setTypeFilter("all")}
                className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                  typeFilter === "all" ? "bg-accent/15 text-accent" : "text-text-secondary hover:bg-bg-elevated"
                }`}
              >
                全部 ({elements.length})
              </button>
              {allTypes.map((type) => {
                const count = elements.filter((e) => e.type === type).length;
                const Icon = typeIcons[type];
                return (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-1.5 transition-colors ${
                      typeFilter === type
                        ? "bg-accent/15 text-accent"
                        : "text-text-secondary hover:bg-bg-elevated"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {elementTypeLabels[type]}
                    <span className="ml-auto text-text-tertiary">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 元素来源筛选 */}
          <div className="p-3">
            <h3 className="text-xs font-medium text-text-tertiary uppercase mb-2">元素来源</h3>
            <div className="space-y-0.5">
              <button
                onClick={() => setSourceFilter("all")}
                className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                  sourceFilter === "all" ? "bg-accent/15 text-accent" : "text-text-secondary hover:bg-bg-elevated"
                }`}
              >
                全部来源
              </button>
              {(Object.keys(elementSourceLabels) as ElementSource[]).map((src) => {
                const cfg = elementSourceLabels[src];
                const count = elements.filter((e) => e.source === src).length;
                return (
                  <button
                    key={src}
                    onClick={() => setSourceFilter(src)}
                    className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 transition-colors ${
                      sourceFilter === src
                        ? "bg-accent/15 text-accent"
                        : "text-text-secondary hover:bg-bg-elevated"
                    }`}
                  >
                    <span className="w-4 text-center">{cfg.icon}</span>
                    <span className="truncate">{cfg.label}</span>
                    <span className="ml-auto text-text-tertiary">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="px-6 py-3 border-b border-border/60 flex items-center gap-3 bg-bg-card flex-wrap">
            {/* 全选 */}
            <button
              onClick={toggleSelectAll}
              className="btn-ghost p-1.5 shrink-0"
              title={allFilteredSelected ? "取消全选" : "全选"}
            >
              {allFilteredSelected ? (
                <CheckSquare className="w-4 h-4 text-accent" />
              ) : (
                <Square className="w-4 h-4 text-text-tertiary" />
              )}
            </button>

            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                type="text"
                placeholder="搜索元素名称、选择器、描述..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10"
              />
            </div>

            {/* 批量操作工具栏 */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-1.5 animate-fade-in">
                <span className="text-xs text-text-tertiary mr-1">已选 {selectedIds.size}</span>
                <button
                  onClick={handleBatchDelete}
                  disabled={batchDeleting}
                  className="px-3 py-1.5 rounded-lg border border-danger/30 text-danger text-xs hover:bg-danger/10 transition-colors flex items-center gap-1"
                >
                  {batchDeleting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  批量删除
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-text-tertiary">
              <Filter className="w-4 h-4" />
              已过滤 {filtered.length} / {elements.length}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-1 bg-bg rounded-lg border border-border/60 p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === "grid" ? "bg-accent text-white" : "text-text-tertiary hover:text-text"
                }`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === "list" ? "bg-accent text-white" : "text-text-tertiary hover:text-text"
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Grid view */}
          {viewMode === "grid" ? (
            <div className="flex-1 overflow-y-auto p-6">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-text-tertiary">没有找到匹配的元素</div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {filtered.map((el) => {
                    const Icon = typeIcons[el.type];
                    const srcCfg = elementSourceLabels[el.source] || { label: el.source || "未知", color: "bg-bg-elevated text-text-tertiary border-border", icon: "📌" };
                    const isSel = selectedIds.has(el.id);
                    return (
                      <div
                        key={el.id}
                        className={`card p-4 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5 transition-all cursor-pointer group relative ${
                          isSel ? "border-accent/50 bg-accent/5 ring-1 ring-accent/20" : ""
                        }`}
                      >
                        {/* 复选框 - 左上角 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectOne(el.id);
                          }}
                          className={`absolute top-3 left-3 p-0.5 rounded transition-opacity ${
                            isSel ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          {isSel ? (
                            <CheckSquare className="w-4 h-4 text-accent" />
                          ) : (
                            <Square className="w-4 h-4 text-text-tertiary" />
                          )}
                        </button>
                        <div onClick={() => setSelected(el)}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2 ml-6">
                            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
                              <Icon className="w-4 h-4 text-accent" />
                            </div>
                            <div>
                              <div className="font-medium text-sm group-hover:text-accent transition-colors">
                                {el.name}
                              </div>
                              <div className="text-xs text-text-tertiary">
                                {elementTypeLabels[el.type]} · {el.page}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${srcCfg.color}`}>
                              {srcCfg.icon} {srcCfg.label}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copySelector(el);
                              }}
                              className="p-1 rounded hover:bg-bg-elevated text-text-tertiary hover:text-accent transition-colors"
                              title="复制选择器"
                            >
                              {copiedId === el.id ? (
                                <span className="text-xs text-success">✓</span>
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="bg-bg-elevated/50 rounded-md px-2.5 py-2 mb-3 border border-border/30">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-text-tertiary">{el.selectorType}</span>
                            <span className="text-text-tertiary">·</span>
                            <code className="text-accent font-mono truncate flex-1">{el.selector}</code>
                          </div>
                        </div>
                        <p className="text-xs text-text-secondary line-clamp-2 mb-3">{el.description}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 flex-wrap">
                            {(el.tags || []).slice(0, 2).map((tag) => (
                              <span key={tag} className="tag bg-accent/10 text-accent">
                                <Tag className="w-2.5 h-2.5 mr-0.5" />
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-text-tertiary">
                            <Star className="w-3 h-3" />
                            {el.usageCount}
                          </div>
                        </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-bg-elevated/50 border-b border-border/60">
                    <th className="w-10"></th>
                    <th className="text-left text-xs font-medium text-text-tertiary uppercase px-4 py-3">元素名称</th>
                    <th className="text-left text-xs font-medium text-text-tertiary uppercase px-4 py-3">类型</th>
                    <th className="text-left text-xs font-medium text-text-tertiary uppercase px-4 py-3">来源</th>
                    <th className="text-left text-xs font-medium text-text-tertiary uppercase px-4 py-3">选择器</th>
                    <th className="text-left text-xs font-medium text-text-tertiary uppercase px-4 py-3">页面</th>
                    <th className="text-right text-xs font-medium text-text-tertiary uppercase px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((el) => {
                    const Icon = typeIcons[el.type];
                    const srcCfg = elementSourceLabels[el.source] || { label: el.source || "未知", color: "bg-bg-elevated text-text-tertiary border-border", icon: "📌" };
                    const isSel = selectedIds.has(el.id);
                    return (
                      <tr
                        key={el.id}
                        className={`border-b border-border/30 hover:bg-bg-elevated/30 transition-colors cursor-pointer ${
                          isSel ? "bg-accent/5" : ""
                        }`}
                      >
                        <td className="px-3 py-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelectOne(el.id);
                            }}
                            className="p-0.5"
                          >
                            {isSel ? (
                              <CheckSquare className="w-4 h-4 text-accent" />
                            ) : (
                              <Square className="w-4 h-4 text-text-tertiary" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3" onClick={() => setSelected(el)}>
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4 text-accent" />
                            <span className="text-sm font-medium">{el.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary" onClick={() => setSelected(el)}>
                          {elementTypeLabels[el.type]}
                        </td>
                        <td className="px-4 py-3" onClick={() => setSelected(el)}>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${srcCfg.color}`}>
                            {srcCfg.icon} {srcCfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={() => setSelected(el)}>
                          <code className="text-xs text-accent font-mono bg-bg-elevated/50 px-2 py-1 rounded">
                            {el.selector}
                          </code>
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary" onClick={() => setSelected(el)}>{el.page}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copySelector(el);
                              }}
                              className="p-1.5 rounded hover:bg-accent/15 text-text-secondary hover:text-accent transition-colors"
                              title="复制"
                            >
                              {copiedId === el.id ? (
                                <span className="text-xs text-success">✓</span>
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteElement(el.id);
                              }}
                              className="p-1.5 rounded hover:bg-bg-elevated text-text-secondary hover:text-danger transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-3 border-t border-border/60 flex items-center justify-between text-sm text-text-tertiary">
            <span>共 {filtered.length} 个元素</span>
          <span>全部结果</span>
          </div>
        </div>
      </div>

      {/* Manual add dialog */}
      {dialogMode === "manual" && (
        <ManualAddDialog
          initial={editingElement}
          onClose={() => setDialogMode("none")}
          onAdd={async (el) => {
            if (editingElement) {
              const result = await updateElement(editingElement.id, el);
              if (result.ok) {
                flashToast("元素已更新");
                setDialogMode("none");
              }
              return result.ok;
            }
            const ok = await addElement(el);
            if (ok) setDialogMode("none");
            return ok;
          }}
        />
      )}

      {/* Auto-import dialog */}
      {dialogMode === "auto-import" && (
        <AutoImportDialog
          onClose={() => setDialogMode("none")}
          onImport={async (elements) => {
            const result = await addElements(elements);
            if (result.ok) {
              flashToast(`已保存 ${elements.length} 个元素`);
              setDialogMode("none");
            }
            return result;
          }}
        />
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div
            className="w-[480px] bg-bg-card h-full border-l border-border/60 overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-bg-card border-b border-border/60 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-semibold">元素详情</h2>
              <button onClick={() => setSelected(null)} className="p-1 rounded hover:bg-bg-elevated">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-accent/15 flex items-center justify-center">
                  {(() => { const Icon = typeIcons[selected.type]; return <Icon className="w-6 h-6 text-accent" />; })()}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{selected.name}</h3>
                  <div className="text-sm text-text-tertiary">
                    {elementTypeLabels[selected.type]} · {selected.page}
                  </div>
                  <div className="mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${(elementSourceLabels[selected.source] || { label: selected.source, color: "bg-bg-elevated text-text-tertiary border-border" }).color}`}>
                      {(elementSourceLabels[selected.source] || { icon: "📌", label: selected.source || "未知" }).icon} {(elementSourceLabels[selected.source] || { label: selected.source || "未知" }).label}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-text-tertiary block mb-1.5">描述</label>
                <p className="text-sm text-text-secondary">{selected.description}</p>
              </div>

              <div>
                <label className="text-xs font-medium text-text-tertiary block mb-1.5">选择器</label>
                <div className="bg-bg-elevated rounded-lg border border-border/60 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 text-xs text-text-tertiary">
                    <div className="flex items-center gap-1.5">
                      <Hash className="w-3 h-3" />
                      {selected.selectorType}
                    </div>
                    <button
                      onClick={() => copySelector(selected)}
                      className="text-accent hover:text-accent-hover transition-colors"
                    >
                      {copiedId === selected.id ? "已复制" : "复制"}
                    </button>
                  </div>
                  <pre className="p-3 text-sm text-accent font-mono overflow-x-auto">{selected.selector}</pre>
                </div>
              </div>

              {selected.sampleValue && (
                <div>
                  <label className="text-xs font-medium text-text-tertiary block mb-1.5">示例值</label>
                  <code className="block bg-bg-elevated rounded-lg px-3 py-2 text-sm font-mono">{selected.sampleValue}</code>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-text-tertiary block mb-1.5">标签</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(selected.tags || []).map((tag) => (
                    <span key={tag} className="tag bg-accent/10 text-accent">
                      <Tag className="w-2.5 h-2.5 mr-1" />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-text-tertiary block mb-1.5">使用统计</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-bg-elevated/50 rounded-lg p-3">
                    <div className="text-xs text-text-tertiary mb-1">使用次数</div>
                    <div className="text-lg font-bold">{selected.usageCount}</div>
                  </div>
                  <div className="bg-bg-elevated/50 rounded-lg p-3">
                    <div className="text-xs text-text-tertiary mb-1">创建时间</div>
                    <div className="text-sm font-medium">
                      {new Date(selected.createdAt).toLocaleDateString("zh-CN")}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border/60 flex items-center gap-2">
                <button className="btn-secondary flex-1 justify-center" onClick={() => { setEditingElement(selected); setSelected(null); setDialogMode("manual"); }}>
                  <Edit className="w-4 h-4" />编辑元素
                </button>
                <button
                  onClick={() => deleteElement(selected.id)}
                  className="px-3 py-2 rounded-lg border border-danger/30 text-danger hover:bg-danger/10 transition-colors"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page-import dialog — simple URL entry, then opens auto-import */}
      {dialogMode === "page-import" && (
        <PageImportDialog
          onClose={() => setDialogMode("none")}
          onStartAutoImport={() => setDialogMode("auto-import")}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-bg-elevated border border-border px-4 py-2 rounded-lg shadow-lg text-sm text-text-secondary animate-fade-in z-50">
          <CheckCircle className="w-4 h-4 text-success inline mr-1.5" />
          {toast}
        </div>
      )}
    </div>
  );
}

/* ---------- Manual Add Dialog ---------- */

function ManualAddDialog({
  initial,
  onClose,
  onAdd,
}: {
  initial: ElementItem | null;
  onClose: () => void;
  onAdd: (el: ElementItem) => Promise<boolean>;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [type, setType] = useState<ElementType>(initial?.type || "button");
  const [selector, setSelector] = useState(initial?.selector || "");
  const [selectorType, setSelectorType] = useState<"css" | "xpath" | "text" | "role">(initial?.selectorType || "css");
  const [page, setPage] = useState(initial?.page || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [tags, setTags] = useState((initial?.tags || []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim() || !selector.trim()) return;
    const newEl: ElementItem = {
      id: initial?.id || `el-new-${Date.now()}`,
      name: name.trim(),
      type,
      selector: selector.trim(),
      selectorType,
      page: page.trim() || "未分类",
      description: description.trim(),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      createdAt: initial?.createdAt || new Date().toISOString(),
      usageCount: initial?.usageCount || 0,
      source: initial?.source || "manual",
    };
    setSaving(true);
    setError(null);
    const ok = await onAdd(newEl);
    if (!ok) setError("保存失败，请检查后端服务");
    setSaving(false);
  };

  const canSubmit = name.trim() && selector.trim();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="w-[560px] bg-bg-card rounded-xl border border-border/60 shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Edit className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold">{initial ? "编辑元素" : "手动添加元素"}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-elevated">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-tertiary block mb-1.5">元素名称 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如: 登录按钮"
                className="input"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-tertiary block mb-1.5">元素类型</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ElementType)}
                className="input cursor-pointer"
              >
                {(Object.entries(elementTypeLabels) as [ElementType, string][]).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-text-tertiary block mb-1.5">选择器 *</label>
            <div className="flex gap-2">
              <select
                value={selectorType}
                onChange={(e) => setSelectorType(e.target.value as "css" | "xpath" | "text" | "role")}
                className="input w-32 cursor-pointer"
              >
                <option value="css">CSS</option>
                <option value="xpath">XPath</option>
                <option value="text">Text</option>
                <option value="role">Role</option>
              </select>
              <input
                type="text"
                value={selector}
                onChange={(e) => setSelector(e.target.value)}
                placeholder="如: button[type='submit']"
                className="input flex-1 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-text-tertiary block mb-1.5">所属页面</label>
              <input
                type="text"
                value={page}
                onChange={(e) => setPage(e.target.value)}
                placeholder="如: 登录页"
                className="input"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-tertiary block mb-1.5">标签 (逗号分隔)</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="如: P0, 登录"
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-text-tertiary block mb-1.5">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述这个元素的用途..."
              rows={3}
              className="input resize-none"
            />
          </div>
        </div>

        {error && <div className="px-6 pb-2 text-sm text-danger">{error}</div>}
        <div className="px-6 py-4 border-t border-border/60 flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">取消</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="btn-primary disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {saving ? "保存中..." : initial ? "保存更改" : "添加元素"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Auto Import Dialog ---------- */

// 自动识别端点（endpoints.ts 归属 api 层只读，这里本地定义所需常量）
const AUTO_DETECT_ENDPOINTS = {
  open: "/api/auto-detect/open",
  scan: (id: string) => `/api/auto-detect/scan/${id}`,
  elements: (id: string) => `/api/auto-detect/elements/${id}`,
  close: (id: string) => `/api/auto-detect/close/${id}`,
};

function AutoImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (elements: ElementItem[]) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [step, setStep] = useState<"url" | "opening" | "ready" | "results">("url");
  const [url, setUrl] = useState(() => {
    const saved = localStorage.getItem("pageImportUrl");
    if (saved) {
      localStorage.removeItem("pageImportUrl");
      return saved;
    }
    return "https://staging.example.com";
  });
  const [headless, setHeadless] = useState(false);
  const [pageName, setPageName] = useState("首页");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedElement[]>([]);
  const [imported, setImported] = useState<{ [id: string]: string }>({});
  const [deselectedAll, setDeselectedAll] = useState(false);
  const [dedupStats, setDedupStats] = useState<{ totalFound: number; afterDedup: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** Step 1 → open browser */
  const startDetection = async () => {
    setStep("opening");
    setError(null);
    const res = await post<{ sessionId: string }>(AUTO_DETECT_ENDPOINTS.open, { url, headless });
    if (!res.ok) {
      setError(res.error || "启动浏览器失败");
      setStep("url");
      return;
    }
    setSessionId(res.data?.sessionId || null);
    setStep("ready");
  };

  /** Poll for scan results */
  const pollElements = async () => {
    if (!sessionId) return;
    const res = await get<{ elements: DetectedElement[] }>(AUTO_DETECT_ENDPOINTS.elements(sessionId));
    if (!res.ok) return;
    const elements = res.data?.elements;
    if (elements && elements.length > 0) {
      setDetected(elements.map((d: DetectedElement) => ({ ...d, checked: true })));
      setStep("results");
    }
  };

  /** Manually trigger server-side scan */
  const triggerScan = async () => {
    if (!sessionId) return;
    setStep("ready"); // keep ready but show loading toast via state
    const res = await post<{ elements: DetectedElement[]; totalFound: number; afterDedup: number }>(AUTO_DETECT_ENDPOINTS.scan(sessionId));
    if (!res.ok) {
      setError(res.error || "Scan failed");
      return;
    }
    setDetected((res.data?.elements || []).map((d: DetectedElement) => ({ ...d, checked: true })));
    setDedupStats({ totalFound: res.data?.totalFound ?? 0, afterDedup: res.data?.afterDedup ?? 0 });
    setStep("results");
  };

  /** Polling interval when in "ready" step */
  useEffect(() => {
    if (step !== "ready" || !sessionId) return;
    const interval = setInterval(pollElements, 1500);
    return () => clearInterval(interval);
  }, [step, sessionId]);

  /** Cleanup on unmount */
  useEffect(() => {
    return () => {
      if (sessionId) void post(AUTO_DETECT_ENDPOINTS.close(sessionId));
    };
  }, [sessionId]);

  const closeBrowser = async () => {
    if (sessionId) await post(AUTO_DETECT_ENDPOINTS.close(sessionId));
    onClose();
  };

  const toggleElement = (id: string) => {
    setDetected(detected.map((d) => (d.id === id ? { ...d, checked: !d.checked } : d)));
  };

  const toggleAll = () => {
    const next = !deselectedAll;
    setDeselectedAll(next);
    setDetected(detected.map((d) => ({ ...d, checked: !next })));
  };

  const updateName = (id: string, name: string) => {
    setImported((prev) => ({ ...prev, [id]: name }));
  };

  const confirmImport = async () => {
    const toImport = detected
      .filter((d) => d.checked)
      .map((d) => ({
        id: `el-auto-${Date.now()}-${d.id}`,
        name: imported[d.id] || d.suggestedName,
        type: d.type,
        selector: d.selector,
        selectorType: d.selectorType,
        page: pageName,
        description: d.description || `自动识别于 ${url}`,
        tags: d.tag ? [d.tag] : [],
        createdAt: new Date().toISOString(),
        usageCount: 0,
        source: "auto-import" as ElementSource,
      }));
    if (toImport.length === 0) return;
    setSaving(true);
    setError(null);
    const result = await onImport(toImport);
    if (!result.ok) setError(result.error || "导入失败");
    setSaving(false);
  };

  const selectedCount = detected.filter((d) => d.checked).length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={closeBrowser}>
      <div
        className="w-[720px] max-h-[85vh] bg-bg-card rounded-xl border border-border/60 shadow-2xl animate-slide-up flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold">自动识别页面元素</h2>
          </div>
          <button onClick={closeBrowser} className="p-1 rounded hover:bg-bg-elevated">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-3 px-4 py-2.5 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="p-0.5 hover:bg-danger/10 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 1: URL input */}
        {step === "url" && (
          <div className="p-6 space-y-5">
            <div className="bg-bg-elevated/50 rounded-lg p-4 border border-border/60">
              <div className="flex items-center gap-2 mb-3 text-sm font-medium">
                <Globe className="w-4 h-4 text-accent" />
                输入要识别的页面 URL
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="input flex-1"
                  placeholder="https://..."
                />
                <button onClick={startDetection} className="btn-primary">
                  <Play className="w-4 h-4" />
                  打开浏览器
                </button>
              </div>

              {/* Headless toggle */}
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/30">
                <span className="text-xs text-text-tertiary">浏览器模式:</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <div
                    onClick={() => setHeadless(!headless)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      headless ? "bg-accent" : "bg-bg-elevated border border-border/60"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow ${
                        headless ? "left-5" : "left-0.5"
                      }`}
                    />
                  </div>
                  <span className="text-xs text-text-secondary">
                    {headless ? (
                      <span className="flex items-center gap-1"><Square className="w-3 h-3" />无头模式</span>
                    ) : (
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />有头模式</span>
                    )}
                  </span>
                </label>
                <span className="text-[10px] text-text-tertiary">
                  {headless ? "后台运行，不可见" : "打开可见浏览器窗口"}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-sm text-text-secondary">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center text-xs font-bold text-accent">1</div>
                输入目标页面 URL，选择浏览器模式，点击「打开浏览器」
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center text-xs font-bold text-accent">2</div>
                浏览器打开后，页面右下角会出现「识别元素」悬浮按钮
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center text-xs font-bold text-accent">3</div>
                点击悬浮按钮，系统自动扫描页面元素并回传结果
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center text-xs font-bold text-accent">4</div>
                选择需要导入的元素，确认名称后一键导入元素库
              </div>
            </div>

            <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-xs text-warning/80">
              <div className="font-medium mb-1">💡 识别建议</div>
              支持识别: 按钮、输入框、链接、图片、下拉框、复选框、容器等。有头模式下可在浏览器中手动操作（登录等）后再点击识别。
            </div>
          </div>
        )}

        {/* Step 2: Opening browser */}
        {step === "opening" && (
          <div className="p-12 flex flex-col items-center justify-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center animate-pulse">
                <Globe className="w-8 h-8 text-accent" />
              </div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold mb-1">正在启动浏览器...</div>
              <div className="text-sm text-text-tertiary">{headless ? "无头模式" : "有头模式"} · 加载 {url}</div>
            </div>
            <div className="w-48 h-1 bg-bg-elevated rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full animate-pulse" style={{ width: "70%" }} />
            </div>
          </div>
        )}

        {/* Step 3: Ready — browser open, waiting for user to click floating button */}
        {step === "ready" && (
          <div className="p-8 flex flex-col items-center justify-center gap-5">
            <div className="w-20 h-20 rounded-full bg-success/15 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-success" />
            </div>
            <div className="text-center space-y-2">
              <div className="text-lg font-semibold">浏览器已打开</div>
              <div className="text-sm text-text-tertiary max-w-md">
                页面右下角已注入 <span className="text-accent font-medium">🔍 识别元素</span> 悬浮按钮。
                <br />
                请在浏览器中点击该按钮来识别页面元素，或使用下方按钮触发。
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={triggerScan} className="btn-primary">
                <Zap className="w-4 h-4" />
                服务端强制扫描
              </button>
              <button
                onClick={() => pollElements()}
                className="btn-secondary"
              >
                <Download className="w-4 h-4" />
                拉取识别结果
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-text-tertiary">
              <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
              等待用户在浏览器中操作...
            </div>

            <div className="flex items-center gap-2 mt-2">
              <button onClick={closeBrowser} className="text-xs text-text-tertiary hover:text-danger transition-colors">
                关闭浏览器并取消
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Results */}
        {step === "results" && (
          <>
            <div className="px-6 py-3 border-b border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-success" />
                识别完成，共检测到 <span className="font-semibold text-accent">{detected.length}</span> 个元素
                {dedupStats && dedupStats.totalFound > dedupStats.afterDedup && (
                  <span className="text-xs text-text-tertiary">
                    （原始 {dedupStats.totalFound} 个，已按选择器去重）
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleAll}
                  className="text-xs text-text-tertiary hover:text-text transition-colors"
                >
                  {deselectedAll ? "全选" : "全不选"}
                </button>
                <span className="text-xs text-text-tertiary">已选 {selectedCount} 个</span>
              </div>
            </div>

            <div className="px-6 py-3 border-b border-border/60 flex items-center gap-3">
              <label className="text-xs font-medium text-text-tertiary">页面名称</label>
              <input
                type="text"
                value={pageName}
                onChange={(e) => setPageName(e.target.value)}
                className="input text-sm py-1.5 flex-1 max-w-48"
                placeholder="如: 首页"
              />
              <span className="text-xs text-text-tertiary truncate">{url}</span>
              <button
                onClick={() => { setStep("ready"); setDetected([]); setDedupStats(null); }}
                className="text-xs text-accent hover:text-accent-hover ml-auto"
              >
                重新识别
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
              {detected.map((d) => {
                const Icon = typeIcons[d.type];
                const selected = d.checked;
                return (
                  <div
                    key={d.id}
                    className={`p-3 rounded-lg border transition-all ${
                      selected ? "bg-accent/5 border-accent/30" : "bg-bg-elevated/30 border-border/60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleElement(d.id)}
                        className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                          selected
                            ? "bg-accent border-accent text-white"
                            : "border-border/60 text-transparent hover:border-text-tertiary"
                        }`}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                      </button>
                      <div className="w-7 h-7 rounded bg-bg-elevated flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <input
                            type="text"
                            value={imported[d.id] || d.suggestedName}
                            onChange={(e) => updateName(d.id, e.target.value)}
                            className="bg-transparent border-none outline-none text-sm font-medium text-text w-full min-w-0 truncate"
                            placeholder="输入元素名称"
                          />
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-tertiary shrink-0">
                            {elementTypeLabels[d.type]}
                          </span>
                          {d.tag && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent shrink-0">
                              {d.tag}
                            </span>
                          )}
                        </div>
                        <code className="block text-xs text-accent font-mono bg-bg/60 px-2 py-1 rounded truncate">
                          {d.selector}
                        </code>
                        {d.description && (
                          <div className="text-xs text-text-tertiary mt-1">{d.description}</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-4 border-t border-border/60 flex items-center justify-between bg-bg-elevated/30">
              <div className="text-xs text-text-tertiary">
                将导入 <span className="text-accent font-semibold">{selectedCount}</span> 个元素到元素库
              </div>
              <div className="flex items-center gap-2">
                <button onClick={closeBrowser} className="btn-secondary">取消</button>
                <button
                  onClick={confirmImport}
                  disabled={selectedCount === 0 || saving}
                  className="btn-primary disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  {saving ? "导入中..." : `确认导入 (${selectedCount})`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Page Import Dialog ---------- */

function PageImportDialog({
  onClose,
  onStartAutoImport,
}: {
  onClose: () => void;
  onStartAutoImport: () => void;
}) {
  const [url, setUrl] = useState("");

  const handleStart = () => {
    if (!url.trim()) return;
    // 将 URL 存入 localStorage 供 AutoImportDialog 使用
    localStorage.setItem("pageImportUrl", url.trim());
    onStartAutoImport();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="w-[480px] bg-bg-card rounded-xl border border-border/60 shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold">按页面导入元素</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-elevated">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-text-tertiary block mb-2">输入页面 URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/page"
              className="input"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleStart();
              }}
            />
          </div>

          <div className="bg-bg-elevated/50 rounded-lg p-3 text-xs text-text-tertiary">
            <p className="font-medium text-text-secondary mb-1">📋 功能说明</p>
            输入页面 URL 后，系统将打开浏览器并自动识别该页面上的所有可交互元素（按钮、输入框、链接等），
            您可以选择需要的元素一键导入到元素库。
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border/60 flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">取消</button>
          <button
            onClick={handleStart}
            disabled={!url.trim()}
            className="btn-primary disabled:opacity-50"
          >
            <Globe className="w-4 h-4" />
            开始识别
          </button>
        </div>
      </div>
    </div>
  );
}

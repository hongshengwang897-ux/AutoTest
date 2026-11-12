import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus, Search, Play, Edit, Trash2, Tag, FolderOpen,
  Loader2, CheckCircle, Square, CheckSquare,
  FolderPlus, ChevronRight, ChevronDown, Folder, FolderDot,
  MonitorCheck, Download, FileCheck2, ListChecks, Clock3, X,
} from "lucide-react";
import { casesService, modulesService } from "@/api/services";
import { confirmAction } from "@/components/ConfirmDialog";
import { promptAction } from "@/components/PromptDialog";
import type { CaseItem, LocalRunnerStatus, ModuleItem } from "@/api/services";

function formatUpdatedAt(value: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff >= 0 && diff < 60_000) return "刚刚";
  if (diff >= 0 && diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff >= 0 && diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
}

// ---- 模块树组件 ----
function ModuleTree({
  modules,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: {
  modules: ModuleItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: (parentId: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["root"]));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [contextId, setContextId] = useState<string | null>(null);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const children = (parentId: string) =>
    modules.filter((m) => m.parentId === parentId);

  const renderNode = (node: ModuleItem, depth: number) => {
    const kids = children(node.id);
    const isExpanded = expanded.has(node.id);
    const isActive = activeId === node.id;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer rounded text-sm group hover:bg-bg-elevated ${
            isActive ? "bg-accent/10 text-accent" : "text-text-secondary"
          }`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => onSelect(node.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextId(contextId === node.id ? null : node.id);
          }}
        >
          {kids.length > 0 ? (
            <button
              className="p-0.5 hover:bg-bg-base rounded"
              onClick={(e) => { e.stopPropagation(); toggle(node.id); }}
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}
          {kids.length > 0 ? (
            <Folder className="w-4 h-4 shrink-0" />
          ) : (
            <FolderDot className="w-4 h-4 shrink-0" />
          )}
          {editingId === node.id ? (
            <input
              autoFocus
              className="input text-xs h-6 flex-1 min-w-0"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => {
                if (editName.trim() && editName !== node.name) onRename(node.id, editName.trim());
                setEditingId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate flex-1">{node.name}</span>
          )}
          {/* Context menu */}
          {contextId === node.id && (
            <div className="flex items-center gap-0.5">
              <button
                className="p-0.5 hover:bg-bg-base rounded text-xs"
                title="添加子模块"
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd(node.id);
                  setContextId(null);
                }}
              >
                <FolderPlus className="w-3 h-3" />
              </button>
              <button
                className="p-0.5 hover:bg-bg-base rounded text-xs"
                title="重命名"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditName(node.name);
                  setEditingId(node.id);
                  setContextId(null);
                }}
              >
                <Edit className="w-3 h-3" />
              </button>
              {node.id !== "root" && (
                <button
                  className="p-0.5 hover:bg-danger/20 rounded text-xs text-danger"
                  title="删除"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (await confirmAction({ title: "删除模块？", message: `即将删除“${node.name}”及其子模块。`, detail: "模块结构会被永久删除。", confirmLabel: "确认删除" })) {
                      onDelete(node.id);
                      setContextId(null);
                    }
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
        {isExpanded && kids.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  const rootMods = children("");
  return (
    <div className="py-1">
      {rootMods.map((m) => renderNode(m, 0))}
    </div>
  );
}

// ---- 主页面 ----
export default function Cases() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [runnerStatus, setRunnerStatus] = useState<LocalRunnerStatus | null>(null);

  // 模块树
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [activeModule, setActiveModule] = useState("");

  const load = async () => {
    setLoading(true);
    const [caseRes, modRes] = await Promise.all([
      casesService.list({ limit: 200 }),
      modulesService.list(),
    ]);
    if (caseRes.ok) setCases(caseRes.data.items);
    if (modRes.ok) setModules(modRes.data.items);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    let active = true;
    const refreshRunner = async () => {
      const status = await casesService.getLocalRunnerStatus();
      if (active) setRunnerStatus(status);
    };
    void refreshRunner();
    const timer = window.setInterval(refreshRunner, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => { setSearch(searchParams.get("search") || ""); }, [searchParams]);

  // 初始化：如果没有模块数据，创建默认模块
  useEffect(() => {
    if (!loading && modules.length === 0) {
      (async () => {
        await modulesService.create({ name: "默认模块" });
        const res = await modulesService.list();
        if (res.ok) setModules(res.data.items);
      })();
    }
  }, [loading, modules.length]);

  const handleDelete = async (id: string, name: string) => {
    if (!await confirmAction({ title: "删除 UI 自动化用例？", message: `即将删除“${name}”。`, detail: "此操作无法恢复。", confirmLabel: "确认删除" })) return;
    setDeletingId(id);
    const res = await casesService.remove(id);
    if (res.ok) {
      setCases((prev) => prev.filter((c) => c.id !== id));
      flashToast("用例已删除");
    } else {
      flashToast("删除失败: " + (res.error || "未知错误"));
    }
    setDeletingId(null);
  };

  const handleExecute = async (id: string) => {
    setExecutingId(id);
    const res = await casesService.execute(id);
    if (res.ok) {
      flashToast("已在本机执行完成，请查看执行中心");
    } else {
      flashToast("执行失败: " + (res.error || "未知错误"));
    }
    setExecutingId(null);
  };

  const handleModuleAdd = async (parentId: string) => {
    const name = await promptAction({ title: "新建模块", label: "模块名称", placeholder: "请输入模块名称", confirmLabel: "创建模块" });
    if (!name?.trim()) return;
    const created = await modulesService.create({ name: name.trim(), parentId });
    if (!created.ok) {
      flashToast("模块创建失败: " + (created.error || "未知错误"));
      return;
    }
    const res = await modulesService.list();
    if (res.ok) setModules(res.data.items);
  };

  const handleModuleRename = async (id: string, name: string) => {
    const updated = await modulesService.update(id, { name });
    if (!updated.ok) {
      flashToast("模块重命名失败: " + (updated.error || "未知错误"));
      return;
    }
    const res = await modulesService.list();
    if (res.ok) setModules(res.data.items);
  };

  const handleModuleDelete = async (id: string) => {
    const removed = await modulesService.remove(id);
    if (!removed.ok) {
      flashToast("模块删除失败: " + (removed.error || "未知错误"));
      return;
    }
    if (activeModule === id) setActiveModule("");
    const res = await modulesService.list();
    if (res.ok) setModules(res.data.items);
  };

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // 根据模块筛选
  const moduleCases = activeModule
    ? cases.filter((c) => {
        const mod = modules.find((m) => m.id === activeModule);
        return mod && (c.group || "") === mod.name;
      })
    : cases;

  const filteredCases = moduleCases.filter((c) => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.description || "").toLowerCase().includes(search.toLowerCase());
    const matchTag = !activeTag || (c.tags || []).includes(activeTag);
    return matchSearch && matchTag;
  });

  const allTags = Array.from(new Set(cases.flatMap((c) => c.tags || [])));

  const allSelected = filteredCases.length > 0 && filteredCases.every((c) => selectedIds.has(c.id));
  const toggleAll = () => {
    if (allSelected) { setSelectedIds(new Set()); }
    else { setSelectedIds(new Set(filteredCases.map((c) => c.id))); }
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBatchExecute = async () => {
    if (selectedIds.size === 0) return;
    setBatchRunning(true);
    let done = 0;
    let failed = 0;
    for (const id of selectedIds) {
      const res = await casesService.execute(id);
      if (res.ok) done++;
      else failed++;
      flashToast(`执行中 ${done}/${selectedIds.size}...`);
    }
    // 批量执行完成：只推送一次汇总（单条用例不推送）
    await casesService.batchNotify({ name: `批量执行（${selectedIds.size} 条）`, total: selectedIds.size, pass: done, fail: failed });
    flashToast(failed > 0 ? `本机完成 ${done} 个，失败 ${failed} 个` : `本机已完成 ${done} 个用例`);
    setBatchRunning(false);
    setSelectedIds(new Set());
  };

  return (
    <div className="flex h-full bg-bg overflow-hidden">
      {/* 左侧模块树 */}
      <aside className="w-60 shrink-0 border-r border-border/60 bg-bg-card/60 hidden lg:flex flex-col h-full overflow-hidden">
        <div className="h-16 px-4 border-b border-border/60 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">测试套件</h3>
            <p className="text-[11px] text-text-tertiary mt-0.5">按业务模块组织用例</p>
          </div>
          <button
            className="w-8 h-8 flex items-center justify-center hover:bg-bg-elevated rounded-lg text-text-tertiary hover:text-accent transition-colors"
            title="新建模块"
            onClick={() => handleModuleAdd("")}
          >
            <FolderPlus className="w-4 h-4 text-text-tertiary" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div
            className={`mx-2 mt-2 flex items-center gap-2.5 px-3 py-2.5 cursor-pointer text-sm rounded-lg transition-colors ${
              activeModule === "" ? "bg-accent/15 text-accent font-medium" : "text-text-secondary hover:bg-bg-elevated"
            }`}
            onClick={() => setActiveModule("")}
          >
            <FolderOpen className="w-4 h-4" />
            <span>全部用例</span>
            <span className="ml-auto text-xs text-text-tertiary">{cases.length}</span>
          </div>
          <ModuleTree
            modules={modules}
            activeId={activeModule}
            onSelect={setActiveModule}
            onAdd={handleModuleAdd}
            onRename={handleModuleRename}
            onDelete={handleModuleDelete}
          />
        </div>
      </aside>

      {/* 右侧列表 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="min-h-20 px-5 py-4 border-b border-border/60 bg-bg-card/30 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center"><FileCheck2 className="w-5 h-5" /></div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">UI自动化测试</h2>
              <div className="flex items-center gap-3 text-xs text-text-tertiary mt-1">
                <span>{cases.length} 条用例</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {runnerStatus ? (
              <span className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded border border-success/30 bg-success/10 text-xs text-success" title={`本地执行器: ${runnerStatus.runnerName}`}>
                <MonitorCheck className="w-4 h-4" />
                <span className="hidden lg:inline">{runnerStatus.busy ? "本机执行中" : "本地执行器已连接"}</span>
              </span>
            ) : (
              <a href="/downloads/AutoTest-LocalRunner.zip" download className="btn-secondary" title="下载 Windows 本地执行器">
                <Download className="w-4 h-4" />
                <span className="hidden lg:inline">安装本地执行器</span>
              </a>
            )}
            {selectedIds.size > 0 && (
              <button onClick={handleBatchExecute} disabled={batchRunning} className="btn-primary">
                {batchRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                批量执行（{selectedIds.size}）
              </button>
            )}
            <button onClick={() => navigate("/cases/new")} className="btn-primary">
              <Plus className="w-4 h-4" />
              新建用例
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mx-5 mt-5 rounded-xl border border-border/60 bg-bg-card p-3 space-y-3 shadow-sm shadow-black/10">
          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleAll}
              className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-colors ${allSelected ? "border-accent/40 bg-accent/10 text-accent" : "border-border/60 bg-bg-elevated text-text-tertiary hover:text-text"}`}
              title={allSelected ? "全不选" : "全选"}
            >
              {allSelected ? <CheckSquare className="w-4 h-4 text-accent" /> : <Square className="w-4 h-4 text-text-tertiary" />}
            </button>
            <div className="relative flex-1 min-w-40">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                type="text"
                placeholder="搜索用例名称或描述..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10 h-10 bg-bg-elevated/70"
              />
            </div>
          </div>

          {allTags.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              <span className="text-xs text-text-tertiary shrink-0 flex items-center gap-1"><Tag className="w-3.5 h-3.5" />标签</span>
              <button
                onClick={() => setActiveTag(null)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors shrink-0 ${
                  activeTag === null ? "bg-accent/15 text-accent border border-accent/30" : "bg-bg-elevated text-text-secondary border border-transparent hover:text-text"
                }`}
              >
                全部
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(tag)}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors shrink-0 ${
                    activeTag === tag ? "bg-accent/15 text-accent border border-accent/30" : "bg-bg-elevated text-text-secondary border border-transparent hover:text-text"
                  }`}
                >
                  {tag}
                </button>
              ))}
              {(activeTag || search) && <button onClick={() => { setActiveTag(null); setSearch(""); }} className="ml-auto px-2.5 py-1 text-xs text-text-tertiary hover:text-text flex items-center gap-1 shrink-0"><X className="w-3 h-3" />清除筛选</button>}
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="h-56 rounded-xl border border-border/60 bg-bg-card flex flex-col items-center justify-center text-text-tertiary">
              <Loader2 className="w-6 h-6 text-accent animate-spin mb-3" />
              <span className="text-sm">正在加载测试用例...</span>
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="h-72 rounded-xl border border-dashed border-border bg-bg-card/40 flex flex-col items-center justify-center text-text-tertiary">
              <div className="w-14 h-14 rounded-2xl bg-bg-elevated flex items-center justify-center mb-4"><FolderOpen className="w-7 h-7 opacity-60" /></div>
              <p className="text-sm text-text-secondary">没有找到符合条件的用例</p>
              <p className="text-xs mt-1.5">调整筛选条件，或创建一条新的 UI 自动化用例</p>
              <button onClick={() => navigate("/cases/new")} className="btn-primary mt-4"><Plus className="w-4 h-4" />新建用例</button>
            </div>
          ) : (
            <div className="rounded-xl border border-border/60 bg-bg-card overflow-hidden shadow-sm shadow-black/10">
              <div className="hidden md:grid grid-cols-[32px_minmax(0,1fr)_104px] xl:grid-cols-[32px_minmax(250px,1fr)_140px_70px_112px_104px] items-center gap-2 px-4 h-11 bg-bg-elevated/70 border-b border-border/60 text-[11px] font-medium text-text-tertiary uppercase tracking-wide">
                <button onClick={toggleAll} className="flex items-center justify-center" title={allSelected ? "全不选" : "全选"}>{allSelected ? <CheckSquare className="w-4 h-4 text-accent" /> : <Square className="w-4 h-4" />}</button>
                <span>用例名称</span>
                <span className="hidden xl:block">所属模块</span>
                <span className="hidden xl:block text-center">步骤</span>
                <span className="hidden xl:block">最后更新</span>
                <span className="text-right pr-1">操作</span>
              </div>
              <div className="divide-y divide-border/50">
                {filteredCases.map((c) => (
                  <div key={c.id} className={`group grid grid-cols-[32px_minmax(0,1fr)_104px] xl:grid-cols-[32px_minmax(250px,1fr)_140px_70px_112px_104px] items-center gap-2 px-4 py-3.5 transition-colors hover:bg-bg-elevated/45 ${selectedIds.has(c.id) ? "bg-accent/5" : ""}`} data-testid="case-list-item" data-case-id={c.id}>
                    <button onClick={() => toggleOne(c.id)} className="w-8 h-8 -ml-1 flex items-center justify-center rounded-lg hover:bg-bg-elevated" title="选择用例">{selectedIds.has(c.id) ? <CheckSquare className="w-4 h-4 text-accent" /> : <Square className="w-4 h-4 text-text-tertiary" />}</button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <Link to={`/cases/${c.id}`} className="font-medium text-sm text-text-primary hover:text-accent transition-colors truncate">{c.name}</Link>
                        {c.tags?.slice(0, 2).map((tag) => <span key={tag} className="hidden 2xl:inline-flex text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-tertiary shrink-0">{tag}</span>)}
                      </div>
                      <p className="text-xs text-text-tertiary mt-1.5 truncate">{c.description || (c.steps?.length ? `包含 ${c.steps.length} 个自动化步骤` : "暂无用例说明")}</p>
                    </div>
                    <div className="hidden xl:flex items-center gap-1.5 text-xs text-text-secondary min-w-0"><Folder className="w-3.5 h-3.5 text-text-tertiary shrink-0" /><span className="truncate">{c.group || "未分组"}</span></div>
                    <div className="hidden xl:flex items-center justify-center gap-1.5 text-xs text-text-secondary"><ListChecks className="w-3.5 h-3.5 text-text-tertiary" /><span className="tabular-nums">{c.steps?.length || 0}</span></div>
                    <div className="hidden xl:flex items-center gap-1.5 text-xs text-text-tertiary"><Clock3 className="w-3.5 h-3.5" /><span>{formatUpdatedAt(c.updatedAt)}</span></div>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleExecute(c.id)} data-testid="case-execute-button" disabled={executingId === c.id} className="w-8 h-8 rounded-lg flex items-center justify-center text-success bg-success/10 hover:bg-success/20 transition-colors disabled:opacity-50" title="执行用例">{executingId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}</button>
                      <Link to={`/cases/${c.id}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors" title="编辑用例"><Edit className="w-4 h-4" /></Link>
                      <button onClick={() => handleDelete(c.id, c.name)} disabled={deletingId === c.id} className="w-8 h-8 rounded-lg flex items-center justify-center text-text-tertiary hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50" title="删除用例">{deletingId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

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

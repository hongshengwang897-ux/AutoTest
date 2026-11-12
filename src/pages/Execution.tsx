import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Play,
  Square,
  RefreshCw,
  Search,
  Clock,
  ChevronDown,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  Copy,
  Lightbulb,
  GitCompare,
  X,
  FileText,
  Camera,
  Braces,
  Gauge,
  MonitorCheck,
  Send,
  BarChart3,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import LogTerminal from "@/components/LogTerminal";
import { confirmAction } from "@/components/ConfirmDialog";
import { writeClipboard } from "@/lib/clipboard";
import { get } from "@/api/client";
import { API } from "@/api/endpoints";
import { executionsService, casesService, apiTestsService, performanceTestsService } from "@/api/services";
import type { ApiTestExecution, ExecutionItem, PerformanceRun } from "@/api/services";
import type { ElementDiff } from "@/types";

interface ExecutionStatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  background: string;
}

function ExecutionStatCard({ label, value, icon: Icon, color, background }: ExecutionStatCardProps) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-text-tertiary">
        <span className={`flex h-7 w-7 items-center justify-center rounded ${background}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </span>
        {label}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

const changeTypeConfig: Record<
  ElementDiff["changeType"],
  { label: string; color: string; bg: string; icon: typeof GitCompare }
> = {
  selector: {
    label: "选择器变更",
    color: "text-warning",
    bg: "bg-warning/15 border-warning/40",
    icon: GitCompare,
  },
  appearance: {
    label: "外观变更",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/40",
    icon: AlertTriangle,
  },
  value: {
    label: "值变更",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/40",
    icon: AlertTriangle,
  },
  missing: {
    label: "元素缺失",
    color: "text-danger",
    bg: "bg-danger/10 border-danger/40",
    icon: AlertCircle,
  },
  structural: {
    label: "结构变更",
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/40",
    icon: GitCompare,
  },
};

function ElementDiffCard({ diff }: { diff: ElementDiff }) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const config = changeTypeConfig[diff.changeType];
  const Icon = config.icon;

  const copyToClipboard = async (text: string, field: string) => {
    if (!await writeClipboard(text)) return;
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  return (
    <div className={`rounded-lg border ${config.bg} p-3 mt-2`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-6 h-6 rounded flex items-center justify-center bg-bg-card ${config.color}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded bg-bg-card ${config.color}`}>
          {config.label}
        </span>
        <span className="text-xs text-text-tertiary">元素: {diff.elementName}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-bg-card/60 rounded-md p-2.5 border border-border/60">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted font-medium">预期 (旧)</span>
            {diff.expectedSelector && (
              <button
                onClick={() => copyToClipboard(diff.expectedSelector!, "old-sel")}
                className="p-0.5 hover:bg-bg-elevated rounded text-text-tertiary hover:text-text"
                title="复制"
              >
                <Copy className="w-3 h-3" />
              </button>
            )}
          </div>
          <code className="block text-xs text-danger font-mono bg-danger/5 px-2 py-1 rounded break-all">
            {diff.expectedSelector}
          </code>
          {diff.oldSnippet && (
            <pre className="mt-2 text-[10px] text-text-tertiary font-mono bg-bg/80 p-2 rounded overflow-x-auto leading-relaxed">
              {diff.oldSnippet}
            </pre>
          )}
        </div>

        <div className="bg-bg-card/60 rounded-md p-2.5 border border-border/60">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-accent font-medium">实际 (新)</span>
            {diff.actualSelector && (
              <button
                onClick={() => copyToClipboard(diff.actualSelector!, "new-sel")}
                className="p-0.5 hover:bg-bg-elevated rounded text-text-tertiary hover:text-text"
                title="复制"
              >
                <Copy className="w-3 h-3" />
              </button>
            )}
          </div>
          <code className="block text-xs text-accent font-mono bg-accent/5 px-2 py-1 rounded break-all">
            {diff.actualSelector || "(元素未找到)"}
          </code>
          {diff.newSnippet && (
            <pre className="mt-2 text-[10px] text-text-tertiary font-mono bg-bg/80 p-2 rounded overflow-x-auto leading-relaxed">
              {diff.newSnippet}
            </pre>
          )}
        </div>
      </div>

      <div className="bg-bg-card/60 rounded-md p-2.5 border border-border/60 mb-3">
        <div className="text-xs text-text-secondary leading-relaxed">
          {diff.description}
        </div>
      </div>

      <div className="flex items-start gap-2 bg-success/5 border border-success/30 rounded-md p-2.5">
        <Lightbulb className="w-4 h-4 text-success shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-xs font-medium text-success mb-1">建议修复</div>
          <div className="text-xs text-text-secondary leading-relaxed">{diff.suggestion}</div>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() =>
                diff.actualSelector && copyToClipboard(diff.actualSelector, "apply")
              }
              className="px-2 py-1 text-[11px] bg-accent/15 text-accent rounded hover:bg-accent/25 transition-colors"
            >
              使用新选择器
            </button>
            <button
              onClick={() => copyToClipboard(diff.suggestion, "sug")}
              className="px-2 py-1 text-[11px] bg-bg-elevated text-text-secondary rounded hover:text-text transition-colors"
            >
              {copiedField === "sug" ? "已复制" : "复制建议"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UiExecutionPanel() {
  const [executions, setExecutions] = useState<ExecutionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 详情端点才返回 steps/logs/screenshots 等重字段，列表只保留标量字段
  const [detail, setDetail] = useState<ExecutionItem | null>(null);
  const [search, setSearch] = useState("");
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [dismissedElementsAlert, setDismissedElementsAlert] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const loadExecutions = useCallback(async (selectNewest = false) => {
    const res = await executionsService.list({ limit: 50 });
    if (res.ok) {
      setExecutions(res.data.items);
      setSelectedId((current) => {
        if (selectNewest || !current) return res.data.items[0]?.id || null;
        return res.data.items.some((item) => item.id === current) ? current : res.data.items[0]?.id || null;
      });
    } else {
      setMessage({ type: "error", text: res.error || "执行记录加载失败" });
    }
    setLoading(false);
    return res;
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const res = await executionsService.getById(id);
    // 请求期间切换了选中项则丢弃过期详情
    if (res.ok && res.data && selectedIdRef.current === id) setDetail(res.data);
  }, []);

  useEffect(() => { void loadExecutions(true); }, [loadExecutions]);

  // 选中项变化时按需拉取详情（steps/logs/screenshots 等重字段）
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // 选中执行仍在运行时同步刷新详情，保持步骤与日志实时
  const selectedRunningRef = useRef(false);
  selectedRunningRef.current = executions.some((item) => item.id === selectedId && (item.status === "pending" || item.status === "running"));

  const refreshAll = useCallback(async () => {
    await loadExecutions();
    if (selectedIdRef.current && selectedRunningRef.current) await loadDetail(selectedIdRef.current);
  }, [loadExecutions, loadDetail]);

  // 存在 pending/running 执行时每 3 秒轮询刷新，无活跃执行时不轮询
  const hasActiveExecution = executions.some((item) => item.status === "pending" || item.status === "running");
  const fetchingRef = useRef(false);
  const refreshRef = useRef(refreshAll);
  refreshRef.current = refreshAll;
  useEffect(() => {
    if (!hasActiveExecution) return;
    const timer = window.setInterval(() => {
      if (fetchingRef.current) return; // in-flight 守卫：上次请求未完成则跳过本轮
      fetchingRef.current = true;
      void (async () => {
        try {
          await refreshRef.current();
        } finally {
          fetchingRef.current = false;
        }
      })();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [hasActiveExecution]);

  const toggleStep = (stepName: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepName)) next.delete(stepName);
      else next.add(stepName);
      return next;
    });
  };

  const filtered = executions.filter((e) =>
    e.caseName.toLowerCase().includes(search.toLowerCase())
  );

  // 标量字段以列表为准（轮询实时更新），steps/logs/screenshots 重字段来自详情
  const selectedBase = executions.find((item) => item.id === selectedId) || null;
  const selectedExec = detail && detail.id === selectedId
    ? (selectedBase ? { ...detail, ...selectedBase } : detail)
    : selectedBase;
  const detailReady = !!detail && detail.id === selectedId;

  const getElementDiffs = (): ElementDiff[] => {
    if (!selectedExec) return [];
    return (selectedExec.steps || [])
      .map((step) => step.elementDiff as ElementDiff | undefined)
      .filter((diff): diff is ElementDiff => Boolean(diff));
  };

  const elementDiffs = getElementDiffs();
  const hasElementChanges = elementDiffs.length > 0;

  if (loading) return <div className="flex items-center justify-center h-64 text-text-tertiary">加载中...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold mb-1 flex items-center gap-2"><MonitorCheck className="h-5 w-5 text-accent" />UI 自动化执行</h2>
          <p className="text-sm text-text-tertiary">浏览器用例执行、步骤日志、截图和元素变更</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" disabled={reloading} onClick={async () => { setReloading(true); await refreshAll(); setReloading(false); }}>
            <RefreshCw className={`w-4 h-4 ${reloading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-xs text-text-tertiary mb-2">
            <Play className="w-3.5 h-3.5 text-accent" />
            等待中
          </div>
          <div className="text-2xl font-bold text-warning">{executions.filter((e) => e.status === "pending").length}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-xs text-text-tertiary mb-2">
            <Clock className="w-3.5 h-3.5 text-accent" />
            执行中
          </div>
          <div className="text-2xl font-bold text-accent">{executions.filter((e) => e.status === "running").length}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-xs text-text-tertiary mb-2">
            <AlertCircle className="w-3.5 h-3.5 text-success" />
            已完成
          </div>
          <div className="text-2xl font-bold text-text">
            {executions.filter((e) => e.status === "success" || e.status === "failed" || e.status === "timeout").length}
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-xs text-text-tertiary mb-2">
            <AlertCircle className="w-3.5 h-3.5 text-danger" />
            失败
          </div>
          <div className="text-2xl font-bold text-danger">
            {executions.filter((e) => e.status === "failed").length}
          </div>
        </div>
      </div>

      {message && <div className={`px-4 py-3 rounded-lg border text-sm ${message.type === "success" ? "bg-success/10 border-success/30 text-success" : "bg-danger/10 border-danger/30 text-danger"}`}>{message.text}</div>}

      <div className="grid grid-cols-3 gap-4 h-[calc(100vh-260px)]">
        <div className="card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
            <h3 className="text-sm font-semibold">执行队列</h3>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
              <input
                type="text"
                placeholder="搜索..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-36 pl-8 pr-3 py-1.5 bg-bg-elevated border border-border/60 rounded-lg text-xs"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filtered.map((exec) => {
              const hasDiff = (exec.steps || []).some((s) => s.elementDiff);
              return (
                <button
                  key={exec.id}
                  onClick={() => {
                    setSelectedId(exec.id);
                    setDismissedElementsAlert(false);
                  }}
                  className={`w-full text-left p-3 rounded-lg transition-all ${
                    selectedExec?.id === exec.id
                      ? "bg-accent/10 border border-accent/30"
                      : "hover:bg-bg-elevated border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <StatusBadge status={exec.status} size="sm" />
                    <span className="text-xs text-text-tertiary">
                      {exec.startTime ? new Date(exec.startTime).toLocaleTimeString("zh-CN", { hour12: false }) : "-"}
                    </span>
                  </div>
                  <div className="text-sm font-medium truncate">{exec.caseName}</div>
                  {exec.errorMessage && (
                    <div className="text-xs text-danger mt-1 truncate">{exec.errorMessage}</div>
                  )}
                  {hasDiff && (
                    <div className="flex items-center gap-1 mt-1.5 text-[10px] text-warning">
                      <AlertTriangle className="w-3 h-3" />
                      <span>检测到元素变更</span>
                    </div>
                  )}
                  {exec.status === "running" && (
                    <div className="mt-2 h-1 bg-bg-elevated rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full animate-pulse" style={{ width: "65%" }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="col-span-2 flex flex-col gap-4">
          {selectedExec && (
            <>
              <div className="card p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={selectedExec.status} size="md" />
                    <div>
                      <h3 className="font-semibold text-lg">{selectedExec.caseName}</h3>
                      <p className="text-xs text-text-tertiary">
                        执行ID: {selectedExec.id} · 开始时间:{" "}
                        {selectedExec.startTime ? new Date(selectedExec.startTime).toLocaleString("zh-CN") : "-"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedExec.status === "running" && (
                      <button
                        className="btn-danger"
                        onClick={async () => {
                          setReloading(true);
                          const cancelled = await casesService.cancel(selectedExec.caseId);
                          if (!cancelled.ok) setMessage({ type: "error", text: cancelled.error || "取消失败" });
                          await loadExecutions();
                          setReloading(false);
                        }}
                      >
                        <Square className="w-4 h-4" />
                        取消执行
                      </button>
                    )}
                    <Link to={`/reports/${selectedExec.id}`} className="btn-secondary">
                      <FileText className="w-4 h-4" />
                      查看报告
                    </Link>
                    <button
                      className="btn-secondary"
                      disabled={reloading}
                      onClick={async () => {
                        setReloading(true);
                        const executed = await casesService.execute(selectedExec.caseId);
                        if (!executed.ok) setMessage({ type: "error", text: executed.error || "重新执行失败" });
                        await loadExecutions(true);
                        setReloading(false);
                      }}
                    >
                      <RefreshCw className={`w-4 h-4 ${reloading ? "animate-spin" : ""}`} />
                      重新执行
                    </button>
                    <button
                      className="btn-secondary text-text-tertiary hover:text-danger"
                      disabled={selectedExec.status === "running"}
                      onClick={async () => {
                        if (!await confirmAction({ title: "删除执行记录？", message: "这条执行记录及其报告数据会被删除。", detail: "此操作无法恢复。", confirmLabel: "确认删除" })) return;
                        const removed = await executionsService.remove(selectedExec.id);
                        if (!removed.ok) {
                          setMessage({ type: "error", text: removed.error || "删除失败" });
                          return;
                        }
                        await loadExecutions(true);
                      }}
                    >
                      <X className="w-4 h-4" />
                      删除
                    </button>
                  </div>
                </div>

                {selectedExec.errorMessage && (
                  <div className="mb-3 p-3 bg-danger/10 border border-danger/30 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-danger">执行失败</div>
                      <div className="text-xs text-danger/80">{selectedExec.errorMessage}</div>
                    </div>
                  </div>
                )}

                {!detailReady && (
                  <div className="py-8 text-center text-xs text-text-tertiary">加载执行详情...</div>
                )}

                {detailReady && (<>
                {/* 用例执行结束截图 */}
                {selectedExec.screenshots && selectedExec.screenshots.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs text-text-tertiary mb-2 flex items-center gap-1">
                      <Camera className="w-3 h-3" /> 用例执行结束截图
                    </div>
                    <div className="space-y-2">
                      {selectedExec.screenshots.map((img, idx) => (
                        <img
                          key={idx}
                          src={`data:image/png;base64,${img}`}
                          alt={`截图 ${idx + 1}`}
                          className="w-full rounded-lg border border-border/60"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {hasElementChanges && !dismissedElementsAlert && (
                  <div className="mb-3 p-3 bg-warning/10 border border-warning/40 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-sm font-medium text-warning">
                            检测到 {elementDiffs.length} 个元素发生变更
                          </div>
                          <button
                            onClick={() => setDismissedElementsAlert(true)}
                            className="p-0.5 hover:bg-warning/10 rounded"
                          >
                            <X className="w-3.5 h-3.5 text-warning/70" />
                          </button>
                        </div>
                        <div className="space-y-1">
                          {elementDiffs.map((diff, idx) => {
                            const cfg = changeTypeConfig[diff.changeType];
                            const Icn = cfg.icon;
                            return (
                              <div
                                key={idx}
                                className="flex items-center gap-2 text-xs text-text-secondary"
                              >
                                <Icn className={`w-3 h-3 ${cfg.color}`} />
                                <span className="font-medium">{diff.elementName}</span>
                                <span className="text-text-tertiary">·</span>
                                <span className="text-text-tertiary">{cfg.label}</span>
                                <ChevronRight className="w-3 h-3 text-text-tertiary" />
                                <code className="font-mono text-warning">{diff.actualSelector || "(缺失)"}</code>
                              </div>
                            );
                          })}
                        </div>
                        <div className="text-xs text-text-tertiary mt-2">
                          展开下方失败步骤查看详细的对比分析和修复建议
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-text-tertiary mb-1">持续时间</div>
                    <div className="font-medium">
                      {selectedExec.duration ? `${(selectedExec.duration / 1000).toFixed(1)}s` : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-text-tertiary mb-1">总步骤</div>
                    <div className="font-medium">{(selectedExec.steps || []).length}</div>
                  </div>
                  <div>
                    <div className="text-xs text-text-tertiary mb-1">通过</div>
                    <div className="font-medium text-success">
                      {(selectedExec.steps || []).filter((s) => s.status === "pass").length}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-text-tertiary mb-1">失败</div>
                    <div className="font-medium text-danger">
                      {(selectedExec.steps || []).filter((s) => s.status === "fail").length}
                    </div>
                  </div>
                </div>

                {(selectedExec.steps || []).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border/60">
                    <div className="flex items-center gap-2 mb-3 text-sm font-medium">
                      <span>执行步骤</span>
                      <ChevronDown className="w-4 h-4 text-text-tertiary" />
                    </div>
                    <div className="space-y-2">
                      {(selectedExec.steps || []).map((step, i) => {
                        const expanded = expandedSteps.has(step.name);
                        const hasDiff = !!step.elementDiff;
                        return (
                          <div key={i}>
                            <button
                              onClick={() => step.status === "fail" && toggleStep(step.name)}
                              className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-all ${
                                step.status === "fail"
                                  ? "bg-bg-elevated/50 hover:bg-bg-elevated cursor-pointer border border-border/60"
                                  : step.status === "skip"
                                  ? "bg-bg-elevated/20 border border-transparent opacity-60"
                                  : "bg-bg-elevated/30 border border-transparent"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                                    step.status === "pass"
                                      ? "bg-success/20 text-success"
                                      : step.status === "fail"
                                      ? "bg-danger/20 text-danger"
                                      : "bg-muted/20 text-muted"
                                  }`}
                                >
                                  {i + 1}
                                </div>
                                <span className="text-sm">{step.action === 'navigate' ? `🌐 ${step.selector}` : step.action === 'click' ? `🖱 ${step.selector}` : step.action === 'fill' ? `⌨ ${step.selector}` : `${step.action}: ${step.selector}`}</span>
                                {hasDiff && (
                                  <span className="flex items-center gap-1 text-[10px] text-warning bg-warning/10 px-1.5 py-0.5 rounded">
                                    <GitCompare className="w-2.5 h-2.5" />
                                    元素变更
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                {hasDiff && !expanded && (
                                  <ChevronRight className="w-3.5 h-3.5 text-warning" />
                                )}
                                {hasDiff && expanded && (
                                  <ChevronDown className="w-3.5 h-3.5 text-warning" />
                                )}
                                <span className="text-xs text-text-tertiary">
                                  {step.duration > 0 ? `${(step.duration / 1000).toFixed(1)}s` : "-"}
                                </span>
                                <StatusBadge status={step.status} size="sm" />
                              </div>
                            </button>

                            {expanded && hasDiff && step.elementDiff && (
                              <ElementDiffCard diff={step.elementDiff} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                </>)}
              </div>

              {detailReady && (
                <LogTerminal
                  logs={selectedExec.logs || []}
                  isStreaming={selectedExec.status === "running"}
                  title="实时执行日志"
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatExecutionTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { hour12: false });
}

// 数值字段防护：字段缺失时按 0 处理，避免 .toFixed() 抛 TypeError 击穿整页
function num(value?: number) {
  return Number(value ?? 0);
}

function ApiExecutionPanel() {
  const [executions, setExecutions] = useState<ApiTestExecution[]>([]);
  const [collectionRuns, setCollectionRuns] = useState<import("@/api/services").ApiCollectionRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<import("@/api/services").ApiCollectionRun | null>(null);
  // 详情端点才返回 responseBody/assertionResults 等重字段，列表只保留标量字段
  const [executionDetail, setExecutionDetail] = useState<ApiTestExecution | null>(null);
  const [view, setView] = useState<"requests" | "collections">("requests");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string>();

  const load = useCallback(async () => {
    const [executionResult, collectionResult] = await Promise.all([
      apiTestsService.listExecutions({ limit: 100 }),
      apiTestsService.listCollectionRuns({ limit: 100 }),
    ]);
    if (executionResult.ok) {
      setExecutions(executionResult.data.items);
      setSelectedId((current) => executionResult.data.items.some((item) => item.id === current) ? current : executionResult.data.items[0]?.id || null);
    } else setMessage(executionResult.error || "接口执行记录加载失败");
    if (collectionResult.ok) {
      setCollectionRuns(collectionResult.data.items);
      setSelectedCollection((current) => collectionResult.data.items.find((item) => item.id === current?.id) || collectionResult.data.items[0] || null);
    } else setMessage(collectionResult.error || "接口集合执行记录加载失败");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // 选中请求变化时按需拉取详情（responseBody/assertionResults 等重字段）
  useEffect(() => {
    if (!selectedId) { setExecutionDetail(null); return; }
    let cancelled = false;
    void (async () => {
      const result = await get<ApiTestExecution>(API.apiTests.execution(selectedId));
      if (!cancelled && result.ok && result.data) setExecutionDetail(result.data);
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  // 存在执行中的集合时每 3 秒轮询刷新，无活跃集合时不轮询
  const hasActiveCollection = collectionRuns.some((item) => item.status === "running");
  const fetchingRef = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!hasActiveCollection) return;
    const timer = window.setInterval(() => {
      if (fetchingRef.current) return; // in-flight 守卫：上次请求未完成则跳过本轮
      fetchingRef.current = true;
      void loadRef.current().finally(() => { fetchingRef.current = false; });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [hasActiveCollection]);

  // 标量字段以列表为准（轮询实时更新），重字段来自详情
  const selected = (() => {
    const base = executions.find((item) => item.id === selectedId) || null;
    if (executionDetail && executionDetail.id === selectedId) return base ? { ...executionDetail, ...base } : executionDetail;
    return base;
  })();
  const requestDetailReady = !!executionDetail && executionDetail.id === selectedId;

  const keyword = search.toLowerCase();
  const filteredExecutions = executions.filter((item) => item.caseName.toLowerCase().includes(keyword) || item.url.toLowerCase().includes(keyword) || item.method.toLowerCase().includes(keyword));
  const filteredCollections = collectionRuns.filter((item) => item.collectionPath.toLowerCase().includes(keyword) || item.collectionName.toLowerCase().includes(keyword));

  const removeExecution = async () => {
    if (!selected || !await confirmAction({ title: "删除接口执行记录？", message: `即将删除“${selected.caseName}”的执行记录。`, detail: "此操作无法恢复。", confirmLabel: "确认删除" })) return;
    const result = await apiTestsService.removeExecution(selected.id);
    if (!result.ok) { setMessage(result.error || "删除失败"); return; }
    await load();
  };

  const removeCollection = async () => {
    if (!selectedCollection || selectedCollection.status === "running" || !await confirmAction({ title: "删除接口集合执行？", message: `即将删除“${selectedCollection.collectionPath}”的执行记录。`, detail: "集合报告和执行明细会被删除。", confirmLabel: "确认删除" })) return;
    const result = await apiTestsService.removeCollectionRun(selectedCollection.id);
    if (!result.ok) { setMessage(result.error || "删除失败"); return; }
    await load();
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-text-tertiary">加载接口执行记录...</div>;
  return <div className="space-y-5 animate-fade-in">
    <div className="flex items-center justify-between"><div><h2 className="mb-1 flex items-center gap-2 text-lg font-bold"><Braces className="h-5 w-5 text-violet-500" />接口测试执行</h2><p className="text-sm text-text-tertiary">单接口请求、断言结果和集合运行明细</p></div><button className="btn-secondary" disabled={refreshing} onClick={async () => { setRefreshing(true); await load(); setRefreshing(false); }}><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />刷新</button></div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <ExecutionStatCard label="请求记录" value={executions.length} icon={Send} color="text-violet-500" background="bg-violet-500/10" />
      <ExecutionStatCard label="集合运行" value={collectionRuns.length} icon={Braces} color="text-accent" background="bg-accent/10" />
      <ExecutionStatCard label="执行中" value={collectionRuns.filter((item) => item.status === "running").length} icon={Clock} color="text-warning" background="bg-warning/10" />
      <ExecutionStatCard label="失败" value={executions.filter((item) => item.status !== "success").length + collectionRuns.filter((item) => item.status === "failed").length} icon={AlertCircle} color="text-danger" background="bg-danger/10" />
    </div>
    {message && <div className="rounded border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{message}</div>}
    <div className="inline-flex rounded-lg border border-border/60 bg-bg-elevated p-1"><button className={`rounded-md px-3 py-1.5 text-xs ${view === "requests" ? "bg-bg-card text-violet-500 shadow-sm" : "text-text-secondary"}`} onClick={() => setView("requests")}>单接口请求</button><button className={`rounded-md px-3 py-1.5 text-xs ${view === "collections" ? "bg-bg-card text-accent shadow-sm" : "text-text-secondary"}`} onClick={() => setView("collections")}>集合执行</button></div>
    <div className="grid min-h-[520px] gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="card flex min-h-0 flex-col overflow-hidden"><div className="border-b border-border/60 p-3"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" /><input className="input pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索接口、URL 或集合" /></div></div><div className="min-h-0 flex-1 space-y-1 overflow-auto p-2">
        {view === "requests" ? filteredExecutions.map((item) => <button key={item.id} className={`w-full rounded-lg border p-3 text-left ${selectedId === item.id ? "border-violet-500/40 bg-violet-500/10" : "border-transparent hover:bg-bg-elevated"}`} onClick={() => setSelectedId(item.id)}><div className="mb-1.5 flex items-center justify-between"><span className="tag bg-violet-500/10 text-violet-500">{item.method}</span><StatusBadge status={item.status} size="sm" /></div><div className="truncate text-sm font-medium">{item.caseName}</div><div className="mt-1 truncate font-mono text-[10px] text-text-tertiary">{item.url}</div><div className="mt-2 text-[10px] text-text-tertiary">{formatExecutionTime(item.createdAt)} · {item.duration} ms</div></button>) : filteredCollections.map((item) => <button key={item.id} className={`w-full rounded-lg border p-3 text-left ${selectedCollection?.id === item.id ? "border-accent/40 bg-accent/10" : "border-transparent hover:bg-bg-elevated"}`} onClick={() => setSelectedCollection(item)}><div className="mb-1.5 flex items-center justify-between"><span className="text-sm font-medium">{item.collectionName}</span><StatusBadge status={item.status} size="sm" /></div><div className="truncate text-xs text-text-tertiary">{item.collectionPath}</div><div className="mt-2 text-[10px] text-text-tertiary">通过 {item.passed}/{item.total} · {formatExecutionTime(item.startedAt)}</div></button>)}
        {((view === "requests" && filteredExecutions.length === 0) || (view === "collections" && filteredCollections.length === 0)) && <div className="py-16 text-center text-sm text-text-tertiary">暂无执行记录</div>}
      </div></div>
      <div className="card min-w-0 overflow-auto p-5">
        {view === "requests" && selected && <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="mb-2 flex items-center gap-2"><span className="tag bg-violet-500/10 text-violet-500">{selected.method}</span><StatusBadge status={selected.status} size="md" /><h3 className="font-semibold">{selected.caseName}</h3></div><div className="break-all font-mono text-xs text-text-tertiary">{selected.url}</div></div><div className="flex gap-2"><Link to="/interface-testing" className="btn-secondary"><Braces className="h-4 w-4" />打开接口测试</Link><button className="btn-secondary text-danger" onClick={() => void removeExecution()}><X className="h-4 w-4" />删除</button></div></div>{selected.errorMessage && <div className="rounded border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{selected.errorMessage}</div>}<div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[["HTTP 状态", selected.statusCode ?? "-"], ["耗时", `${selected.duration} ms`], ["响应大小", `${selected.responseSize} B`], ["断言", requestDetailReady && selected.assertionResults ? `${selected.assertionResults.filter((item) => item.passed).length}/${selected.assertionResults.length}` : "…"]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-bg-elevated p-3"><div className="text-xs text-text-tertiary">{label}</div><div className="mt-1 font-semibold">{value}</div></div>)}</div>{requestDetailReady && selected.assertionResults ? <><div><h4 className="mb-2 text-sm font-medium">断言结果</h4><div className="space-y-2">{selected.assertionResults.map((item) => <div key={item.id} className={`rounded border p-3 text-xs ${item.passed ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5"}`}><div className={item.passed ? "text-success" : "text-danger"}>{item.passed ? "通过" : "失败"} · {item.source} {item.operator} {item.expected}</div><div className="mt-1 text-text-tertiary">实际：{item.actual}</div></div>)}{selected.assertionResults.length === 0 && <div className="text-xs text-text-tertiary">未配置断言</div>}</div></div><div><h4 className="mb-2 text-sm font-medium">响应 Body</h4><pre className="max-h-80 overflow-auto rounded-lg bg-[#152033] p-4 font-mono text-xs leading-5 text-slate-100 whitespace-pre-wrap break-words">{selected.responseBody || "(空响应)"}</pre></div></> : <div className="rounded-lg bg-bg-elevated p-6 text-center text-xs text-text-tertiary">加载执行详情...</div>}</div>}
        {view === "collections" && selectedCollection && <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="mb-2 flex items-center gap-2"><StatusBadge status={selectedCollection.status} size="md" /><h3 className="font-semibold">{selectedCollection.collectionPath}</h3></div><div className="text-xs text-text-tertiary">{formatExecutionTime(selectedCollection.startedAt)} · {selectedCollection.triggerType === "schedule" ? "定时任务" : "手动执行"}</div></div><div className="flex gap-2"><Link to="/reports?tab=api" className="btn-secondary"><FileText className="h-4 w-4" />查看报告</Link><button disabled={selectedCollection.status === "running"} className="btn-secondary text-danger" onClick={() => void removeCollection()}><X className="h-4 w-4" />删除</button></div></div><div className="grid grid-cols-3 gap-3">{[["接口总数", selectedCollection.total], ["通过", selectedCollection.passed], ["失败", selectedCollection.failed]].map(([label, value], index) => <div key={String(label)} className="rounded-lg bg-bg-elevated p-4"><div className="text-xs text-text-tertiary">{label}</div><div className={`mt-1 text-xl font-bold ${index === 1 ? "text-success" : index === 2 ? "text-danger" : ""}`}>{value}</div></div>)}</div><div className="overflow-x-auto rounded border border-border/60"><table className="w-full min-w-[680px] text-xs"><thead className="bg-bg-elevated"><tr><th className="px-3 py-2 text-left">接口</th><th className="px-3 py-2 text-left">方法</th><th className="px-3 py-2 text-left">状态</th><th className="px-3 py-2 text-right">耗时</th><th className="px-3 py-2 text-right">断言</th></tr></thead><tbody>{selectedCollection.items.map((item) => <tr key={item.id} className="border-t border-border/40"><td className="px-3 py-2"><div className="font-medium">{item.caseName}</div><div className="max-w-80 truncate text-[10px] text-text-tertiary">{item.url}</div></td><td className="px-3 py-2 text-violet-500">{item.method}</td><td className="px-3 py-2"><StatusBadge status={item.status} size="sm" /></td><td className="px-3 py-2 text-right">{item.duration} ms</td><td className="px-3 py-2 text-right">{item.assertionPassed}/{item.assertionTotal}</td></tr>)}</tbody></table></div></div>}
        {((view === "requests" && !selected) || (view === "collections" && !selectedCollection)) && <div className="flex h-full min-h-80 items-center justify-center text-sm text-text-tertiary">请选择一条执行记录</div>}
      </div>
    </div>
  </div>;
}

function PerformanceExecutionPanel() {
  const [runs, setRuns] = useState<PerformanceRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 详情端点才返回 config/errors/transactions/metrics 等重字段，列表只保留标量字段
  const [runDetail, setRunDetail] = useState<PerformanceRun | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string>();

  const load = useCallback(async () => {
    const result = await performanceTestsService.listRuns({ limit: 100 });
    if (result.ok) {
      setRuns(result.data.items);
      setSelectedId((current) => result.data.items.some((item) => item.id === current) ? current : result.data.items[0]?.id || null);
    } else setMessage(result.error || "性能测试执行记录加载失败");
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // 选中运行变化时按需拉取详情（config/errors/transactions 等重字段）
  useEffect(() => {
    if (!selectedId) { setRunDetail(null); return; }
    let cancelled = false;
    void (async () => {
      const result = await performanceTestsService.getRun(selectedId);
      if (!cancelled && result.ok && result.data) setRunDetail(result.data);
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  // 存在 pending/running 运行时每 1.5 秒轮询刷新，无活跃运行时不轮询
  const hasActiveRun = runs.some((item) => ["pending", "running"].includes(item.status));
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const selectedActiveRef = useRef(false);
  selectedActiveRef.current = runs.some((item) => item.id === selectedId && ["pending", "running"].includes(item.status));
  const fetchingRef = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!hasActiveRun) return;
    const timer = window.setInterval(() => {
      if (fetchingRef.current) return; // in-flight 守卫：上次请求未完成则跳过本轮
      fetchingRef.current = true;
      void (async () => {
        try {
          await loadRef.current();
          // 选中运行仍在执行时同步刷新详情，保持事务与错误明细实时
          if (selectedIdRef.current && selectedActiveRef.current) {
            const result = await performanceTestsService.getRun(selectedIdRef.current);
            if (result.ok && result.data) setRunDetail(result.data);
          }
        } finally {
          fetchingRef.current = false;
        }
      })();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [hasActiveRun]);

  // 标量字段以列表为准（轮询实时更新），重字段来自详情
  const selected = (() => {
    const base = runs.find((item) => item.id === selectedId) || null;
    if (runDetail && runDetail.id === selectedId) return base ? { ...runDetail, ...base } : runDetail;
    return base;
  })();
  const runConfig = selected?.config || {};

  const filtered = runs.filter((item) => item.scenarioName.toLowerCase().includes(search.toLowerCase()));
  const removeRun = async () => {
    if (!selected || ["pending", "running"].includes(selected.status) || !await confirmAction({ title: "删除性能测试执行？", message: `即将删除“${selected.scenarioName}”的执行记录和报告。`, detail: "此操作无法恢复。", confirmLabel: "确认删除" })) return;
    const result = await performanceTestsService.removeRun(selected.id);
    if (!result.ok) { setMessage(result.error || "删除失败"); return; }
    await load();
  };
  const cancelRun = async () => {
    if (!selected || !["pending", "running"].includes(selected.status) || !await confirmAction({ title: "停止性能测试？", message: "当前性能测试将停止，已产生的数据仍会保存。", confirmLabel: "确认停止", danger: false })) return;
    const result = await performanceTestsService.cancelRun(selected.id);
    if (!result.ok) setMessage(result.error || "停止失败");
    await load();
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-text-tertiary">加载性能执行记录...</div>;
  return <div className="space-y-5 animate-fade-in">
    <div className="flex items-center justify-between"><div><h2 className="mb-1 flex items-center gap-2 text-lg font-bold"><Gauge className="h-5 w-5 text-warning" />性能测试执行</h2><p className="text-sm text-text-tertiary">压测运行状态、吞吐量、响应时间和错误统计</p></div><button className="btn-secondary" disabled={refreshing} onClick={async () => { setRefreshing(true); await load(); setRefreshing(false); }}><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />刷新</button></div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <ExecutionStatCard label="全部运行" value={runs.length} icon={BarChart3} color="text-warning" background="bg-warning/10" />
      <ExecutionStatCard label="执行中" value={runs.filter((item) => ["pending", "running"].includes(item.status)).length} icon={Timer} color="text-accent" background="bg-accent/10" />
      <ExecutionStatCard label="通过" value={runs.filter((item) => item.status === "success").length} icon={Play} color="text-success" background="bg-success/10" />
      <ExecutionStatCard label="未达标" value={runs.filter((item) => item.status === "failed").length} icon={AlertCircle} color="text-danger" background="bg-danger/10" />
    </div>
    {message && <div className="rounded border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{message}</div>}
    <div className="grid min-h-[540px] gap-4 lg:grid-cols-[360px_minmax(0,1fr)]"><div className="card flex min-h-0 flex-col overflow-hidden"><div className="border-b border-border/60 p-3"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" /><input className="input pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索性能场景" /></div></div><div className="min-h-0 flex-1 space-y-1 overflow-auto p-2">{filtered.map((run) => <button key={run.id} className={`w-full rounded-lg border p-3 text-left ${selectedId === run.id ? "border-warning/40 bg-warning/10" : "border-transparent hover:bg-bg-elevated"}`} onClick={() => setSelectedId(run.id)}><div className="mb-1.5 flex items-center justify-between"><span className="truncate text-sm font-medium">{run.scenarioName}</span><StatusBadge status={run.status} size="sm" /></div><div className="grid grid-cols-3 gap-2 text-[10px] text-text-tertiary"><span>RPS {num(run.requestsPerSecond).toFixed(1)}</span><span>P95 {num(run.p95ResponseTime).toFixed(0)}ms</span><span>错误 {num(run.errorRate).toFixed(1)}%</span></div><div className="mt-2 text-[10px] text-text-tertiary">{formatExecutionTime(run.startedAt || run.createdAt)}</div></button>)}{filtered.length === 0 && <div className="py-16 text-center text-sm text-text-tertiary">暂无性能测试执行</div>}</div></div>
      <div className="card min-w-0 overflow-auto p-5">{selected ? <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="mb-2 flex items-center gap-2"><StatusBadge status={selected.status} size="md" /><h3 className="text-lg font-semibold">{selected.scenarioName}</h3></div><div className="text-xs text-text-tertiary">执行 ID：{selected.id} · {formatExecutionTime(selected.startedAt || selected.createdAt)}</div></div><div className="flex gap-2"><Link to="/performance-testing" className="btn-secondary"><Gauge className="h-4 w-4" />打开性能测试</Link>{["pending", "running"].includes(selected.status) ? <button className="btn-danger" onClick={() => void cancelRun()}><Square className="h-4 w-4" />停止</button> : <button className="btn-secondary text-danger" onClick={() => void removeRun()}><X className="h-4 w-4" />删除</button>}</div></div>{selected.errorMessage && <div className="rounded border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{selected.errorMessage}</div>}<div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[["请求总数", selected.totalRequests], ["成功", selected.successfulRequests], ["失败", selected.failedRequests], ["错误率", `${num(selected.errorRate).toFixed(2)}%`], ["RPS", num(selected.requestsPerSecond).toFixed(2)], ["平均响应", `${num(selected.avgResponseTime).toFixed(0)} ms`], ["P95", `${num(selected.p95ResponseTime).toFixed(0)} ms`], ["P99", `${num(selected.p99ResponseTime).toFixed(0)} ms`]].map(([label, value], index) => <div key={String(label)} className="rounded-lg bg-bg-elevated p-3"><div className="text-xs text-text-tertiary">{label}</div><div className={`mt-1 font-semibold ${index === 1 ? "text-success" : index === 2 || index === 3 ? "text-danger" : ""}`}>{value}</div></div>)}</div><div className="grid gap-4 lg:grid-cols-2"><div><h4 className="mb-2 text-sm font-medium">压力配置</h4><div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 p-3 text-xs">{[["并发", runConfig.concurrency || 0], ["模式", runConfig.executionMode === "samples" ? `${runConfig.sampleCount || 0} 次` : `${runConfig.durationSeconds || 0} 秒`], ["接口", `${runConfig.caseCount || 0} 个`], ["IP池", runConfig.useProxyPool ? `${runConfig.proxyCount || 0} 个` : "未开启"]].map(([label, value]) => <div key={String(label)}><span className="text-text-tertiary">{label}：</span>{value}</div>)}</div></div><div><h4 className="mb-2 text-sm font-medium">错误摘要</h4><div className="max-h-48 space-y-2 overflow-auto">{(selected.errors || []).map((error) => <div key={error.message} className="flex justify-between gap-3 rounded border border-danger/20 bg-danger/5 p-2 text-xs"><span className="break-all text-danger">{error.message}</span><span className="shrink-0">{error.count} 次</span></div>)}{(selected.errors || []).length === 0 && <div className="text-xs text-text-tertiary">没有请求错误</div>}</div></div></div><div><h4 className="mb-2 text-sm font-medium">接口事务</h4><div className="overflow-x-auto rounded border border-border/60"><table className="w-full min-w-[700px] text-xs"><thead className="bg-bg-elevated"><tr><th className="px-3 py-2 text-left">接口</th><th className="px-3 py-2 text-right">请求</th><th className="px-3 py-2 text-right">平均</th><th className="px-3 py-2 text-right">P95</th><th className="px-3 py-2 text-right">错误率</th></tr></thead><tbody>{(selected.transactions || []).map((item) => <tr key={item.caseId} className="border-t border-border/40"><td className="px-3 py-2"><div className="font-medium">{item.caseName}</div><div className="max-w-96 truncate text-[10px] text-text-tertiary">{item.method} {item.url}</div></td><td className="px-3 py-2 text-right">{item.totalRequests}</td><td className="px-3 py-2 text-right">{num(item.avgResponseTime).toFixed(0)} ms</td><td className="px-3 py-2 text-right">{num(item.p95ResponseTime).toFixed(0)} ms</td><td className="px-3 py-2 text-right text-danger">{num(item.errorRate).toFixed(2)}%</td></tr>)}</tbody></table></div></div></div> : <div className="flex h-full min-h-80 items-center justify-center text-sm text-text-tertiary">请选择一条性能测试执行</div>}</div>
    </div>
  </div>;
}

type ExecutionModule = "ui" | "api" | "performance";

export default function Execution() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("type");
  const activeModule: ExecutionModule = requested === "api" || requested === "performance" ? requested : "ui";
  const modules = [
    { key: "ui" as const, label: "UI 自动化", description: "浏览器用例、步骤和截图", icon: MonitorCheck, active: "border-accent bg-accent/10 text-accent", iconBg: "bg-accent/15 text-accent" },
    { key: "api" as const, label: "接口测试", description: "接口请求、断言和集合", icon: Braces, active: "border-violet-500 bg-violet-500/10 text-violet-500", iconBg: "bg-violet-500/15 text-violet-500" },
    { key: "performance" as const, label: "性能测试", description: "压测、吞吐量和响应时间", icon: Gauge, active: "border-warning bg-warning/10 text-warning", iconBg: "bg-warning/15 text-warning" },
  ];
  return <div className="space-y-6 animate-fade-in"><div><h1 className="mb-1 text-xl font-bold">执行中心</h1><p className="text-sm text-text-tertiary">按测试类型查看和管理执行任务</p></div><div className="grid gap-3 md:grid-cols-3" role="tablist" aria-label="执行模块">{modules.map((item) => { const Icon = item.icon; const selected = activeModule === item.key; return <button key={item.key} role="tab" aria-selected={selected} onClick={() => setSearchParams({ type: item.key })} className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${selected ? item.active : "border-border/60 bg-bg-card hover:border-border"}`}><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.iconBg}`}><Icon className="h-5 w-5" /></span><span><span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-xs text-text-tertiary">{item.description}</span></span></button>; })}</div>{activeModule === "ui" ? <UiExecutionPanel /> : activeModule === "api" ? <ApiExecutionPanel /> : <PerformanceExecutionPanel />}</div>;
}

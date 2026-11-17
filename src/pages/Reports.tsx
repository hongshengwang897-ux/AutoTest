import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Braces, ChevronDown, Clock, Download, Eye, FileText, Loader2, Search, X, FileJson, FileSpreadsheet } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import StatusBadge from "@/components/StatusBadge";
import { apiTestsService, executionsService } from "@/api/services";
import type { ApiCollectionRun, ExecutionItem } from "@/api/services";

function durationText(duration?: number) {
  if (!duration) return "-";
  if (duration < 1000) return `${duration} ms`;
  return `${(duration / 1000).toFixed(1)} s`;
}

function formatDateTime(value?: string) {
  // startedAt 为空或非法时显示 "—"，避免 "Invalid Date"
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [platformItems, setPlatformItems] = useState<ExecutionItem[]>([]);
  const [apiItems, setApiItems] = useState<ApiCollectionRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<ApiCollectionRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [allureExporting, setAllureExporting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const activeTab = searchParams.get("tab") === "api" ? "api" : "platform";

  const loadApiReports = useCallback(async () => {
    const result = await apiTestsService.listCollectionRuns({ limit: 100 });
    if (result.ok) setApiItems(result.data.items);
  }, []);

  const load = useCallback(async () => {
    const [platformResult] = await Promise.all([executionsService.list({ limit: 100 }), loadApiReports()]);
    if (platformResult.ok) setPlatformItems(platformResult.data.items);
    setLoading(false);
  }, [loadApiReports]);

  useEffect(() => { void load(); }, [load]);

  // 存在执行中的集合时每 3 秒轮询刷新，无活跃集合时不轮询
  const hasActiveApiRun = apiItems.some((item) => item.status === "running");
  const fetchingRef = useRef(false);
  const loadApiRef = useRef(loadApiReports);
  loadApiRef.current = loadApiReports;
  useEffect(() => {
    if (!hasActiveApiRun) return;
    const timer = window.setInterval(() => {
      if (fetchingRef.current) return; // in-flight 守卫：上次请求未完成则跳过本轮
      fetchingRef.current = true;
      void loadApiRef.current().finally(() => { fetchingRef.current = false; });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [hasActiveApiRun]);

  const filteredPlatform = useMemo(() => platformItems.filter((item) => {
    const matchesSearch = (item.caseName || "").toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (statusFilter === "all" || item.status === statusFilter);
  }), [platformItems, search, statusFilter]);

  const filteredApi = useMemo(() => apiItems.filter((item) => {
    const keyword = search.toLowerCase();
    const matchesSearch = item.collectionPath.toLowerCase().includes(keyword) || item.collectionName.toLowerCase().includes(keyword);
    return matchesSearch && (statusFilter === "all" || item.status === statusFilter);
  }), [apiItems, search, statusFilter]);

  const switchTab = (tab: "platform" | "api") => {
    setSearchParams(tab === "api" ? { tab: "api" } : {});
    setStatusFilter("all");
    setSearch("");
  };

  const openApiReport = async (id: string) => {
    setDetailLoading(true);
    const result = await apiTestsService.getCollectionRun(id);
    setDetailLoading(false);
    if (result.ok) setSelectedRun(result.data);
  };

  const downloadApiReport = async (run: ApiCollectionRun) => {
    const node = reportRef.current;
    if (!node || pdfExporting) return;
    setPdfExporting(true);
    try {
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        onclone: (doc) => {
          // 模态卡片有 max-h/overflow-hidden，克隆时放开以完整捕获滚动内容
          const card = doc.querySelector<HTMLElement>("[data-report-card]");
          if (card) {
            card.style.maxHeight = "none";
            card.style.overflow = "visible";
          }
          const body = doc.querySelector<HTMLElement>("[data-report-body]");
          if (body) {
            body.style.overflow = "visible";
            body.style.maxHeight = "none";
          }
        },
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = margin;
      pdf.addImage(imgData, "JPEG", margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;
      // 内容超出单页时按页切分，避免表格被截断
      while (heightLeft > 0) {
        position -= pageHeight - margin * 2;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", margin, position, imgWidth, imgHeight);
        heightLeft -= pageHeight - margin * 2;
      }
      pdf.save(`${run.collectionName || run.collectionPath}-${run.id}.pdf`);
    } finally {
      setPdfExporting(false);
    }
  };

  const downloadAllureReport = async (run: ApiCollectionRun) => {
    if (allureExporting) return;
    setAllureExporting(true);
    try {
      const result = await apiTestsService.downloadCollectionRunAllure(run.id);
      if (!result.ok || !result.blob) {
        setMessage({ type: "error", text: result.error || "Allure 报告导出失败" });
        return;
      }
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setAllureExporting(false);
    }
  };

  const downloadExcelReport = (run: ApiCollectionRun) => {
    // 接口明细导出为 xlsx：序号/方法/接口/URL/HTTP/断言/状态/耗时/错误
    const rows = run.items.map((item, index) => ({
      "序号": index + 1,
      "方法": item.method,
      "接口": item.caseName,
      "URL": item.url,
      "HTTP": item.statusCode ?? "",
      "断言": `${item.assertionPassed}/${item.assertionTotal}`,
      "状态": item.status === "success" ? "通过" : item.status === "failed" ? "失败" : item.status,
      "耗时(ms)": item.duration,
      "错误信息": item.errorMessage || "",
    }));
    const header = ["序号", "方法", "接口", "URL", "HTTP", "断言", "状态", "耗时(ms)", "错误信息"];
    const worksheet = XLSX.utils.json_to_sheet(rows, { header });
    worksheet["!cols"] = [
      { wch: 6 }, { wch: 8 }, { wch: 24 }, { wch: 60 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 40 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "接口明细");
    // 摘要页：整体统计
    const summary = [
      ["接口集合", run.collectionName],
      ["路径", run.collectionPath],
      ["触发方式", run.triggerType === "schedule" ? "定时任务" : "手动执行"],
      ["接口总数", run.total],
      ["通过", run.passed],
      ["失败", run.failed],
      ["耗时(ms)", run.duration],
      ["开始时间", run.startedAt ? new Date(run.startedAt).toLocaleString("zh-CN", { hour12: false }) : ""],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summary);
    summarySheet["!cols"] = [{ wch: 14 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, "摘要");
    const base = run.collectionName || run.collectionPath || "collection";
    XLSX.writeFile(workbook, `${base}-${run.id}.xlsx`);
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-text-tertiary"><Loader2 className="mr-2 h-5 w-5 animate-spin" />加载中...</div>;

  return (
    <div className="space-y-5 animate-fade-in">
      {message && <div className={`fixed bottom-20 lg:bottom-4 right-4 z-[60] px-4 py-2.5 rounded border shadow-xl text-sm ${message.type === "success" ? "bg-bg-card border-success/40 text-success" : "bg-bg-card border-danger/40 text-danger"}`}>{message.text}</div>}
      <div><h1 className="mb-1 text-xl font-bold">报告中心</h1><p className="text-sm text-text-tertiary">查看平台用例与接口集合的历史执行结果</p></div>

      <div className="flex border-b border-border/60">
        <button onClick={() => switchTab("platform")} className={`flex h-10 items-center gap-2 border-b-2 px-4 text-sm ${activeTab === "platform" ? "border-accent text-accent" : "border-transparent text-text-tertiary"}`}><FileText className="h-4 w-4" />平台用例报告</button>
        <button onClick={() => switchTab("api")} className={`flex h-10 items-center gap-2 border-b-2 px-4 text-sm ${activeTab === "api" ? "border-accent text-accent" : "border-transparent text-text-tertiary"}`}><Braces className="h-4 w-4" />接口集合报告</button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" /><input placeholder={activeTab === "api" ? "搜索集合报告" : "搜索用例报告"} value={search} onChange={(event) => setSearch(event.target.value)} className="input w-full pl-10" /></div>
        <div className="relative"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input w-32 cursor-pointer appearance-none pr-8"><option value="all">全部状态</option><option value="success">成功</option><option value="failed">失败</option><option value="running">执行中</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" /></div>
      </div>

      {activeTab === "platform" ? (
        <div className="overflow-x-auto border-y border-border/60">
          <table className="w-full min-w-[760px]"><thead><tr className="border-b border-border/60 bg-bg-elevated/50"><th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">用例</th><th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">状态</th><th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">步骤</th><th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">耗时</th><th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">执行时间</th><th className="px-4 py-3 text-right text-xs font-medium text-text-tertiary">操作</th></tr></thead>
            <tbody>{filteredPlatform.map((execution) => <tr key={execution.id} className="border-b border-border/30 hover:bg-bg-elevated/30"><td className="px-4 py-3"><div className="text-sm font-medium">{execution.caseName}</div><div className="text-[11px] text-text-tertiary">{execution.id}</div></td><td className="px-4 py-3"><StatusBadge status={execution.status} size="sm" /></td><td className="px-4 py-3 text-sm text-text-secondary">{Array.isArray(execution.steps) ? `${execution.steps.filter((step) => step.status === "pass").length}/${execution.steps.length}` : "-"}</td><td className="px-4 py-3 text-sm text-text-secondary">{durationText(execution.duration)}</td><td className="px-4 py-3 text-sm text-text-secondary">{execution.startTime ? new Date(execution.startTime).toLocaleString("zh-CN", { hour12: false }) : "-"}</td><td className="px-4 py-3 text-right"><Link to={`/reports/${execution.id}`} className="inline-flex h-8 w-8 items-center justify-center rounded text-text-secondary hover:bg-accent/15 hover:text-accent" title="查看报告"><Eye className="h-4 w-4" /></Link></td></tr>)}</tbody>
          </table>
          {filteredPlatform.length === 0 && <div className="py-12 text-center text-sm text-text-tertiary">暂无平台用例报告</div>}
        </div>
      ) : (
        <div className="overflow-x-auto border-y border-border/60">
          <table className="w-full min-w-[820px]"><thead><tr className="border-b border-border/60 bg-bg-elevated/50"><th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">接口集合</th><th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">状态</th><th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">结果</th><th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">触发方式</th><th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">耗时</th><th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary">执行时间</th><th className="px-4 py-3 text-right text-xs font-medium text-text-tertiary">操作</th></tr></thead>
            <tbody>{filteredApi.map((run) => <tr key={run.id} className="border-b border-border/30 hover:bg-bg-elevated/30"><td className="px-4 py-3"><div className="text-sm font-medium">{run.collectionName}</div><div className="text-[11px] text-text-tertiary">{run.collectionPath}</div></td><td className="px-4 py-3"><StatusBadge status={run.status} size="sm" /></td><td className="px-4 py-3"><span className="text-sm text-success">{run.passed}</span><span className="text-sm text-text-tertiary"> / {run.total}</span>{run.failed > 0 && <span className="ml-2 text-xs text-danger">失败 {run.failed}</span>}</td><td className="px-4 py-3 text-sm text-text-secondary">{run.triggerType === "schedule" ? "定时任务" : "手动执行"}</td><td className="px-4 py-3 text-sm text-text-secondary">{run.status === "running" ? "执行中" : durationText(run.duration)}</td><td className="px-4 py-3 text-sm text-text-secondary">{formatDateTime(run.startedAt)}</td><td className="px-4 py-3 text-right"><button onClick={() => void openApiReport(run.id)} className="inline-flex h-8 w-8 items-center justify-center rounded text-text-secondary hover:bg-accent/15 hover:text-accent" title="查看集合报告"><Eye className="h-4 w-4" /></button></td></tr>)}</tbody>
          </table>
          {filteredApi.length === 0 && <div className="py-12 text-center text-sm text-text-tertiary">暂无接口集合报告</div>}
        </div>
      )}

      <div className="text-sm text-text-tertiary">共 {activeTab === "api" ? filteredApi.length : filteredPlatform.length} 条记录</div>
      {detailLoading && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><Loader2 className="h-7 w-7 animate-spin text-accent" /></div>}

      {selectedRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="接口集合报告详情">
          <div ref={reportRef} data-report-card className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3"><div><div className="mb-1 flex items-center gap-2"><h2 className="text-sm font-semibold">{selectedRun.collectionPath}</h2><StatusBadge status={selectedRun.status} size="sm" /></div><p className="text-[11px] text-text-tertiary">{formatDateTime(selectedRun.startedAt)} · {selectedRun.triggerType === "schedule" ? "定时任务" : "手动执行"} · {durationText(selectedRun.duration)}</p></div><div className="flex gap-1"><button onClick={() => downloadExcelReport(selectedRun)} className="flex h-8 w-8 items-center justify-center rounded text-text-secondary hover:bg-bg-elevated" title="导出 Excel"><FileSpreadsheet className="h-4 w-4" /></button><button onClick={() => void downloadAllureReport(selectedRun)} disabled={allureExporting} className="flex h-8 w-8 items-center justify-center rounded text-text-secondary hover:bg-bg-elevated disabled:opacity-40" title="导出 Allure 报告">{allureExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}</button><button onClick={() => void downloadApiReport(selectedRun)} disabled={pdfExporting} className="flex h-8 w-8 items-center justify-center rounded text-text-secondary hover:bg-bg-elevated disabled:opacity-40" title="导出 PDF 报告">{pdfExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}</button><button onClick={() => setSelectedRun(null)} className="flex h-8 w-8 items-center justify-center rounded text-text-secondary hover:bg-bg-elevated" title="关闭"><X className="h-4 w-4" /></button></div></div>
            <div className="grid grid-cols-3 border-b border-border/50"><div className="px-4 py-3"><div className="text-[11px] text-text-tertiary">接口总数</div><div className="mt-1 text-lg font-semibold">{selectedRun.total}</div></div><div className="border-l border-border/40 px-4 py-3"><div className="text-[11px] text-text-tertiary">通过</div><div className="mt-1 text-lg font-semibold text-success">{selectedRun.passed}</div></div><div className="border-l border-border/40 px-4 py-3"><div className="text-[11px] text-text-tertiary">失败</div><div className="mt-1 text-lg font-semibold text-danger">{selectedRun.failed}</div></div></div>
            <div data-report-body className="min-h-0 flex-1 overflow-auto"><div className="min-w-[780px]"><div className="grid grid-cols-[48px_90px_minmax(180px,1fr)_90px_100px_100px] border-b border-border/50 bg-bg-elevated/40 text-[11px] text-text-tertiary"><span className="px-3 py-2">序号</span><span className="px-3 py-2">方法</span><span className="px-3 py-2">接口</span><span className="px-3 py-2">HTTP</span><span className="px-3 py-2">断言</span><span className="px-3 py-2">耗时</span></div>{selectedRun.items.map((item, index) => <div key={item.id} className="grid grid-cols-[48px_90px_minmax(180px,1fr)_90px_100px_100px] border-b border-border/30 text-xs"><span className="px-3 py-3 text-text-tertiary">{index + 1}</span><span className="px-3 py-3 font-semibold text-accent">{item.method}</span><div className="min-w-0 px-3 py-3"><div className="truncate font-medium">{item.caseName}</div><div className="mt-1 truncate font-mono text-[10px] text-text-tertiary">{item.url}</div>{item.errorMessage && <div className="mt-1 break-words text-[11px] text-danger">{item.errorMessage}</div>}</div><span className={`px-3 py-3 ${item.status === "success" ? "text-success" : "text-danger"}`}>{item.statusCode || item.status}</span><span className="px-3 py-3 text-text-secondary">{item.assertionPassed}/{item.assertionTotal}</span><span className="px-3 py-3 text-text-secondary"><Clock className="mr-1 inline h-3 w-3" />{durationText(item.duration)}</span></div>)}{selectedRun.items.length === 0 && <div className="py-12 text-center text-xs text-text-tertiary">{selectedRun.status === "running" ? "集合正在执行，请稍后刷新报告" : "没有执行明细"}</div>}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}

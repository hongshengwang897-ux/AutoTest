import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertCircle, AlertTriangle, BarChart3, CheckCircle2, ChevronRight, Clock3, Copy, Gauge, Layers3,
  FileText, Loader2, Pencil, Play, Plus, Printer, RefreshCw, Save, Send, ShieldCheck, Square, Table2,
  Target, Trash2, Users, XCircle, Zap,
} from "lucide-react";
import {
  apiTestsService, environmentsService, performanceTestsService,
  type ApiAssertion, type ApiCollectionSummary, type ApiKeyValue, type ApiTestCase, type ApiTestExecution, type EnvironmentItem,
  type PerformanceCustomRequest, type PerformanceMetric, type PerformanceRun, type PerformanceScenario,
} from "@/api/services";
import { confirmAction } from "@/components/ConfirmDialog";

type Tab = "scenarios" | "monitor" | "reports";
type RequestEditorTab = "params" | "headers" | "body" | "assertions" | "variables";
type ResponseEditorTab = "body" | "headers" | "assertions" | "history";

const emptyScenario = (): Partial<PerformanceScenario> => ({
  name: "", description: "", targetType: "cases", targetIds: [], customRequests: [], collectionPath: "", environmentId: "",
  concurrency: 10, executionMode: "samples", sampleCount: 1000, durationSeconds: 60, rampUpSeconds: 10, timeoutMs: 30000, thinkTimeMs: 0,
  useProxyPool: false,
  successRateThreshold: 95, p95ThresholdMs: 2000,
});

const statusMeta: Record<PerformanceRun["status"], { label: string; className: string }> = {
  pending: { label: "准备中", className: "bg-warning/15 text-warning" },
  running: { label: "执行中", className: "bg-accent/15 text-accent" },
  success: { label: "通过", className: "bg-success/15 text-success" },
  failed: { label: "未达标", className: "bg-danger/15 text-danger" },
  cancelled: { label: "已取消", className: "bg-text-tertiary/15 text-text-secondary" },
};

const createCustomRequest = (): PerformanceCustomRequest => ({
  id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: "",
  method: "GET",
  url: "",
  headers: [],
  queryParams: [],
  bodyType: "none",
  body: "",
  assertions: [{ id: `assert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, source: "status", operator: "equals", target: "", expected: "200" }],
  variables: {},
});

const createKeyValue = (): ApiKeyValue => ({ id: `kv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, key: "", value: "", enabled: true });
const createAssertion = (): ApiAssertion => ({ id: `assert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, source: "status", operator: "equals", target: "", expected: "200" });

function legacyHeaders(value: unknown): ApiKeyValue[] {
  return String(value || "").split(/\r?\n/).map((line, index) => {
    const separator = line.indexOf(":");
    if (separator < 1) return null;
    return { id: `legacy-header-${index}`, key: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim(), enabled: true };
  }).filter((item): item is ApiKeyValue => Boolean(item?.key));
}

function normalizeCustomRequest(request: PerformanceCustomRequest & { headersText?: string }): PerformanceCustomRequest {
  return {
    ...request,
    headers: Array.isArray(request.headers) ? request.headers.map((item) => ({ ...item })) : legacyHeaders(request.headersText),
    queryParams: Array.isArray(request.queryParams) ? request.queryParams.map((item) => ({ ...item })) : [],
    assertions: Array.isArray(request.assertions) ? request.assertions.map((item) => ({ ...item })) : [],
    variables: request.variables && typeof request.variables === "object" ? { ...request.variables } : {},
  };
}

const assertionSourceLabels: Record<ApiAssertion["source"], string> = { status: "状态码", body: "响应 Body", header: "响应 Header", json: "JSON 路径" };
const assertionOperatorLabels: Record<ApiAssertion["operator"], string> = { equals: "等于", not_equals: "不等于", contains: "包含", not_contains: "不包含", exists: "存在", not_exists: "不存在", matches: "正则匹配", greater_than: "大于", less_than: "小于" };

function KeyValueRows({ items, onChange, keyPlaceholder = "名称", valuePlaceholder = "值" }: { items: ApiKeyValue[]; onChange: (items: ApiKeyValue[]) => void; keyPlaceholder?: string; valuePlaceholder?: string }) {
  const update = (index: number, values: Partial<ApiKeyValue>) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));
  return <div className="min-h-48 overflow-auto">
    <div className="min-w-[560px]">
      <div className="grid grid-cols-[38px_1fr_1fr_38px] border-b border-border/50 bg-bg-elevated/50 text-[11px] text-text-tertiary"><span /><span className="px-3 py-2 border-l border-border/30">名称</span><span className="px-3 py-2 border-l border-border/30">值</span><span /></div>
      {items.map((item, index) => <div key={item.id} className="grid grid-cols-[38px_1fr_1fr_38px] min-h-10 border-b border-border/30">
        <label className="flex items-center justify-center"><input type="checkbox" checked={item.enabled} onChange={(event) => update(index, { enabled: event.target.checked })} className="accent-accent" /></label>
        <input value={item.key} onChange={(event) => update(index, { key: event.target.value })} placeholder={keyPlaceholder} className="min-w-0 bg-transparent border-l border-border/30 px-3 outline-none focus:bg-bg-elevated/50" />
        <input value={item.value} onChange={(event) => update(index, { value: event.target.value })} placeholder={valuePlaceholder} className="min-w-0 bg-transparent border-l border-border/30 px-3 font-mono text-xs outline-none focus:bg-bg-elevated/50" />
        <button title="删除" className="flex items-center justify-center text-text-tertiary hover:text-danger" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="w-3.5 h-3.5" /></button>
      </div>)}
      <button className="h-10 px-3 flex items-center gap-1.5 text-xs text-text-tertiary hover:text-accent" onClick={() => onChange([...items, createKeyValue()])}><Plus className="w-3.5 h-3.5" />添加一行</button>
    </div>
  </div>;
}

function PerformanceRequestEditor({ request, index, canRemove, environmentId, timeoutMs, onChange, onRemove }: { request: PerformanceCustomRequest; index: number; canRemove: boolean; environmentId: string; timeoutMs: number; onChange: (request: PerformanceCustomRequest) => void; onRemove: () => void }) {
  const [activeTab, setActiveTab] = useState<RequestEditorTab>("params");
  const [responseTab, setResponseTab] = useState<ResponseEditorTab>("body");
  const [response, setResponse] = useState<ApiTestExecution>();
  const [history, setHistory] = useState<ApiTestExecution[]>([]);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const patch = (values: Partial<PerformanceCustomRequest>) => onChange({ ...request, ...values });
  const requestTabs = [
    { id: "params", label: "Params", count: request.queryParams.filter((item) => item.enabled && item.key).length },
    { id: "headers", label: "Headers", count: request.headers.filter((item) => item.enabled && item.key).length },
    { id: "body", label: "Body" },
    { id: "assertions", label: "断言", count: request.assertions.length },
    { id: "variables", label: "变量", count: Object.keys(request.variables).length },
  ] as const;
  const updateAssertion = (assertionIndex: number, values: Partial<ApiAssertion>) => patch({ assertions: request.assertions.map((item, itemIndex) => itemIndex === assertionIndex ? { ...item, ...values } : item) });
  const runRequest = async () => {
    if (!request.url.trim()) { setRunError("请输入请求 URL"); return; }
    setRunning(true);
    setRunError("");
    const result = await apiTestsService.run({ ...request, environmentId, timeoutMs });
    setRunning(false);
    if (!result.ok) { setRunError(result.error || "请求执行失败"); return; }
    setResponse(result.data);
    setHistory((items) => [result.data, ...items.filter((item) => item.id !== result.data.id)]);
    setResponseTab(result.data.assertionResults.some((item) => !item.passed) ? "assertions" : "body");
  };
  const showHistory = async () => {
    setResponseTab("history");
    const result = await apiTestsService.listExecutions({ caseId: request.id, limit: 20 });
    if (result.ok) setHistory(result.data.items);
  };

  return <div className="overflow-hidden rounded-lg border border-border/80 bg-bg-card shadow-sm">
    <div className="h-11 px-3 flex items-center gap-3 border-b border-border/50 bg-bg-card/60">
      <span className="shrink-0 text-xs text-text-tertiary">接口 {index + 1}</span>
      <input className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none" value={request.name} onChange={(event) => patch({ name: event.target.value })} placeholder="接口名称" />
      <button title="删除接口" disabled={!canRemove} className="w-8 h-8 flex items-center justify-center rounded text-text-tertiary hover:bg-danger/10 hover:text-danger disabled:opacity-30" onClick={onRemove}><Trash2 className="w-4 h-4" /></button>
    </div>
    <div className="p-3 flex items-stretch gap-2 border-b border-border/40">
      <select className="w-28 shrink-0 rounded border border-border/60 bg-bg-elevated px-2 text-xs font-bold outline-none" value={request.method} onChange={(event) => patch({ method: event.target.value as PerformanceCustomRequest["method"] })}>{["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((method) => <option key={method} value={method}>{method}</option>)}</select>
      <input className="h-10 min-w-0 flex-1 rounded border border-border/60 bg-bg-elevated px-3 font-mono text-xs outline-none focus:border-accent" value={request.url} onChange={(event) => patch({ url: event.target.value })} placeholder="https://api.example.com/users 或 {{baseUrl}}/users" />
      <button className="btn-primary shrink-0 !px-3" disabled={running} onClick={() => void runRequest()}>{running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}<span className="hidden sm:inline">测试请求</span></button>
    </div>
    <div className="flex items-center gap-1 px-3 border-b border-border/50 overflow-x-auto">
      {requestTabs.map((tab) => <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`h-10 px-3 text-xs whitespace-nowrap border-b-2 ${activeTab === tab.id ? "border-accent text-accent" : "border-transparent text-text-tertiary hover:text-text"}`}>{tab.label}{"count" in tab && tab.count > 0 && <span className="ml-1.5 rounded bg-bg-elevated px-1.5 text-[10px]">{tab.count}</span>}</button>)}
    </div>
    <div className="min-h-48 text-xs">
      {activeTab === "params" && <KeyValueRows items={request.queryParams} onChange={(queryParams) => patch({ queryParams })} keyPlaceholder="参数名称" valuePlaceholder="参数值" />}
      {activeTab === "headers" && <KeyValueRows items={request.headers} onChange={(headers) => patch({ headers })} keyPlaceholder="Header 名称" valuePlaceholder="Header 值" />}
      {activeTab === "body" && <div className="min-h-48 flex flex-col"><div className="h-10 flex items-center gap-1 px-3 border-b border-border/30">{(["none", "json", "text", "form"] as const).map((type) => <button key={type} onClick={() => patch({ bodyType: type })} className={`rounded px-2 py-1 text-[11px] ${request.bodyType === type ? "bg-accent/15 text-accent" : "text-text-tertiary hover:text-text"}`}>{type === "form" ? "x-www-form-urlencoded" : type}</button>)}</div>{request.bodyType === "none" ? <div className="flex-1 flex items-center justify-center text-text-tertiary">当前请求不发送 Body</div> : <textarea className="min-h-40 flex-1 resize-y bg-transparent p-3 font-mono text-xs outline-none" value={request.body} onChange={(event) => patch({ body: event.target.value })} placeholder={request.bodyType === "json" ? '{\n  "name": "{{username}}"\n}' : request.bodyType === "form" ? "name={{name}}&enabled=true" : "输入请求体"} />}</div>}
      {activeTab === "assertions" && <div className="min-h-48 overflow-auto"><div className="min-w-[760px]"><div className="grid grid-cols-[130px_1fr_140px_1fr_38px] border-b border-border/50 bg-bg-elevated/50 text-[11px] text-text-tertiary"><span className="px-3 py-2">断言对象</span><span className="px-3 py-2 border-l border-border/30">目标</span><span className="px-3 py-2 border-l border-border/30">条件</span><span className="px-3 py-2 border-l border-border/30">期望值</span><span /></div>{request.assertions.map((assertion, assertionIndex) => {
        const noTarget = assertion.source === "status" || assertion.source === "body";
        const noExpected = assertion.operator === "exists" || assertion.operator === "not_exists";
        return <div key={assertion.id} className="grid grid-cols-[130px_1fr_140px_1fr_38px] min-h-11 border-b border-border/30"><select className="bg-transparent px-2 outline-none" value={assertion.source} onChange={(event) => updateAssertion(assertionIndex, { source: event.target.value as ApiAssertion["source"], target: "" })}>{Object.entries(assertionSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input className="min-w-0 bg-transparent border-l border-border/30 px-2 outline-none disabled:opacity-40" disabled={noTarget} value={assertion.target} onChange={(event) => updateAssertion(assertionIndex, { target: event.target.value })} placeholder={assertion.source === "json" ? "data.id 或 $.data.id" : assertion.source === "header" ? "Content-Type" : "无需填写"} /><select className="bg-transparent border-l border-border/30 px-2 outline-none" value={assertion.operator} onChange={(event) => updateAssertion(assertionIndex, { operator: event.target.value as ApiAssertion["operator"] })}>{Object.entries(assertionOperatorLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input className="min-w-0 bg-transparent border-l border-border/30 px-2 font-mono text-xs outline-none disabled:opacity-40" disabled={noExpected} value={assertion.expected} onChange={(event) => updateAssertion(assertionIndex, { expected: event.target.value })} placeholder={noExpected ? "无需填写" : "期望值"} /><button title="删除断言" className="flex items-center justify-center text-text-tertiary hover:text-danger" onClick={() => patch({ assertions: request.assertions.filter((_, itemIndex) => itemIndex !== assertionIndex) })}><Trash2 className="w-3.5 h-3.5" /></button></div>;
      })}<button className="h-10 px-3 flex items-center gap-1.5 text-xs text-text-tertiary hover:text-accent" onClick={() => patch({ assertions: [...request.assertions, createAssertion()] })}><Plus className="w-3.5 h-3.5" />添加断言</button></div></div>}
      {activeTab === "variables" && <div className="min-h-48 overflow-auto"><div className="min-w-[520px]"><div className="grid grid-cols-[1fr_1fr_38px] border-b border-border/50 bg-bg-elevated/50 text-[11px] text-text-tertiary"><span className="px-3 py-2">变量名</span><span className="px-3 py-2 border-l border-border/30">变量值</span><span /></div>{Object.entries(request.variables).map(([key, value], variableIndex) => <div key={`${key}-${variableIndex}`} className="grid grid-cols-[1fr_1fr_38px] min-h-11 border-b border-border/30"><input className="min-w-0 bg-transparent px-3 outline-none" value={key} onChange={(event) => { const entries = Object.entries(request.variables); entries[variableIndex] = [event.target.value, value]; patch({ variables: Object.fromEntries(entries) }); }} /><input className="min-w-0 bg-transparent border-l border-border/30 px-3 font-mono text-xs outline-none" value={value} onChange={(event) => patch({ variables: { ...request.variables, [key]: event.target.value } })} /><button title="删除变量" className="flex items-center justify-center text-text-tertiary hover:text-danger" onClick={() => { const variables = { ...request.variables }; delete variables[key]; patch({ variables }); }}><Trash2 className="w-3.5 h-3.5" /></button></div>)}<button className="h-10 px-3 flex items-center gap-1.5 text-xs text-text-tertiary hover:text-accent" onClick={() => { let key = "variable"; let suffix = 1; while (key in request.variables) key = `variable${++suffix}`; patch({ variables: { ...request.variables, [key]: "" } }); }}><Plus className="w-3.5 h-3.5" />添加变量</button><p className="px-3 pb-3 text-[11px] text-text-tertiary">可在 URL、Params、Headers、Body 和断言中使用 {"{{变量名}}"}</p></div></div>}
    </div>
    <div className="border-t border-border/60 bg-bg-elevated/30">
      <div className="h-10 flex items-center justify-between gap-3 px-3 border-b border-border/50 bg-bg-card/40">
        <div className="h-full flex items-center overflow-x-auto">
          {(["body", "headers", "assertions"] as const).map((tab) => <button key={tab} onClick={() => setResponseTab(tab)} className={`h-full px-3 whitespace-nowrap border-b-2 text-xs ${responseTab === tab ? "border-accent text-accent" : "border-transparent text-text-tertiary"}`}>{tab === "body" ? "响应 Body" : tab === "headers" ? "响应 Headers" : "断言结果"}</button>)}
          <button onClick={() => void showHistory()} className={`h-full px-3 whitespace-nowrap border-b-2 text-xs ${responseTab === "history" ? "border-accent text-accent" : "border-transparent text-text-tertiary"}`}>执行历史</button>
        </div>
        {response && <div className="hidden sm:flex shrink-0 items-center gap-3 text-[11px]"><span className={response.status === "success" ? "text-success" : "text-danger"}>{response.statusCode ? `HTTP ${response.statusCode}` : response.status.toUpperCase()}</span><span className="text-text-tertiary">{response.duration} ms</span><span className="text-text-tertiary">{formatBytes(response.responseSize)}</span></div>}
      </div>
      <div className="h-44 overflow-auto">
        {runError && <div className="m-3 rounded border border-danger/40 bg-danger/10 p-3 text-xs text-danger"><AlertCircle className="w-4 h-4 inline mr-2" />{runError}</div>}
        {!runError && !response && responseTab !== "history" && <div className="h-full flex flex-col items-center justify-center text-text-tertiary"><Send className="w-6 h-6 mb-2 opacity-30" /><span className="text-xs">点击测试请求后查看响应</span></div>}
        {response && responseTab === "body" && (response.errorMessage ? <div className="m-3 rounded border border-danger/40 bg-danger/10 p-3 text-xs text-danger">{response.errorMessage}</div> : <pre className="p-4 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-text-secondary">{(() => { try { return JSON.stringify(JSON.parse(response.responseBody), null, 2); } catch { return response.responseBody; } })()}</pre>)}
        {response && responseTab === "headers" && <div className="min-w-[520px]">{Object.entries(response.responseHeaders).map(([key, value]) => <div key={key} className="grid grid-cols-[190px_1fr] border-b border-border/30 text-xs"><span className="px-3 py-2 text-text-tertiary">{key}</span><code className="px-3 py-2 border-l border-border/30 break-all">{value}</code></div>)}</div>}
        {response && responseTab === "assertions" && <div>{response.assertionResults.length === 0 ? <div className="p-6 text-center text-xs text-text-tertiary">未配置断言</div> : response.assertionResults.map((result) => <div key={result.id} className="flex items-start gap-3 px-4 py-3 border-b border-border/30">{result.passed ? <CheckCircle2 className="w-4 h-4 text-success mt-0.5" /> : <XCircle className="w-4 h-4 text-danger mt-0.5" />}<div className="min-w-0"><div className="text-xs">{assertionSourceLabels[result.source]} · {assertionOperatorLabels[result.operator]} <span className="font-mono">{result.expected}</span></div><div className="text-[11px] text-text-tertiary mt-1 break-all">实际值：{result.actual}</div></div></div>)}</div>}
        {responseTab === "history" && <div>{history.length === 0 ? <div className="p-6 text-center text-xs text-text-tertiary">暂无执行历史</div> : history.map((item) => <button key={item.id} onClick={() => { setResponse(item); setResponseTab("body"); }} className="w-full grid grid-cols-[24px_1fr_72px_86px] items-center gap-2 px-3 py-2.5 border-b border-border/30 text-left hover:bg-bg-elevated/30">{item.status === "success" ? <CheckCircle2 className="w-4 h-4 text-success" /> : item.status === "failed" ? <XCircle className="w-4 h-4 text-danger" /> : <AlertCircle className="w-4 h-4 text-warning" />}<span className="truncate text-xs"><span className="mr-2 font-bold">{item.method}</span>{item.url}</span><span className="text-[11px] text-text-tertiary">{item.duration} ms</span><span className="text-right text-[10px] text-text-tertiary">{new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}</span></button>)}</div>}
      </div>
    </div>
  </div>;
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${Math.round(seconds % 60)} 秒`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "--";
}

function targetSummary(scenario: PerformanceScenario) {
  if (scenario.targetType === "collection") return `集合：${scenario.collectionPath}`;
  if (scenario.targetType === "custom") return `${scenario.customRequests?.length || 0} 条手动接口`;
  return `${scenario.targetIds.length} 个接口用例`;
}

function MetricCard({ label, value, hint, icon: Icon, tone = "accent" }: {
  label: string; value: string; hint?: string; icon: typeof Activity; tone?: "accent" | "success" | "warning" | "danger";
}) {
  const toneClass = { accent: "text-accent bg-accent/10", success: "text-success bg-success/10", warning: "text-warning bg-warning/10", danger: "text-danger bg-danger/10" }[tone];
  return (
    <div className="card p-4 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div><div className="text-xs text-text-tertiary">{label}</div><div className="text-2xl font-semibold mt-2 tabular-nums truncate">{value}</div></div>
        <div className={`p-2 rounded-lg ${toneClass}`}><Icon className="w-4 h-4" /></div>
      </div>
      {hint && <div className="text-xs text-text-tertiary mt-2 truncate">{hint}</div>}
    </div>
  );
}

function TrendChart({ metrics }: { metrics: PerformanceMetric[] }) {
  const width = 900;
  const height = 230;
  const pad = 30;
  const points = metrics.slice(-120);
  const maxRps = Math.max(1, ...points.map((item) => item.rps));
  const maxP95 = Math.max(1, ...points.map((item) => item.p95ResponseTime));
  const path = (values: number[], max: number) => values.map((value, index) => {
    const x = pad + (index / Math.max(values.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - (value / max) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div><div className="font-medium">实时趋势</div><div className="text-xs text-text-tertiary mt-1">最近 120 秒，每秒聚合</div></div>
        <div className="flex gap-4 text-xs"><span className="text-accent">● RPS（峰值 {maxRps.toFixed(0)}）</span><span className="text-warning">● P95（峰值 {maxP95.toFixed(0)}ms）</span></div>
      </div>
      {points.length === 0 ? (
        <div className="h-56 flex items-center justify-center text-sm text-text-tertiary">等待性能数据...</div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56" preserveAspectRatio="none">
          {[0, 1, 2, 3, 4].map((line) => {
            const y = pad + line * ((height - pad * 2) / 4);
            return <line key={line} x1={pad} y1={y} x2={width - pad} y2={y} stroke="currentColor" className="text-border/60" strokeWidth="1" />;
          })}
          <polyline points={path(points.map((item) => item.rps), maxRps)} fill="none" stroke="#3B82F6" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          <polyline points={path(points.map((item) => item.p95ResponseTime), maxP95)} fill="none" stroke="#F59E0B" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}

function RunOverview({ run, onCancel }: { run?: PerformanceRun; onCancel?: () => void }) {
  if (!run) return <div className="h-full flex items-center justify-center text-text-tertiary">请选择一条执行记录，或从场景管理发起压测</div>;
  const latest = run.metrics?.at(-1);
  const successRate = run.totalRequests ? (run.successfulRequests / run.totalRequests) * 100 : 0;
  const config = run.config || {};
  const isRunning = run.status === "running" || run.status === "pending";
  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><h2 className="text-lg font-semibold">{run.scenarioName}</h2><span className={`tag ${statusMeta[run.status].className}`}>{isRunning && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}{statusMeta[run.status].label}</span></div>
        <div className="text-xs text-text-tertiary mt-2">开始：{formatDate(run.startedAt)} · 并发 {config.concurrency || "--"} · {config.executionMode === "samples" ? `目标 ${config.sampleCount || 0} 次请求` : `持续 ${config.durationSeconds || "--"} 秒`} · {config.caseCount || 0} 个接口{config.useProxyPool ? ` · IP池 ${config.proxyCount || 0} 个` : ""}</div>
        </div>
        {isRunning && onCancel && <button className="btn-danger" onClick={onCancel}><Square className="w-4 h-4" />停止测试</button>}
      </div>

      {run.errorMessage && <div className="rounded-lg border border-danger/30 bg-danger/10 text-danger px-4 py-3 text-sm">{run.errorMessage}</div>}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <MetricCard label="活跃用户" value={String(latest?.activeUsers ?? (isRunning ? config.concurrency || 0 : 0))} hint={`目标并发 ${config.concurrency || 0}`} icon={Users} />
        <MetricCard label="TPS / RPS" value={run.requestsPerSecond.toFixed(2)} hint={`总请求 ${run.totalRequests}`} icon={Gauge} tone="success" />
        <MetricCard label="平均响应" value={`${run.avgResponseTime.toFixed(0)} ms`} hint={`最小 ${run.minResponseTime.toFixed(0)} / 最大 ${run.maxResponseTime.toFixed(0)} ms`} icon={Clock3} tone="warning" />
        <MetricCard label="P95" value={`${run.p95ResponseTime.toFixed(0)} ms`} hint={`SLA ≤ ${config.p95ThresholdMs || 0} ms`} icon={Activity} tone={run.p95ResponseTime > Number(config.p95ThresholdMs || Infinity) ? "danger" : "accent"} />
        <MetricCard label="错误率" value={`${run.errorRate.toFixed(2)}%`} hint={`成功率 ${successRate.toFixed(2)}%`} icon={run.failedRequests ? XCircle : CheckCircle2} tone={run.failedRequests ? "danger" : "success"} />
      </div>

      <TrendChart metrics={run.metrics || []} />

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-4 lg:col-span-2">
          <div className="font-medium mb-4">响应时间百分位</div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {[["平均", run.avgResponseTime], ["P50", run.p50ResponseTime], ["P90", run.p90ResponseTime], ["P95", run.p95ResponseTime], ["P99", run.p99ResponseTime], ["最大", run.maxResponseTime]].map(([label, value]) => (
              <div key={String(label)} className="bg-bg-elevated rounded-lg p-3 text-center"><div className="text-xs text-text-tertiary">{label}</div><div className="font-medium mt-1 tabular-nums">{Number(value).toFixed(0)} ms</div></div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
            <div className="bg-success/10 rounded-lg p-3"><div className="text-text-tertiary text-xs">成功请求</div><div className="text-success text-lg mt-1">{run.successfulRequests}</div></div>
            <div className="bg-danger/10 rounded-lg p-3"><div className="text-text-tertiary text-xs">失败请求</div><div className="text-danger text-lg mt-1">{run.failedRequests}</div></div>
            <div className="bg-accent/10 rounded-lg p-3"><div className="text-text-tertiary text-xs">接收流量</div><div className="text-accent text-lg mt-1">{formatBytes(run.bytesReceived)}</div></div>
          </div>
        </div>
        <div className="card p-4">
          <div className="font-medium mb-3">状态码分布</div>
          <div className="space-y-2 max-h-48 overflow-auto">
            {Object.keys(run.statusCodes || {}).length === 0 && <div className="text-sm text-text-tertiary">暂无状态码</div>}
            {Object.entries(run.statusCodes || {}).sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => (
              <div key={code} className="flex items-center justify-between bg-bg-elevated rounded-lg px-3 py-2 text-sm"><span className={code.startsWith("2") ? "text-success" : code.startsWith("3") ? "text-accent" : "text-danger"}>HTTP {code}</span><span className="tabular-nums">{count}</span></div>
            ))}
          </div>
        </div>
      </div>

      {(run.errors || []).length > 0 && <div className="card p-4"><div className="font-medium mb-3">错误分布</div><div className="space-y-2">{(run.errors || []).map((error) => <div key={error.message} className="flex gap-3 justify-between rounded-lg bg-danger/5 border border-danger/15 px-3 py-2 text-sm"><span className="text-danger break-all">{error.message}</span><span className="shrink-0 tabular-nums">{error.count} 次</span></div>)}</div></div>}
    </div>
  );
}

function PerformanceReport({ run }: { run?: PerformanceRun }) {
  const [section, setSection] = useState<"summary" | "transactions" | "charts" | "errors">("summary");
  if (!run) return <div className="h-full flex items-center justify-center text-text-tertiary">请从左侧选择一份性能测试报告</div>;
  const config = run.config || {};
  const successRate = run.totalRequests ? (run.successfulRequests / run.totalRequests) * 100 : 0;
  const durationSeconds = Math.max(run.duration / 1000, 0.001);
  const receiveRate = run.bytesReceived / durationSeconds;
  const sentRate = run.bytesSent / durationSeconds;
  const slaResults = run.slaResults || [];
  const transactions = run.transactions || [];
  const passed = run.status === "success";
  const percentileItems = [
    { label: "P50", value: run.p50ResponseTime }, { label: "P90", value: run.p90ResponseTime },
    { label: "P95", value: run.p95ResponseTime }, { label: "P99", value: run.p99ResponseTime },
  ];
  const percentileMax = Math.max(1, ...percentileItems.map((item) => item.value));

  return (
    <div className="space-y-4 pb-8">
      <div className="card overflow-hidden">
        <div className="p-5 flex flex-wrap gap-4 items-start justify-between border-b border-border/60">
          <div className="flex gap-3">
            <div className="w-11 h-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center"><FileText className="w-5 h-5" /></div>
            <div><div className="text-xs text-text-tertiary mb-1">性能测试报告</div><h2 className="text-xl font-semibold">{run.scenarioName}</h2><div className="text-xs text-text-tertiary mt-2">报告编号：{run.id} · 生成时间：{formatDate(run.endedAt || run.createdAt)}</div></div>
          </div>
          <div className="flex items-center gap-2"><span className={`tag px-3 py-1.5 ${statusMeta[run.status].className}`}>{statusMeta[run.status].label}</span><button className="btn-secondary" onClick={() => window.print()}><Printer className="w-4 h-4" />打印 / 导出 PDF</button></div>
        </div>
        <div className={`p-4 flex flex-wrap items-center justify-between gap-3 ${passed ? "bg-success/10" : run.status === "cancelled" ? "bg-text-tertiary/10" : "bg-danger/10"}`}>
          <div className="flex items-center gap-3">{passed ? <ShieldCheck className="w-6 h-6 text-success" /> : <XCircle className="w-6 h-6 text-danger" />}<div><div className={`font-medium ${passed ? "text-success" : "text-danger"}`}>{passed ? "性能质量门禁通过" : run.status === "cancelled" ? "测试被手动取消" : "性能质量门禁未通过"}</div><div className="text-xs text-text-secondary mt-1">成功率 {successRate.toFixed(2)}%，P95 {run.p95ResponseTime.toFixed(0)} ms</div></div></div>
            <div className="text-xs text-text-secondary">压力模型：{config.concurrency || 0} 并发 / {config.executionMode === "samples" ? `${config.sampleCount || 0} 次请求` : `${config.durationSeconds || 0} 秒`} / {config.rampUpSeconds || 0} 秒升压{config.useProxyPool ? ` / IP池 ${config.proxyCount || 0} 个` : ""}</div>
        </div>
      </div>

      <div className="card px-3 flex items-center gap-1 overflow-x-auto sticky top-0 z-10 shadow-lg shadow-bg/40">
        {([["summary", Gauge, "报告概览"], ["transactions", Table2, "事务明细"], ["charts", Activity, "图表分析"], ["errors", XCircle, `错误分析${run.failedRequests ? ` (${run.failedRequests})` : ""}`]] as const).map(([key, Icon, label]) => <button key={key} onClick={() => setSection(key)} className={`px-4 h-12 shrink-0 flex items-center gap-2 text-sm border-b-2 ${section === key ? "border-accent text-accent" : "border-transparent text-text-secondary hover:text-text"}`}><Icon className="w-4 h-4" />{label}</button>)}
      </div>

      {section === "summary" && <>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard label="总样本数" value={run.totalRequests.toLocaleString()} hint={`成功 ${run.successfulRequests} / 失败 ${run.failedRequests}`} icon={Target} />
          <MetricCard label="平均响应时间" value={`${run.avgResponseTime.toFixed(0)} ms`} hint={`P95 ${run.p95ResponseTime.toFixed(0)} ms`} icon={Clock3} tone="warning" />
          <MetricCard label="吞吐量" value={`${run.requestsPerSecond.toFixed(2)} /s`} hint={`接收 ${formatBytes(receiveRate)}/s`} icon={Zap} tone="success" />
          <MetricCard label="错误率" value={`${run.errorRate.toFixed(2)}%`} hint={`成功率 ${successRate.toFixed(2)}%`} icon={run.failedRequests ? XCircle : CheckCircle2} tone={run.failedRequests ? "danger" : "success"} />
        </div>

        <div className="grid xl:grid-cols-5 gap-4">
          <div className="card p-5 xl:col-span-3">
            <div className="flex items-center justify-between mb-4"><div><div className="font-medium">SLA 质量门禁</div><div className="text-xs text-text-tertiary mt-1">场景中设置的性能验收标准</div></div><span className={`tag ${slaResults.every((item) => item.passed) && slaResults.length ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>{slaResults.every((item) => item.passed) && slaResults.length ? "全部通过" : "存在未通过项"}</span></div>
            <div className="space-y-3">{slaResults.length === 0 && <div className="text-sm text-text-tertiary">旧报告没有 SLA 明细</div>}{slaResults.map((item) => <div key={item.id} className="rounded-lg bg-bg-elevated p-3 flex items-center justify-between gap-3"><div className="flex items-center gap-3">{item.passed ? <CheckCircle2 className="w-5 h-5 text-success" /> : <XCircle className="w-5 h-5 text-danger" />}<div><div className="text-sm font-medium">{item.name}</div><div className="text-xs text-text-tertiary mt-1">目标 {item.operator} {item.target}{item.unit}</div></div></div><div className={`text-lg font-semibold tabular-nums ${item.passed ? "text-success" : "text-danger"}`}>{item.actual}{item.unit}</div></div>)}</div>
          </div>
          <div className="card p-5 xl:col-span-2">
            <div className="font-medium mb-4">场景配置</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">{[["接口数量", `${config.caseCount || transactions.length} 个`], ["并发用户", `${config.concurrency || 0}`], [config.executionMode === "samples" ? "目标样本数" : "持续时间", config.executionMode === "samples" ? `${config.sampleCount || 0} 次请求` : `${config.durationSeconds || 0} 秒`], ["升压时间", `${config.rampUpSeconds || 0} 秒`], ["请求超时", `${config.timeoutMs || 0} ms`], ["思考时间", `${config.thinkTimeMs || 0} ms`], ["IP池", config.useProxyPool ? `已开启（${config.proxyCount || 0} 个）` : "未开启"], ["实际耗时", formatDuration(run.duration)], ["接收/发送", `${formatBytes(run.bytesReceived)} / ${formatBytes(run.bytesSent)}`]].map(([label, value]) => <div key={label} className="border-b border-border/40 pb-2"><div className="text-xs text-text-tertiary">{label}</div><div className="mt-1 tabular-nums">{value}</div></div>)}</div>
          </div>
        </div>

        <div className="card p-5">
          <div className="font-medium mb-4">响应时间分位</div>
          <div className="space-y-3">{percentileItems.map((item) => <div key={item.label} className="grid grid-cols-[48px_minmax(0,1fr)_80px] gap-3 items-center text-sm"><span className="text-text-secondary">{item.label}</span><div className="h-3 bg-bg-elevated rounded-full overflow-hidden"><div className={`h-full rounded-full ${item.label === "P95" ? "bg-warning" : item.label === "P99" ? "bg-danger" : "bg-accent"}`} style={{ width: `${Math.max(1, (item.value / percentileMax) * 100)}%` }} /></div><span className="text-right tabular-nums">{item.value.toFixed(0)} ms</span></div>)}</div>
        </div>
      </>}

      {section === "transactions" && <div className="card overflow-hidden">
        <div className="p-5 border-b border-border/60"><div className="font-medium">聚合报告 / 事务明细</div><div className="text-xs text-text-tertiary mt-1">按接口统计样本、响应时间、错误率和吞吐量</div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1320px] text-xs"><thead className="bg-bg-elevated text-text-secondary"><tr>{["请求名称", "样本数", "平均", "最小", "最大", "P50", "P90", "P95", "P99", "错误率", "吞吐量", "接收 KB/s", "发送 KB/s"].map((label) => <th key={label} className={`px-3 py-3 font-medium ${label === "请求名称" ? "text-left sticky left-0 bg-bg-elevated z-10" : "text-right"}`}>{label}</th>)}</tr></thead><tbody className="divide-y divide-border/40">{transactions.length === 0 && <tr><td colSpan={13} className="p-10 text-center text-text-tertiary">旧报告没有接口级事务明细</td></tr>}{transactions.map((item) => <tr key={item.caseId} className="hover:bg-bg-elevated/50"><td className="px-3 py-3 sticky left-0 bg-bg-card"><div className="flex items-center gap-2"><span className="tag bg-accent/10 text-accent">{item.method}</span><div className="max-w-64"><div className="font-medium text-sm truncate">{item.caseName}</div><div className="text-[10px] text-text-tertiary truncate mt-1" title={item.url}>{item.url}</div></div></div></td>{[item.totalRequests, item.avgResponseTime.toFixed(0), item.minResponseTime.toFixed(0), item.maxResponseTime.toFixed(0), item.p50ResponseTime.toFixed(0), item.p90ResponseTime.toFixed(0), item.p95ResponseTime.toFixed(0), item.p99ResponseTime.toFixed(0)].map((value, index) => <td key={index} className="px-3 py-3 text-right tabular-nums">{value}{index > 0 ? " ms" : ""}</td>)}<td className={`px-3 py-3 text-right tabular-nums ${item.errorRate ? "text-danger" : "text-success"}`}>{item.errorRate.toFixed(2)}%</td><td className="px-3 py-3 text-right tabular-nums">{item.requestsPerSecond.toFixed(2)}/s</td><td className="px-3 py-3 text-right tabular-nums">{(item.bytesReceived / 1024 / durationSeconds).toFixed(2)}</td><td className="px-3 py-3 text-right tabular-nums">{(item.bytesSent / 1024 / durationSeconds).toFixed(2)}</td></tr>)}
          {transactions.length > 0 && <tr className="bg-accent/5 font-medium"><td className="px-3 py-3 sticky left-0 bg-bg-elevated">合计</td><td className="px-3 py-3 text-right">{run.totalRequests}</td><td className="px-3 py-3 text-right">{run.avgResponseTime.toFixed(0)} ms</td><td className="px-3 py-3 text-right">{run.minResponseTime.toFixed(0)} ms</td><td className="px-3 py-3 text-right">{run.maxResponseTime.toFixed(0)} ms</td><td className="px-3 py-3 text-right">{run.p50ResponseTime.toFixed(0)} ms</td><td className="px-3 py-3 text-right">{run.p90ResponseTime.toFixed(0)} ms</td><td className="px-3 py-3 text-right">{run.p95ResponseTime.toFixed(0)} ms</td><td className="px-3 py-3 text-right">{run.p99ResponseTime.toFixed(0)} ms</td><td className="px-3 py-3 text-right">{run.errorRate.toFixed(2)}%</td><td className="px-3 py-3 text-right">{run.requestsPerSecond.toFixed(2)}/s</td><td className="px-3 py-3 text-right">{(receiveRate / 1024).toFixed(2)}</td><td className="px-3 py-3 text-right">{(sentRate / 1024).toFixed(2)}</td></tr>}
        </tbody></table></div>
      </div>}

      {section === "charts" && <div className="space-y-4"><TrendChart metrics={run.metrics || []} /><div className="grid xl:grid-cols-2 gap-4"><div className="card p-5"><div className="font-medium mb-4">每秒吞吐量</div><div className="space-y-2 max-h-80 overflow-auto">{(run.metrics || []).map((item) => <div key={item.timestamp} className="grid grid-cols-[70px_minmax(0,1fr)_80px] gap-3 items-center text-xs"><span className="text-text-tertiary">第 {item.elapsedSeconds}s</span><div className="h-2 bg-bg-elevated rounded-full overflow-hidden"><div className="h-full bg-success rounded-full" style={{ width: `${Math.max(1, item.rps / Math.max(1, ...(run.metrics || []).map((metric) => metric.rps)) * 100)}%` }} /></div><span className="text-right">{item.rps.toFixed(0)} req/s</span></div>)}</div></div><div className="card p-5"><div className="font-medium mb-4">流量汇总</div><div className="grid grid-cols-2 gap-3"><div className="bg-bg-elevated rounded-lg p-4"><div className="text-xs text-text-tertiary">接收流量</div><div className="text-xl mt-2 text-accent">{formatBytes(run.bytesReceived)}</div><div className="text-xs text-text-tertiary mt-1">{formatBytes(receiveRate)}/s</div></div><div className="bg-bg-elevated rounded-lg p-4"><div className="text-xs text-text-tertiary">发送流量</div><div className="text-xl mt-2 text-warning">{formatBytes(run.bytesSent)}</div><div className="text-xs text-text-tertiary mt-1">{formatBytes(sentRate)}/s</div></div></div></div></div></div>}

      {section === "errors" && <div className="grid xl:grid-cols-2 gap-4"><div className="card p-5"><div className="font-medium mb-4">错误类型统计</div>{(run.errors || []).length === 0 ? <div className="py-14 text-center"><CheckCircle2 className="w-9 h-9 text-success mx-auto mb-3" /><div className="text-success">本次测试没有请求错误</div></div> : <div className="space-y-2">{(run.errors || []).map((error) => <div key={error.message} className="rounded-lg border border-danger/20 bg-danger/5 p-3 flex justify-between gap-4"><span className="text-sm text-danger break-all">{error.message}</span><span className="shrink-0 text-sm tabular-nums">{error.count} 次</span></div>)}</div>}</div><div className="card p-5"><div className="font-medium mb-4">HTTP 状态码</div><div className="space-y-2">{Object.keys(run.statusCodes || {}).length === 0 && <div className="text-sm text-text-tertiary">暂无状态码数据</div>}{Object.entries(run.statusCodes || {}).map(([code, count]) => <div key={code} className="flex items-center justify-between rounded-lg bg-bg-elevated px-4 py-3"><span className={code.startsWith("2") ? "text-success" : code.startsWith("3") ? "text-accent" : "text-danger"}>HTTP {code}</span><span className="tabular-nums">{count} 次</span></div>)}</div></div></div>}
    </div>
  );
}

export default function PerformanceTesting() {
  const [tab, setTab] = useState<Tab>("scenarios");
  const [scenarios, setScenarios] = useState<PerformanceScenario[]>([]);
  const [cases, setCases] = useState<ApiTestCase[]>([]);
  const [collections, setCollections] = useState<ApiCollectionSummary[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentItem[]>([]);
  const [runs, setRuns] = useState<PerformanceRun[]>([]);
  const [draft, setDraft] = useState<Partial<PerformanceScenario>>(emptyScenario());
  const [editingId, setEditingId] = useState<string>("");
  const [currentRun, setCurrentRun] = useState<PerformanceRun>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingProxyPool, setCheckingProxyPool] = useState(false);
  const [proxyPoolStatus, setProxyPoolStatus] = useState<{ available: boolean; count: number; message: string }>();
  const [copyingScenarioId, setCopyingScenarioId] = useState("");
  const [scenarioPendingDelete, setScenarioPendingDelete] = useState<PerformanceScenario>();
  const [deletingScenario, setDeletingScenario] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();

  const groupedCases = useMemo(() => {
    const groups = new Map<string, ApiTestCase[]>();
    for (const item of cases) {
      const group = item.group || "未分组";
      groups.set(group, [...(groups.get(group) || []), item]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-CN"));
  }, [cases]);

  const notifyTimerRef = useRef<number | undefined>(undefined);
  const notify = (text: string, error = false) => {
    setMessage({ text, error });
    // 新消息先清掉旧定时器，避免互相覆盖提前消失；卸载时统一清理
    window.clearTimeout(notifyTimerRef.current);
    notifyTimerRef.current = window.setTimeout(() => setMessage(undefined), 3500);
  };

  useEffect(() => () => window.clearTimeout(notifyTimerRef.current), []);

  // 报告列表只含标量字段，选中后按需拉取详情（metrics/transactions 等重字段）
  const openRunDetail = async (id: string) => {
    const result = await performanceTestsService.getRun(id);
    if (result.ok && result.data) setCurrentRun((current) => (current?.id === id ? result.data : current));
  };

  const loadData = async () => {
    setLoading(true);
    const [scenarioResult, caseResult, collectionResult, environmentResult, runResult] = await Promise.all([
      performanceTestsService.listScenarios(), apiTestsService.listCases(), apiTestsService.listCollections(), environmentsService.list({ scope: "api" }), performanceTestsService.listRuns({ limit: 100 }),
    ]);
    if (scenarioResult.ok) setScenarios(scenarioResult.data.items);
    if (caseResult.ok) setCases(caseResult.data.items);
    if (collectionResult.ok) setCollections(collectionResult.data.items);
    if (environmentResult.ok) setEnvironments(environmentResult.data.items);
    if (runResult.ok) {
      setRuns(runResult.data.items);
      const running = runResult.data.items.find((item) => item.status === "running" || item.status === "pending");
      const fallback = running || runResult.data.items[0];
      setCurrentRun((previous) => previous || fallback);
      // 列表数据只含标量字段，默认选中的运行若已结束则补拉详情（metrics/transactions 等重字段）
      if (fallback && !["pending", "running"].includes(fallback.status)) void openRunDetail(fallback.id);
    }
    const failed = [scenarioResult, caseResult, collectionResult, environmentResult, runResult].find((result) => !result.ok);
    if (failed) notify(failed.error || "加载性能测试数据失败", true);
    setLoading(false);
  };

  useEffect(() => { void loadData(); }, []);

  const progressFetchingRef = useRef(false);
  useEffect(() => {
    if (!currentRun || !["pending", "running"].includes(currentRun.status)) return;
    const timer = window.setInterval(async () => {
      if (progressFetchingRef.current) return; // in-flight 守卫：上次请求未完成则跳过本轮
      progressFetchingRef.current = true;
      try {
        const result = await performanceTestsService.getProgress(currentRun.id);
        if (!result.ok) return;
        setCurrentRun(result.data);
        setRuns((items) => items.some((item) => item.id === result.data.id) ? items.map((item) => item.id === result.data.id ? result.data : item) : [result.data, ...items]);
      } finally {
        progressFetchingRef.current = false;
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [currentRun?.id, currentRun?.status]);

  const selectScenario = (scenario: PerformanceScenario) => {
    setEditingId(scenario.id);
    setDraft({ ...scenario, targetIds: [...scenario.targetIds], customRequests: (scenario.customRequests || []).map((item) => normalizeCustomRequest(item as PerformanceCustomRequest & { headersText?: string })) });
    setTab("scenarios");
    setProxyPoolStatus(undefined);
    window.setTimeout(() => {
      document.getElementById("performance-scenario-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("performance-scenario-name")?.focus({ preventScroll: true });
    }, 0);
    notify("已进入编辑模式");
  };

  const createNew = () => { setEditingId(""); setDraft(emptyScenario()); setProxyPoolStatus(undefined); };

  const toggleProxyPool = async () => {
    if (draft.useProxyPool) {
      setDraft((current) => ({ ...current, useProxyPool: false }));
      setProxyPoolStatus(undefined);
      return;
    }
    setCheckingProxyPool(true);
    const result = await performanceTestsService.checkProxyPool();
    setCheckingProxyPool(false);
    if (!result.ok || !result.data.available) {
      const message = result.ok ? result.data.message : (result.error || "IP池检测失败");
      setProxyPoolStatus({ available: false, count: 0, message });
      notify(message, true);
      return;
    }
    setDraft((current) => ({ ...current, useProxyPool: true }));
    setProxyPoolStatus(result.data);
    notify(`IP池已开启，当前可轮换 ${result.data.count} 个代理 IP`);
  };

  const saveScenario = async () => {
    setSaving(true);
    const result = editingId ? await performanceTestsService.updateScenario(editingId, draft) : await performanceTestsService.createScenario(draft);
    setSaving(false);
    if (!result.ok) { notify(result.error || "保存失败", true); return; }
    notify("性能场景已保存");
    setEditingId(result.data.id);
    setDraft(result.data);
    setScenarios((items) => editingId ? items.map((item) => item.id === result.data.id ? result.data : item) : [result.data, ...items]);
  };

  const removeScenario = async (scenario: PerformanceScenario) => {
    setDeletingScenario(true);
    try {
      const result = await performanceTestsService.removeScenario(scenario.id);
      if (!result.ok) { notify(result.error || "删除失败", true); return; }
      setScenarios((items) => items.filter((item) => item.id !== scenario.id));
      setRuns((items) => items.filter((item) => item.scenarioId !== scenario.id));
      if (currentRun?.scenarioId === scenario.id) setCurrentRun(undefined);
      if (editingId === scenario.id) createNew();
      setScenarioPendingDelete(undefined);
      notify("场景已删除");
    } finally {
      setDeletingScenario(false);
    }
  };

  const startRun = async (scenario: PerformanceScenario) => {
    const result = await performanceTestsService.startRun(scenario.id);
    if (!result.ok) { notify(result.error || "启动性能测试失败", true); return; }
    setCurrentRun(result.data);
    setRuns((items) => [result.data, ...items.filter((item) => item.id !== result.data.id)]);
    setTab("monitor");
    notify("性能测试已启动");
  };

  const cancelRun = async () => {
    if (!currentRun || !await confirmAction({ title: "停止性能测试？", message: "当前性能测试将停止。", detail: "已经产生的数据仍会保存为报告。", confirmLabel: "确认停止", danger: false })) return;
    const result = await performanceTestsService.cancelRun(currentRun.id);
    if (!result.ok) notify(result.error || "停止失败", true);
    else notify("正在停止性能测试");
  };

  const removeRun = async (run: PerformanceRun) => {
    if (!await confirmAction({ title: "删除性能测试报告？", message: `即将删除“${run.scenarioName}”的这份报告。`, detail: "此操作无法恢复。", confirmLabel: "确认删除" })) return;
    const result = await performanceTestsService.removeRun(run.id);
    if (!result.ok) { notify(result.error || "删除报告失败", true); return; }
    setRuns((items) => items.filter((item) => item.id !== run.id));
    if (currentRun?.id === run.id) setCurrentRun(undefined);
    notify("测试报告已删除");
  };

  const toggleCase = (id: string) => {
    const ids = draft.targetIds || [];
    setDraft({ ...draft, targetIds: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id] });
  };

  const copyScenario = async (scenario: PerformanceScenario) => {
    setCopyingScenarioId(scenario.id);
    const copy: Partial<PerformanceScenario> = {
      ...scenario,
      id: undefined,
      name: `${scenario.name} - 副本`,
      targetIds: [...scenario.targetIds],
      customRequests: (scenario.customRequests || []).map((item) => ({
        ...normalizeCustomRequest(item as PerformanceCustomRequest & { headersText?: string }),
        id: createCustomRequest().id,
      })),
    };
    try {
      const result = await performanceTestsService.createScenario(copy);
      if (!result.ok) { notify(result.error || "复制失败", true); return; }
      setScenarios((items) => [result.data, ...items]);
      selectScenario(result.data);
      notify("场景副本已创建并保存");
    } finally {
      setCopyingScenarioId("");
    }
  };

  return (
    <div className="h-screen flex flex-col bg-bg overflow-hidden">
      <header className="h-16 shrink-0 border-b border-border/60 px-5 flex items-center justify-between bg-bg-card/80">
        <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center"><Gauge className="w-5 h-5" /></div><div><h1 className="font-semibold">性能测试</h1><p className="text-xs text-text-tertiary">场景配置、实时监控与结果分析</p></div></div>
        <button className="btn-secondary" onClick={() => void loadData()} disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />刷新</button>
      </header>

      <div className="h-12 shrink-0 border-b border-border/60 bg-bg-card px-1 sm:px-5 flex items-end gap-1">
        {([
          ["scenarios", Layers3, "场景管理"], ["monitor", Activity, "执行监控"], ["reports", BarChart3, "测试报告"],
        ] as const).map(([key, Icon, label]) => <button key={key} onClick={() => setTab(key)} className={`h-12 flex-1 sm:flex-none px-2 sm:px-5 flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm border-b-2 transition-colors ${tab === key ? "border-accent text-accent" : "border-transparent text-text-secondary hover:text-text"}`}><Icon className="w-4 h-4 shrink-0" />{label}{key === "monitor" && currentRun && ["pending", "running"].includes(currentRun.status) && <span className="w-2 h-2 rounded-full bg-success animate-pulse" />}</button>)}
      </div>

      {message && <div className={`fixed right-5 top-20 z-50 rounded-lg border px-4 py-3 text-sm shadow-xl ${message.error ? "bg-danger/15 border-danger/30 text-danger" : "bg-success/15 border-success/30 text-success"}`}>{message.text}</div>}

      {scenarioPendingDelete && <div className="fixed inset-0 z-[60] bg-slate-950/35 backdrop-blur-[1px] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-scenario-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletingScenario) setScenarioPendingDelete(undefined); }}>
        <div className="w-full max-w-md rounded-2xl border border-border bg-bg-card p-5 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 shrink-0 rounded-full bg-danger/10 text-danger flex items-center justify-center"><AlertTriangle className="w-5 h-5" /></div>
            <div className="min-w-0"><h3 id="delete-scenario-title" className="font-semibold text-base">确认删除性能场景？</h3><p className="text-sm text-text-secondary mt-2 break-all">即将删除“{scenarioPendingDelete.name}”。</p><p className="text-xs text-danger mt-2">场景及其全部历史报告会被删除，且无法恢复。</p></div>
          </div>
          <div className="mt-6 flex justify-end gap-2"><button className="btn-secondary" disabled={deletingScenario} onClick={() => setScenarioPendingDelete(undefined)}>取消</button><button className="btn-primary bg-danger hover:bg-danger/90 border-danger" disabled={deletingScenario} onClick={() => void removeScenario(scenarioPendingDelete)}>{deletingScenario ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}确认删除</button></div>
        </div>
      </div>}

      <main className="flex-1 min-h-0 overflow-hidden">
        {tab === "scenarios" && (
          <div className="h-full flex flex-col md:grid md:grid-cols-[340px_minmax(0,1fr)]">
            <aside className="h-56 md:h-auto shrink-0 border-b md:border-b-0 md:border-r border-border/60 bg-bg-card/40 min-h-0 flex flex-col">
              <div className="p-3 border-b border-border/60"><button className="btn-primary w-full" onClick={createNew}><Plus className="w-4 h-4" />新建性能场景</button></div>
              <div className="flex-1 overflow-auto p-3 space-y-2">
                {loading && <div className="p-8 text-center text-text-tertiary"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />加载中</div>}
                {!loading && scenarios.length === 0 && <div className="p-8 text-center text-sm text-text-tertiary">还没有性能场景</div>}
                {scenarios.map((scenario) => (
                  <div key={scenario.id} onClick={() => selectScenario(scenario)} className={`group rounded-xl border p-3 cursor-pointer transition-colors ${editingId === scenario.id ? "border-accent/60 bg-accent/10" : "border-border/50 bg-bg-card hover:border-border"}`}>
                    <div className="flex items-start gap-2"><div className="flex-1 min-w-0"><div className="font-medium text-sm truncate">{scenario.name}</div><div className="text-xs text-text-tertiary mt-1 truncate">{targetSummary(scenario)}</div></div><ChevronRight className="w-4 h-4 text-text-tertiary mt-1" /></div>
                    <div className="flex items-center justify-between mt-3"><div className="flex gap-2 text-[11px] text-text-secondary"><span>{scenario.concurrency} 并发</span><span>·</span><span>{scenario.executionMode === "samples" ? `${scenario.sampleCount} 次` : `${scenario.durationSeconds} 秒`}</span>{scenario.useProxyPool && <><span>·</span><span className="text-warning">IP池</span></>}</div><div className="flex gap-1"><button title="编辑场景" aria-label={`编辑场景 ${scenario.name}`} className="w-8 h-8 flex items-center justify-center text-accent hover:bg-accent/10 rounded" onClick={(event) => { event.stopPropagation(); selectScenario(scenario); }}><Pencil className="w-3.5 h-3.5" /></button><button title="复制并保存副本" aria-label={`复制场景 ${scenario.name}`} disabled={copyingScenarioId === scenario.id} className="w-8 h-8 flex items-center justify-center hover:bg-bg-elevated rounded disabled:opacity-50" onClick={(event) => { event.stopPropagation(); void copyScenario(scenario); }}>{copyingScenarioId === scenario.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}</button><button title="删除场景" aria-label={`删除场景 ${scenario.name}`} className="w-8 h-8 flex items-center justify-center hover:bg-danger/10 text-danger rounded" onClick={(event) => { event.stopPropagation(); setScenarioPendingDelete(scenario); }}><Trash2 className="w-3.5 h-3.5" /></button></div></div>
                    <button className="btn-primary w-full mt-3 py-1.5" onClick={(event) => { event.stopPropagation(); void startRun(scenario); }}><Play className="w-3.5 h-3.5" />开始压测</button>
                  </div>
                ))}
              </div>
            </aside>

            <section id="performance-scenario-editor" className="min-w-0 flex-1 overflow-auto p-3 sm:p-5">
              <div className="max-w-5xl mx-auto space-y-4">
                <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">{editingId ? "编辑性能场景" : "新建性能场景"}</h2><p className="text-xs text-text-tertiary mt-1">配置压力模型、流量来源和服务质量目标</p></div><button className="btn-primary" onClick={() => void saveScenario()} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}保存场景</button></div>
                <div className="card p-5 space-y-4">
                  <div className="font-medium">基本信息</div>
                  <div className="grid md:grid-cols-2 gap-4"><label className="text-sm">场景名称<span className="text-danger"> *</span><input id="performance-scenario-name" className="input mt-2" value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="例如：登录接口峰值压测" /></label><label className="text-sm">接口测试环境<select className="input mt-2" value={draft.environmentId || ""} onChange={(e) => setDraft({ ...draft, environmentId: e.target.value })}><option value="">不使用环境（接口必须为完整 URL）</option>{environments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
                  <label className="text-sm block">场景说明<textarea className="input mt-2 min-h-20 resize-y" value={draft.description || ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="说明压测目的、预期流量或注意事项" /></label>
                </div>

                <div className="card p-5 space-y-4">
                  <div><div className="font-medium">压测目标</div><div className="text-xs text-text-tertiary mt-1">可选择已保存的接口，也可以直接手动填写请求</div></div>
                  <div className="grid md:grid-cols-3 gap-3">
                    <button className={`rounded-lg border p-3 text-left ${draft.targetType === "cases" ? "border-accent bg-accent/10" : "border-border bg-bg-elevated"}`} onClick={() => setDraft({ ...draft, targetType: "cases" })}><div className="font-medium text-sm">选择接口用例</div><div className="text-xs text-text-tertiary mt-1">按顺序循环执行选中的接口</div></button>
                    <button className={`rounded-lg border p-3 text-left ${draft.targetType === "collection" ? "border-accent bg-accent/10" : "border-border bg-bg-elevated"}`} onClick={() => setDraft({ ...draft, targetType: "collection" })}><div className="font-medium text-sm">选择接口集合</div><div className="text-xs text-text-tertiary mt-1">自动包含集合及子文件夹内的接口</div></button>
                    <button className={`rounded-lg border p-3 text-left ${draft.targetType === "custom" ? "border-accent bg-accent/10" : "border-border bg-bg-elevated"}`} onClick={() => setDraft({ ...draft, targetType: "custom", customRequests: draft.customRequests?.length ? draft.customRequests : [createCustomRequest()] })}><div className="font-medium text-sm">手动填写接口</div><div className="text-xs text-text-tertiary mt-1">直接配置方法、URL、请求头和请求体</div></button>
                  </div>
                  {draft.targetType === "cases" && <div className="max-h-72 overflow-auto rounded-lg border border-border/60 divide-y divide-border/40">{groupedCases.map(([group, items]) => <div key={group} className="p-3"><div className="text-xs text-text-tertiary mb-2">{group}</div><div className="grid md:grid-cols-2 gap-2">{items.map((item) => <label key={item.id} className="flex items-center gap-2 rounded-lg bg-bg-elevated p-2.5 text-sm cursor-pointer hover:bg-border/60"><input type="checkbox" className="accent-accent" checked={(draft.targetIds || []).includes(item.id)} onChange={() => toggleCase(item.id)} /><span className="tag bg-accent/10 text-accent">{item.method}</span><span className="truncate">{item.name}</span></label>)}</div></div>)}</div>}
                  {draft.targetType === "collection" && <select className="input" value={draft.collectionPath || ""} onChange={(e) => setDraft({ ...draft, collectionPath: e.target.value })}><option value="">请选择接口集合</option>{collections.map((item) => <option key={item.path} value={item.path}>{item.path}（{item.total}）</option>)}</select>}
                  {draft.targetType === "custom" && <div className="space-y-3">
                    {(draft.customRequests || []).map((request, index) => <PerformanceRequestEditor
                      key={request.id}
                      request={normalizeCustomRequest(request as PerformanceCustomRequest & { headersText?: string })}
                      index={index}
                      canRemove={(draft.customRequests || []).length > 1}
                      environmentId={draft.environmentId || ""}
                      timeoutMs={Number(draft.timeoutMs) || 30000}
                      onChange={(nextRequest) => setDraft({ ...draft, customRequests: (draft.customRequests || []).map((item, itemIndex) => itemIndex === index ? nextRequest : item) })}
                      onRemove={() => setDraft({ ...draft, customRequests: (draft.customRequests || []).filter((_, itemIndex) => itemIndex !== index) })}
                    />)}
                    <button className="btn-secondary" onClick={() => setDraft({ ...draft, customRequests: [...(draft.customRequests || []), createCustomRequest()] })}><Plus className="w-4 h-4" />添加接口</button>
                  </div>}
                </div>

                <div className="card p-5 space-y-4">
                  <div><div className="font-medium">压力模型</div><div className="text-xs text-text-tertiary mt-1">可按持续时间运行，也可指定准确的总请求次数</div></div>
                  <div className="inline-flex rounded-lg border border-border/70 bg-bg-elevated p-1">
                    <button className={`px-3 py-1.5 rounded-md text-xs ${draft.executionMode === "samples" ? "bg-bg-card text-accent shadow-sm" : "text-text-secondary"}`} onClick={() => setDraft({ ...draft, executionMode: "samples" })}>按请求次数</button>
                    <button className={`px-3 py-1.5 rounded-md text-xs flex items-center gap-1.5 ${draft.executionMode !== "samples" ? "bg-bg-card text-warning shadow-sm" : "text-text-secondary"}`} onClick={() => setDraft({ ...draft, executionMode: "duration" })}>按持续时间<AlertTriangle className="w-3.5 h-3.5 text-warning" /><span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">高风险</span></button>
                  </div>
                  {draft.executionMode !== "samples" && <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs text-warning"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><div><div className="font-medium">慎重使用按持续时间模式</div><div className="mt-1 text-text-secondary">该模式会在设定时间内持续高频发送请求，极有可能造成接口超频、触发限流或增加服务压力。</div></div></div>}
                  <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
                    {[{ key: "concurrency", label: "并发用户", min: 1, max: 500, suffix: "人" }, draft.executionMode === "samples" ? { key: "sampleCount", label: "测试样本数（请求次数）", min: 1, max: 1000000, suffix: "次" } : { key: "durationSeconds", label: "持续时间", min: 1, max: 3600, suffix: "秒" }, { key: "rampUpSeconds", label: "升压时间", min: 0, max: 3600, suffix: "秒" }, { key: "timeoutMs", label: "请求超时", min: 100, max: 120000, suffix: "毫秒" }, { key: "thinkTimeMs", label: "思考时间", min: 0, max: 60000, suffix: "毫秒" }].map((field) => <label key={field.key} className="text-sm">{field.label}<div className="relative mt-2"><input type="number" min={field.min} max={field.max} className="input pr-12" value={Number(draft[field.key as keyof PerformanceScenario] || 0)} onChange={(e) => setDraft({ ...draft, [field.key]: Number(e.target.value) })} /><span className="absolute right-3 top-2.5 text-xs text-text-tertiary">{field.suffix}</span></div></label>)}
                  </div>
                  <div className={`rounded-lg border p-3 ${draft.useProxyPool ? "border-warning/40 bg-warning/10" : "border-border/60 bg-bg-elevated/40"}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0"><div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className={`h-4 w-4 ${draft.useProxyPool ? "text-warning" : "text-text-tertiary"}`} />IP 池</div><div className="mt-1 text-xs text-text-tertiary">开启后，每次请求会轮换使用 proxy.scdn.io 提供的代理 IP</div></div>
                      <button type="button" role="switch" aria-checked={Boolean(draft.useProxyPool)} aria-label="是否开启IP池" disabled={checkingProxyPool} onClick={() => void toggleProxyPool()} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${draft.useProxyPool ? "bg-warning" : "bg-border"}`}><span className={`absolute left-0 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${draft.useProxyPool ? "translate-x-6" : "translate-x-1"}`} /></button>
                    </div>
                    {checkingProxyPool && <div className="mt-2 flex items-center gap-1.5 text-xs text-accent"><Loader2 className="h-3.5 w-3.5 animate-spin" />正在检查代理池和代理连通性...</div>}
                    {!checkingProxyPool && proxyPoolStatus && <div className={`mt-2 text-xs ${proxyPoolStatus.available ? "text-success" : "text-danger"}`}>{proxyPoolStatus.available ? `IP池可用：${proxyPoolStatus.count} 个代理可轮换` : proxyPoolStatus.message}</div>}
                    {draft.useProxyPool && <div className="mt-3 flex items-start gap-2 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>公共代理可能记录请求地址、请求头和明文内容。请勿对携带 Token、密码、密钥或生产数据的接口开启 IP 池。</span></div>}
                  </div>
                </div>

                <div className="card p-5 space-y-4">
                  <div><div className="font-medium">SLA 服务质量目标</div><div className="text-xs text-text-tertiary mt-1">执行完成后同时满足以下条件，报告才会判定为通过</div></div>
                  <div className="grid md:grid-cols-2 gap-4"><label className="text-sm">最低成功率<div className="relative mt-2"><input type="number" min="0" max="100" className="input pr-10" value={draft.successRateThreshold || 0} onChange={(e) => setDraft({ ...draft, successRateThreshold: Number(e.target.value) })} /><span className="absolute right-3 top-2.5 text-xs text-text-tertiary">%</span></div></label><label className="text-sm">P95 最大响应时间<div className="relative mt-2"><input type="number" min="1" max="120000" className="input pr-14" value={draft.p95ThresholdMs || 0} onChange={(e) => setDraft({ ...draft, p95ThresholdMs: Number(e.target.value) })} /><span className="absolute right-3 top-2.5 text-xs text-text-tertiary">毫秒</span></div></label></div>
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === "monitor" && <div className="h-full overflow-auto p-5"><div className="max-w-7xl mx-auto"><RunOverview run={currentRun} onCancel={() => void cancelRun()} /></div></div>}

        {tab === "reports" && (
          <div className="h-full flex flex-col md:grid md:grid-cols-[420px_minmax(0,1fr)]">
            <aside className="h-64 md:h-auto shrink-0 border-b md:border-b-0 md:border-r border-border/60 overflow-auto bg-bg-card/30">
              <div className="sticky top-0 bg-bg-card border-b border-border/60 p-4 z-10"><div className="font-medium">历史测试报告</div><div className="text-xs text-text-tertiary mt-1">共 {runs.length} 条记录</div></div>
              <div className="p-3 space-y-2">{runs.length === 0 && <div className="p-8 text-center text-sm text-text-tertiary">暂无性能测试报告</div>}{runs.map((run) => <div key={run.id} onClick={() => { setCurrentRun(run); if (!["pending", "running"].includes(run.status)) void openRunDetail(run.id); }} className={`group rounded-xl border p-3 cursor-pointer ${currentRun?.id === run.id ? "border-accent/60 bg-accent/10" : "border-border/50 bg-bg-card hover:border-border"}`}><div className="flex items-start gap-2"><div className="flex-1 min-w-0"><div className="font-medium text-sm truncate">{run.scenarioName}</div><div className="text-xs text-text-tertiary mt-1">{formatDate(run.createdAt)}</div></div><span className={`tag ${statusMeta[run.status].className}`}>{statusMeta[run.status].label}</span></div><div className="grid grid-cols-3 gap-2 mt-3 text-xs"><div><div className="text-text-tertiary">RPS</div><div className="mt-1">{run.requestsPerSecond.toFixed(1)}</div></div><div><div className="text-text-tertiary">P95</div><div className="mt-1">{run.p95ResponseTime.toFixed(0)} ms</div></div><div><div className="text-text-tertiary">错误率</div><div className="mt-1">{run.errorRate.toFixed(2)}%</div></div></div><div className="flex items-center justify-between mt-3 text-xs text-text-tertiary"><span>{formatDuration(run.duration)} · {run.totalRequests} 请求</span>{!["pending", "running"].includes(run.status) && <button title="删除报告" className="w-8 h-8 flex items-center justify-center text-danger hover:bg-danger/10 rounded" onClick={(e) => { e.stopPropagation(); void removeRun(run); }}><Trash2 className="w-3.5 h-3.5" /></button>}</div></div>)}</div>
            </aside>
            <section className="min-w-0 flex-1 overflow-auto p-3 sm:p-5"><PerformanceReport run={currentRun} /></section>
          </div>
        )}
      </main>
    </div>
  );
}

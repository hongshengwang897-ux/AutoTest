import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Braces,
  CheckCircle,
  Clock,
  FileCode,
  Gauge,
  MonitorCheck,
  PlayCircle,
  Send,
  Server,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import {
  apiTestsService,
  casesService,
  environmentsService,
  performanceTestsService,
  statsService,
} from "@/api/services";
import type {
  ApiCollectionRun,
  ApiTestCase,
  ApiTestExecution,
  DashboardStats,
  EnvironmentItem,
  PerformanceRun,
  PerformanceScenario,
} from "@/api/services";

type DashboardModule = "ui" | "api" | "performance";

/* ─── Chart helpers ─── */

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}

const chartTooltip = ((props: ChartTooltipProps): ReactNode => {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-bg-elevated p-3 text-xs shadow-lg">
      <p className="mb-2 font-medium text-text">{label}</p>
      {payload.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
          <span className="text-text-tertiary">{item.name}:</span>
          <span className="font-medium text-text">{item.value}</span>
        </div>
      ))}
    </div>
  );
}) as any;

const CHART_COLORS = {
  blue: "#3b82f6",
  blueLight: "#60a5fa",
  green: "#22c55e",
  red: "#ef4444",
  amber: "#f59e0b",
  violet: "#8b5cf6",
  orange: "#f97316",
  muted: "#6b7280",
};

/* ─── Execution trend chart (UI module) ─── */

interface ExecutionTrendChartProps {
  trends: DashboardStats["trends"];
  color: string;
  colorLight: string;
  colorRed: string;
  colorGreen: string;
}

function ExecutionTrendChart({ trends, color, colorLight, colorRed, colorGreen }: ExecutionTrendChartProps) {
  const data = useMemo(() =>
    trends.slice(-14).map((item) => ({
      date: item.date,
      总计: item.total,
      通过: item.passed,
      失败: item.failed,
    })),
    [trends]
  );

  if (data.length === 0) return null;

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold">执行趋势（近 14 天）</h3>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
          <Tooltip content={chartTooltip} />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
          <Area type="monotone" dataKey="总计" name="总计" stroke={color} fill={colorLight} fillOpacity={0.15} strokeWidth={2} stackId="1" />
          <Area type="monotone" dataKey="通过" name="通过" stroke={colorGreen} fill={colorGreen} fillOpacity={0.1} strokeWidth={2} stackId="1" />
          <Area type="monotone" dataKey="失败" name="失败" stroke={colorRed} fill={colorRed} fillOpacity={0.1} strokeWidth={2} stackId="1" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Status distribution donut chart (API module) ─── */

interface StatusDistributionChartProps {
  data: { name: string; value: number; color: string }[];
  total: number;
}

function StatusDistributionChart({ data, total }: StatusDistributionChartProps) {
  if (data.length === 0 || total === 0) return null;

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-semibold">执行状态分布</h3>
        </div>
        <span className="text-xs text-text-tertiary">共 {total} 条</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="40%"
            cy="50%"
            innerRadius={48}
            outerRadius={72}
            paddingAngle={2}
            dataKey="value"
            label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
            labelLine={false}
          >
            {data.map((_, index) => <Cell key={index} fill={data[index].color} />)}
          </Pie>
          <Tooltip content={chartTooltip} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Performance metrics bar chart ─── */

interface PerfMetricsChartProps {
  runs: PerformanceRun[];
}

function PerfMetricsChart({ runs }: PerfMetricsChartProps) {
  const data = useMemo(() =>
    runs.slice(-8).map((run) => ({
      场景: (run.scenarioName || "").slice(0, 8),
      "平均响应": Math.round(safeNum(run.avgResponseTime)),
      "P95": Math.round(safeNum(run.p95ResponseTime)),
      "RPS": Math.round(safeNum(run.requestsPerSecond) * 10) / 10,
    })),
    [runs]
  );

  if (data.length === 0) return null;

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-semibold">性能指标对比（最近 8 次）</h3>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
          <XAxis dataKey="场景" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
          <Tooltip content={chartTooltip} />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
          <Bar yAxisId="left" dataKey="平均响应" name="平均响应 (ms)" fill={CHART_COLORS.orange} radius={3} barSize={14} />
          <Bar yAxisId="left" dataKey="P95" name="P95 (ms)" fill={CHART_COLORS.red} radius={3} barSize={14} />
          <Bar yAxisId="right" dataKey="RPS" name="RPS" fill={CHART_COLORS.blue} radius={3} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function calcTodayPassRate(trends: DashboardStats["trends"]): number {
  for (let index = trends.length - 1; index >= 0; index -= 1) {
    const item = trends[index];
    if (item.total > 0) return Math.round((item.passed / item.total) * 100);
  }
  return 0;
}

function formatTime(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

/** 数值安全兜底：字段缺失/非法（undefined、null、NaN 等）时回落到 0，避免击穿整页 */
function safeNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 数值安全格式化：保留 digits 位小数 */
function fmtNum(value: unknown, digits = 0): string {
  return safeNum(value).toFixed(digits);
}

interface ModuleOption {
  key: DashboardModule;
  label: string;
  description: string;
  icon: LucideIcon;
  activeClass: string;
  iconClass: string;
}

const moduleOptions: ModuleOption[] = [
  { key: "ui", label: "UI 自动化", description: "浏览器用例", icon: MonitorCheck, activeClass: "border-blue-500 text-blue-500 bg-blue-500/10", iconClass: "text-blue-500" },
  { key: "api", label: "接口测试", description: "请求与集合", icon: Braces, activeClass: "border-violet-500 text-violet-500 bg-violet-500/10", iconClass: "text-violet-500" },
  { key: "performance", label: "性能测试", description: "压测与指标", icon: Gauge, activeClass: "border-orange-500 text-orange-500 bg-orange-500/10", iconClass: "text-orange-500" },
];

function ModuleSwitcher({ active, onChange }: { active: DashboardModule; onChange: (module: DashboardModule) => void }) {
  return (
    <ul className="flex max-w-full gap-1 overflow-x-auto border-b border-border/60" role="tablist" aria-label="Dashboard 模块">
      {moduleOptions.map((option) => {
        const Icon = option.icon;
        const selected = option.key === active;
        return (
          <li key={option.key} className="shrink-0">
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(option.key)}
              className={`flex min-w-40 items-center gap-3 border-b-2 px-4 py-3 text-left transition-colors ${selected ? option.activeClass : "border-transparent text-text-secondary hover:bg-bg-elevated/60 hover:text-text"}`}
            >
              <Icon className={`h-5 w-5 ${selected ? "" : option.iconClass}`} />
              <span>
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-0.5 block text-[11px] text-text-tertiary">{option.description}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ─── UI Dashboard ─── */

interface UiDashboardProps {
  stats: DashboardStats;
  caseGroups: Record<string, number>;
  environments: EnvironmentItem[];
}

function UiDashboard({ stats, caseGroups, environments }: UiDashboardProps) {
  const totalCases = Object.keys(caseGroups).length > 0
    ? Object.values(caseGroups).reduce((total, count) => total + count, 0)
    : stats.totalCases;
  const passRate = stats.totalExecutions > 0 ? stats.passRate : calcTodayPassRate(stats.trends);
  const latestFailed = [...stats.trends].reverse().find((item) => item.total > 0)?.failed || 0;
  const latest = stats.recentExecutions[0];
  const platformEnvironments = environments.filter((environment) => environment.scope !== "api");
  const latestMetrics: { label: string; value: ReactNode }[] = latest ? [
    { label: "状态", value: <StatusBadge status={latest.status} size="sm" /> },
    { label: "耗时", value: latest.duration ? `${(latest.duration / 1000).toFixed(1)}s` : "-" },
    { label: "结束时间", value: formatTime(latest.endTime) },
    { label: "今日执行", value: stats.todayExecutions },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard title="UI 用例" value={totalCases} icon={FileCode} accentColor="accent" />
        <StatCard title="执行记录" value={stats.totalExecutions} icon={PlayCircle} accentColor="warning" />
        <StatCard title="通过率" value={`${passRate}%`} icon={CheckCircle} accentColor="success" />
        <StatCard title="今日失败" value={latestFailed} icon={AlertTriangle} accentColor="danger" />
      </div>

      <ExecutionTrendChart
        trends={stats.trends}
        color={CHART_COLORS.blue}
        colorLight={CHART_COLORS.blueLight}
        colorRed={CHART_COLORS.red}
        colorGreen={CHART_COLORS.green}
      />

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MonitorCheck className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold">最新执行概览</h3>
          </div>
          <Link to="/execution?type=ui" className="text-xs text-blue-500 hover:opacity-70">
            查看全部 →
          </Link>
        </div>
        {!latest ? (
          <p className="py-8 text-center text-xs text-text-tertiary">执行 UI 自动化用例后显示指标</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))]">
            <div className="rounded-lg bg-bg-elevated/60 p-4">
              <div className="text-xs text-text-tertiary">用例</div>
              <div className="mt-1 truncate text-sm font-semibold">{latest.caseName}</div>
              <div className="mt-3 text-xs text-text-tertiary">{formatTime(latest.startTime)}</div>
            </div>
            {latestMetrics.map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-bg-elevated/60 p-4">
                <div className="text-[11px] text-text-tertiary">{label}</div>
                <div className="mt-1 text-sm font-semibold">{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card min-w-0 overflow-hidden p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-semibold">最近 UI 自动化执行</h3>
          </div>
          <Link to="/execution?type=ui" className="text-xs text-blue-500 hover:opacity-70">
            查看全部 →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-text-tertiary">
                <th className="px-3 py-2 font-medium">用例</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 text-right font-medium">耗时</th>
                <th className="px-3 py-2 text-right font-medium">开始时间</th>
                <th className="px-3 py-2 text-right font-medium">结束时间</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentExecutions.slice(0, 8).map((execution) => (
                <tr key={execution.id} className="border-b border-border/30 last:border-0">
                  <td className="max-w-64 truncate px-3 py-3 font-medium">
                    <Link to={`/reports/${execution.id}`} className="transition-colors hover:text-blue-500">
                      {execution.caseName}
                    </Link>
                  </td>
                  <td className="px-3 py-3"><StatusBadge status={execution.status} size="sm" /></td>
                  <td className="px-3 py-3 text-right text-text-secondary">{execution.duration ? `${(execution.duration / 1000).toFixed(1)}s` : "-"}</td>
                  <td className="px-3 py-3 text-right text-xs text-text-tertiary">{formatTime(execution.startTime)}</td>
                  <td className="px-3 py-3 text-right text-xs text-text-tertiary">{formatTime(execution.endTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.recentExecutions.length === 0 && <div className="py-12 text-center text-sm text-text-tertiary">暂无 UI 自动化执行记录</div>}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><FileCode className="h-4 w-4 text-blue-500" /><h3 className="text-sm font-semibold">用例分组</h3></div><Link to="/cases" className="text-xs text-blue-500 hover:opacity-70">管理 →</Link></div>
          <div className="grid gap-3 md:grid-cols-2">
            {Object.keys(caseGroups).length === 0 && <p className="py-4 text-center text-xs text-text-tertiary">暂无用例</p>}
            {Object.entries(caseGroups).slice(0, 8).map(([group, count]) => <div key={group} className="flex items-center justify-between rounded-lg bg-bg-elevated/50 px-3 py-2.5"><span className="min-w-0 truncate text-sm text-text-secondary">{group}</span><span className="ml-3 rounded bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500">{count}</span></div>)}
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><Server className="h-4 w-4 text-blue-500" /><h3 className="text-sm font-semibold">平台环境</h3></div><Link to="/environments" className="text-xs text-blue-500 hover:opacity-70">管理 →</Link></div>
          <div className="grid gap-3 md:grid-cols-2">
            {platformEnvironments.length === 0 && <p className="py-4 text-center text-xs text-text-tertiary">暂无平台环境</p>}
            {platformEnvironments.slice(0, 8).map((environment) => <div key={environment.id} className="rounded-lg border border-border/50 p-3"><div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-sm font-medium">{environment.name}</span><StatusBadge status={environment.status} size="sm" /></div><div className="mt-2 truncate text-xs text-text-tertiary">{environment.url || "（未设置）"}</div></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── API Dashboard ─── */

interface ApiDashboardProps {
  cases: ApiTestCase[];
  executions: ApiTestExecution[];
  collectionRuns: ApiCollectionRun[];
}

function ApiDashboard({ cases, executions, collectionRuns }: ApiDashboardProps) {
  const allRuns = executions.length + collectionRuns.length;
  const passed = executions.filter((item) => item.status === "success").length + collectionRuns.filter((item) => item.status === "success").length;
  const failed = executions.filter((item) => item.status !== "success").length + collectionRuns.filter((item) => item.status === "failed").length;
  const passRate = allRuns > 0 ? Math.round((passed / allRuns) * 100) : 0;

  const statusData = useMemo(() => {
    const items: { name: string; value: number; color: string }[] = [];
    if (passed > 0) items.push({ name: "通过", value: passed, color: CHART_COLORS.green });
    if (failed > 0) items.push({ name: "失败", value: failed, color: CHART_COLORS.red });
    return items;
  }, [passed, failed]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard title="接口用例" value={cases.length} icon={Braces} accentColor="accent" />
        <StatCard title="执行记录" value={allRuns} icon={Send} accentColor="warning" />
        <StatCard title="通过率" value={`${passRate}%`} icon={CheckCircle} accentColor="success" />
        <StatCard title="失败记录" value={failed} icon={AlertTriangle} accentColor="danger" />
      </div>

      <StatusDistributionChart data={statusData} total={allRuns} />

      <div className="card min-w-0 overflow-hidden p-5">
        <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><Send className="h-4 w-4 text-violet-500" /><h3 className="text-sm font-semibold">最近接口执行</h3></div><Link to="/execution?type=api" className="text-xs text-violet-500 hover:opacity-70">查看全部 →</Link></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-sm">
            <thead><tr className="border-b border-border/60 text-left text-xs text-text-tertiary"><th className="px-3 py-2 font-medium">接口</th><th className="px-3 py-2 font-medium">方法</th><th className="px-3 py-2 font-medium">状态</th><th className="px-3 py-2 text-right font-medium">响应</th><th className="px-3 py-2 text-right font-medium">执行时间</th></tr></thead>
            <tbody>{executions.slice(0, 8).map((execution) => <tr key={execution.id} className="border-b border-border/30 last:border-0"><td className="max-w-64 truncate px-3 py-3 font-medium">{execution.caseName}</td><td className="px-3 py-3"><span className="rounded bg-violet-500/10 px-2 py-1 text-xs font-medium text-violet-500">{execution.method}</span></td><td className="px-3 py-3"><StatusBadge status={execution.status} size="sm" /></td><td className="px-3 py-3 text-right text-text-secondary">{execution.duration} ms</td><td className="px-3 py-3 text-right text-xs text-text-tertiary">{formatTime(execution.createdAt)}</td></tr>)}</tbody>
          </table>
          {executions.length === 0 && <div className="py-12 text-center text-sm text-text-tertiary">暂无接口执行记录</div>}
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><Clock className="h-4 w-4 text-violet-500" /><h3 className="text-sm font-semibold">最近集合执行</h3></div><Link to="/reports?tab=api" className="text-xs text-violet-500 hover:opacity-70">查看报告 →</Link></div>
        {collectionRuns.length === 0 ? <p className="py-6 text-center text-xs text-text-tertiary">暂无集合执行记录</p> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{collectionRuns.slice(0, 6).map((run) => <div key={run.id} className="rounded-lg border border-border/50 p-3"><div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-sm font-medium">{run.collectionName}</span><StatusBadge status={run.status} size="sm" /></div><div className="mt-2 flex items-center justify-between text-xs text-text-tertiary"><span>通过 {run.passed}/{run.total}</span><span>{run.duration} ms</span></div></div>)}</div>}
      </div>
    </div>
  );
}

/* ─── Performance Dashboard ─── */

interface PerformanceDashboardProps {
  scenarios: PerformanceScenario[];
  runs: PerformanceRun[];
}

function PerformanceDashboard({ scenarios, runs }: PerformanceDashboardProps) {
  const totalRequests = runs.reduce((total, run) => total + safeNum(run.totalRequests), 0);
  const successfulRequests = runs.reduce((total, run) => total + safeNum(run.successfulRequests), 0);
  const successRate = totalRequests > 0 ? Math.round((successfulRequests / totalRequests) * 100) : 0;
  const running = runs.filter((run) => ["pending", "running"].includes(run.status)).length;
  const latest = runs[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard title="性能场景" value={scenarios.length} icon={Gauge} accentColor="accent" />
        <StatCard title="压测运行" value={runs.length} icon={PlayCircle} accentColor="warning" />
        <StatCard title="累计请求" value={totalRequests.toLocaleString("zh-CN")} icon={Send} accentColor="accent" />
        <StatCard title="请求成功率" value={`${successRate}%`} icon={CheckCircle} accentColor="success" />
      </div>

      <PerfMetricsChart runs={runs} />

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-semibold">最新运行指标</h3>
          </div>
          <Link to="/execution?type=performance" className="text-xs text-orange-500 hover:opacity-70">
            查看全部 →
          </Link>
        </div>
        {!latest ? (
          <p className="py-8 text-center text-xs text-text-tertiary">执行性能测试后显示指标</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))]">
            <div className="rounded-lg bg-bg-elevated/60 p-4">
              <div className="text-xs text-text-tertiary">场景</div>
              <div className="mt-1 truncate text-sm font-semibold">{latest.scenarioName}</div>
              <div className="mt-3 text-xs text-text-tertiary">{formatTime(latest.startedAt || latest.createdAt)}</div>
            </div>
            {[
              ["平均响应", `${fmtNum(latest.avgResponseTime)} ms`],
              ["P95", `${fmtNum(latest.p95ResponseTime)} ms`],
              ["吞吐量", `${fmtNum(latest.requestsPerSecond, 1)} RPS`],
              ["错误率", `${fmtNum(latest.errorRate, 2)}%`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-bg-elevated/60 p-4">
                <div className="text-[11px] text-text-tertiary">{label}</div>
                <div className="mt-1 text-sm font-semibold">{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card min-w-0 overflow-hidden p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-semibold">最近性能测试</h3>
            {running > 0 && <span className="rounded bg-warning/10 px-2 py-0.5 text-[10px] text-warning">{running} 个执行中</span>}
          </div>
          <Link to="/execution?type=performance" className="text-xs text-orange-500 hover:opacity-70">
            查看全部 →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-text-tertiary">
                <th className="px-3 py-2 font-medium">场景</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 text-right font-medium">请求数</th>
                <th className="px-3 py-2 text-right font-medium">RPS</th>
                <th className="px-3 py-2 text-right font-medium">P95</th>
                <th className="px-3 py-2 text-right font-medium">错误率</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 8).map((run) => (
                <tr key={run.id} className="border-b border-border/30 last:border-0">
                  <td className="max-w-60 truncate px-3 py-3 font-medium">{run.scenarioName}</td>
                  <td className="px-3 py-3"><StatusBadge status={run.status} size="sm" /></td>
                  <td className="px-3 py-3 text-right">{fmtNum(run.totalRequests)}</td>
                  <td className="px-3 py-3 text-right">{fmtNum(run.requestsPerSecond, 1)}</td>
                  <td className="px-3 py-3 text-right">{fmtNum(run.p95ResponseTime)} ms</td>
                  <td className={`px-3 py-3 text-right ${safeNum(run.errorRate) > 0 ? "text-danger" : "text-success"}`}>{fmtNum(run.errorRate, 2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {runs.length === 0 && <div className="py-12 text-center text-sm text-text-tertiary">暂无性能测试记录</div>}
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-orange-500" /><h3 className="text-sm font-semibold">性能场景</h3></div><Link to="/performance-testing" className="text-xs text-orange-500 hover:opacity-70">管理场景 →</Link></div>
        {scenarios.length === 0 ? <p className="py-6 text-center text-xs text-text-tertiary">暂无性能测试场景</p> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{scenarios.slice(0, 6).map((scenario) => <div key={scenario.id} className="rounded-lg border border-border/50 p-3"><div className="truncate text-sm font-medium">{scenario.name}</div><div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-text-tertiary"><span>并发 {fmtNum(scenario.concurrency)}</span><span>{scenario.executionMode === "samples" ? `${fmtNum(scenario.sampleCount)} 次` : `${fmtNum(scenario.durationSeconds)} 秒`}</span><span>P95 ≤ {fmtNum(scenario.p95ThresholdMs)}ms</span></div></div>)}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedModule = searchParams.get("type");
  const activeModule: DashboardModule = requestedModule === "api" || requestedModule === "performance" ? requestedModule : "ui";
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [caseGroups, setCaseGroups] = useState<Record<string, number>>({});
  const [environments, setEnvironments] = useState<EnvironmentItem[]>([]);
  const [apiCases, setApiCases] = useState<ApiTestCase[]>([]);
  const [apiExecutions, setApiExecutions] = useState<ApiTestExecution[]>([]);
  const [collectionRuns, setCollectionRuns] = useState<ApiCollectionRun[]>([]);
  const [performanceScenarios, setPerformanceScenarios] = useState<PerformanceScenario[]>([]);
  const [performanceRuns, setPerformanceRuns] = useState<PerformanceRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const results = await Promise.all([
        statsService.get(),
        casesService.list({ limit: 100 }),
        environmentsService.list(),
        apiTestsService.listCases(),
        apiTestsService.listExecutions({ limit: 100 }),
        apiTestsService.listCollectionRuns({ limit: 100 }),
        performanceTestsService.listScenarios(),
        performanceTestsService.listRuns({ limit: 100 }),
      ]);
      const [statsResult, casesResult, environmentsResult, apiCasesResult, apiExecutionsResult, collectionRunsResult, scenariosResult, performanceRunsResult] = results;
      if (statsResult.ok) setStats(statsResult.data);
      if (casesResult.ok) {
        const groups: Record<string, number> = {};
        casesResult.data.items.forEach((item) => {
          const group = item.group || "未分组";
          groups[group] = (groups[group] || 0) + 1;
        });
        setCaseGroups(groups);
      }
      if (environmentsResult.ok) setEnvironments(environmentsResult.data.items);
      if (apiCasesResult.ok) setApiCases(apiCasesResult.data.items);
      if (apiExecutionsResult.ok) setApiExecutions(apiExecutionsResult.data.items);
      if (collectionRunsResult.ok) setCollectionRuns(collectionRunsResult.data.items);
      if (scenariosResult.ok) setPerformanceScenarios(scenariosResult.data.items);
      if (performanceRunsResult.ok) setPerformanceRuns(performanceRunsResult.data.items);
      setLoading(false);
    }
    void load();
  }, []);

  if (loading || !stats) {
    return <div className="space-y-6 animate-fade-in"><div><h1 className="mb-1 text-xl font-bold text-text">Dashboard</h1><p className="text-sm text-text-tertiary">自动化测试运行总览</p></div><div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="card h-24 animate-pulse rounded-lg bg-bg-elevated/30 p-5" />)}</div></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div><h1 className="mb-1 text-xl font-bold text-text">Dashboard</h1><p className="text-sm text-text-tertiary">按测试模块查看运行数据</p></div>
      <ModuleSwitcher active={activeModule} onChange={(module) => setSearchParams({ type: module })} />
      <div role="tabpanel">
        {activeModule === "ui" && <UiDashboard stats={stats} caseGroups={caseGroups} environments={environments} />}
        {activeModule === "api" && <ApiDashboard cases={apiCases} executions={apiExecutions} collectionRuns={collectionRuns} />}
        {activeModule === "performance" && <PerformanceDashboard scenarios={performanceScenarios} runs={performanceRuns} />}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Braces, Clock, Edit2, ExternalLink, FolderTree, Loader2, Pause, Play, Plus, Save, Trash2, X } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { confirmAction } from "@/components/ConfirmDialog";
import { apiTestsService, casesService, environmentsService, schedulesService } from "@/api/services";
import type { ApiCollectionSummary, CaseItem, EnvironmentItem, ScheduleItem } from "@/api/services";

type ScheduleFrequency = "daily" | "weekly" | "interval" | "custom";

interface ScheduleTiming {
  frequency: ScheduleFrequency;
  time: string;
  weekdays: number[];
  intervalMinutes: number;
  customCron: string;
}

const weekdayLabels = [
  { value: 1, label: "周一" }, { value: 2, label: "周二" }, { value: 3, label: "周三" },
  { value: 4, label: "周四" }, { value: 5, label: "周五" }, { value: 6, label: "周六" },
  { value: 7, label: "周日" },
];

function defaultTiming(): ScheduleTiming {
  return { frequency: "daily", time: "08:00", weekdays: [1, 2, 3, 4, 5], intervalMinutes: 30, customCron: "" };
}

function parseWeekdays(value: string): number[] {
  const days = new Set<number>();
  for (const part of value.split(",")) {
    const range = part.match(/^(\d)-(\d)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let day = start; day <= end; day += 1) days.add(day === 0 ? 7 : day);
    } else if (/^\d$/.test(part)) {
      const day = Number(part);
      if (day >= 0 && day <= 7) days.add(day === 0 ? 7 : day);
    }
  }
  return [...days].sort((a, b) => a - b);
}

function cronToTiming(expression: string): ScheduleTiming {
  const parts = expression.trim().split(/\s+/);
  const fields = parts.length === 6 && parts[0] === "0" ? parts.slice(1) : parts;
  if (fields.length === 5) {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
    const interval = minute.match(/^\*\/(\d+)$/);
    if (interval && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return { ...defaultTiming(), frequency: "interval", intervalMinutes: Math.min(Math.max(Number(interval[1]), 1), 59) };
    }
    if (/^\d{1,2}$/.test(minute) && /^\d{1,2}$/.test(hour) && dayOfMonth === "*" && month === "*") {
      const time = `${String(Number(hour)).padStart(2, "0")}:${String(Number(minute)).padStart(2, "0")}`;
      if (dayOfWeek === "*") return { ...defaultTiming(), frequency: "daily", time };
      const weekdays = parseWeekdays(dayOfWeek);
      if (weekdays.length > 0) return { ...defaultTiming(), frequency: "weekly", time, weekdays };
    }
  }
  return { ...defaultTiming(), frequency: "custom", customCron: expression };
}

function timingToCron(timing: ScheduleTiming): string {
  if (timing.frequency === "custom") return timing.customCron;
  if (timing.frequency === "interval") return `*/${Math.min(Math.max(timing.intervalMinutes, 1), 59)} * * * *`;
  const [hour = "8", minute = "0"] = timing.time.split(":");
  if (timing.frequency === "weekly") {
    const days = timing.weekdays.map((day) => day === 7 ? 0 : day).sort((a, b) => a - b).join(",");
    return `${Number(minute)} ${Number(hour)} * * ${days}`;
  }
  return `${Number(minute)} ${Number(hour)} * * *`;
}

function timingDescription(expression: string): string {
  const timing = cronToTiming(expression);
  if (timing.frequency === "interval") return `每隔 ${timing.intervalMinutes} 分钟执行`;
  if (timing.frequency === "daily") return `每天 ${timing.time} 执行`;
  if (timing.frequency === "weekly") {
    const labels = timing.weekdays.map((day) => weekdayLabels.find((item) => item.value === day)?.label).filter(Boolean);
    return `${labels.join("、")} ${timing.time} 执行`;
  }
  return "使用原有自定义执行规则";
}

function empty(): ScheduleItem {
  return {
    id: "",
    name: "",
    cronExpression: "0 8 * * *",
    caseIds: [],
    environmentId: "",
    enabled: true,
    targetType: "platform",
    collectionPath: "",
  };
}

function normalizeSchedule(item: ScheduleItem): ScheduleItem {
  return { ...item, caseIds: item.caseIds || [], targetType: item.targetType || "platform", collectionPath: item.collectionPath || "" };
}

export default function Schedules() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [collections, setCollections] = useState<ApiCollectionSummary[]>([]);
  const [platformEnvs, setPlatformEnvs] = useState<EnvironmentItem[]>([]);
  const [apiEnvs, setApiEnvs] = useState<EnvironmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ScheduleItem>(empty());
  const [timing, setTiming] = useState<ScheduleTiming>(() => cronToTiming(empty().cronExpression));
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const prefillApplied = useRef(false);

  const load = useCallback(async () => {
    const [scheduleResult, caseResult, platformEnvResult, apiEnvResult, collectionResult] = await Promise.all([
      schedulesService.list(),
      casesService.list({ limit: 100 }),
      environmentsService.list({ scope: "platform" }),
      environmentsService.list({ scope: "api" }),
      apiTestsService.listCollections(),
    ]);
    if (scheduleResult.ok) setItems(scheduleResult.data.items.map(normalizeSchedule));
    if (caseResult.ok) setCases(caseResult.data.items);
    if (platformEnvResult.ok) setPlatformEnvs(platformEnvResult.data.items);
    if (apiEnvResult.ok) setApiEnvs(apiEnvResult.data.items);
    if (collectionResult.ok) setCollections(collectionResult.data.items);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (loading || prefillApplied.current || searchParams.get("type") !== "api") return;
    prefillApplied.current = true;
    const collectionPath = searchParams.get("collection") || "";
    setEditForm({
      ...empty(),
      targetType: "api_collection",
      collectionPath,
      name: collectionPath ? `${collectionPath} 接口回归` : "",
    });
    setTiming(cronToTiming(empty().cronExpression));
    setIsNew(true);
    setEditingId("__new__");
  }, [loading, searchParams]);

  const startEdit = (item?: ScheduleItem) => {
    if (item) {
      setEditForm({ ...normalizeSchedule(item), caseIds: [...(item.caseIds || [])] });
      setTiming(cronToTiming(item.cronExpression));
      setIsNew(false);
      setEditingId(item.id);
      return;
    }
    setEditForm(empty());
    setTiming(cronToTiming(empty().cronExpression));
    setIsNew(true);
    setEditingId("__new__");
  };

  const cancelEdit = () => { setEditingId(null); setIsNew(false); };
  const validTarget = editForm.targetType === "api_collection" ? Boolean(editForm.collectionPath) : editForm.caseIds.length > 0;
  const validTiming = timing.frequency !== "weekly" || timing.weekdays.length > 0;

  const updateTiming = (next: ScheduleTiming) => {
    setTiming(next);
    setEditForm((current) => ({ ...current, cronExpression: timingToCron(next) }));
  };

  const handleSave = async () => {
    if (!editForm.name.trim() || !validTarget || !validTiming) return;
    setSaving(true);
    setMessage(null);
    const result = isNew
      ? await schedulesService.create({ ...editForm, cronExpression: timingToCron(timing) })
      : await schedulesService.update(editForm.id, { ...editForm, cronExpression: timingToCron(timing) });
    setSaving(false);
    if (!result.ok) { setMessage({ type: "error", text: result.error || "保存失败" }); return; }
    const saved = normalizeSchedule(result.data);
    setItems((current) => isNew ? [saved, ...current] : current.map((item) => item.id === saved.id ? saved : item));
    cancelEdit();
    setMessage({ type: "success", text: "定时任务已保存" });
  };

  const handleDelete = async (id: string) => {
    if (!await confirmAction({ title: "删除定时任务？", message: "此定时任务会被永久删除。", confirmLabel: "确认删除" })) return;
    const result = await schedulesService.remove(id);
    if (!result.ok) { setMessage({ type: "error", text: result.error || "删除失败" }); return; }
    setItems((current) => current.filter((item) => item.id !== id));
    if (editingId === id) cancelEdit();
  };

  const handleToggle = async (item: ScheduleItem) => {
    const result = await schedulesService.toggle(item.id);
    if (result.ok) setItems((current) => current.map((entry) => entry.id === item.id ? normalizeSchedule(result.data) : entry));
    else setMessage({ type: "error", text: result.error || "状态更新失败" });
  };

  const handleRun = async (item: ScheduleItem) => {
    setRunningId(item.id);
    const result = await schedulesService.run(item.id);
    setRunningId(null);
    if (!result.ok) { setMessage({ type: "error", text: result.error || "任务执行失败" }); return; }
    const runTime = new Date().toISOString();
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, lastRunTime: runTime } : entry));
    setMessage({ type: "success", text: item.targetType === "api_collection" ? "集合已开始执行，可在报告中心查看进度" : "任务已加入执行队列" });
  };

  const toggleCase = (caseId: string) => {
    setEditForm((current) => ({
      ...current,
      caseIds: current.caseIds.includes(caseId) ? current.caseIds.filter((id) => id !== caseId) : [...current.caseIds, caseId],
    }));
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-text-tertiary"><Loader2 className="mr-2 h-5 w-5 animate-spin" />加载中...</div>;

  const editingEnvironments = editForm.targetType === "api_collection" ? apiEnvs : platformEnvs;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="mb-1 text-xl font-bold">定时任务</h1><p className="text-sm text-text-tertiary">定时执行平台用例或完整接口集合</p></div>
        <button className="btn-primary" onClick={() => startEdit()}><Plus className="h-4 w-4" />新建任务</button>
      </div>

      {message && <div className={`rounded border px-4 py-3 text-sm ${message.type === "success" ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"}`}>{message.text}</div>}

      {editingId && (
        <section className="border-y border-accent/30 bg-bg-card py-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">{isNew ? "新建定时任务" : "编辑定时任务"}</h2><button onClick={cancelEdit} className="flex h-8 w-8 items-center justify-center rounded hover:bg-bg-elevated" title="关闭"><X className="h-4 w-4" /></button></div>
          <div className="mb-4 inline-flex rounded border border-border/60 bg-bg-elevated p-0.5">
            <button type="button" onClick={() => setEditForm((current) => ({ ...current, targetType: "platform", collectionPath: "", environmentId: "" }))} className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs ${editForm.targetType === "platform" ? "bg-bg-card text-accent shadow" : "text-text-tertiary"}`}><Play className="h-3.5 w-3.5" />平台用例</button>
            <button type="button" onClick={() => setEditForm((current) => ({ ...current, targetType: "api_collection", caseIds: [], environmentId: "" }))} className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs ${editForm.targetType === "api_collection" ? "bg-bg-card text-accent shadow" : "text-text-tertiary"}`}><Braces className="h-3.5 w-3.5" />接口测试集合</button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block"><span className="mb-1 block text-xs text-text-tertiary">任务名称 *</span><input value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} className="input w-full" placeholder="每日接口回归" /></label>
            <label className="block"><span className="mb-1 block text-xs text-text-tertiary">执行环境</span><select value={editForm.environmentId} onChange={(event) => setEditForm((current) => ({ ...current, environmentId: event.target.value }))} className="input w-full"><option value="">不指定环境</option>{editingEnvironments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}</select></label>
            {editForm.targetType === "api_collection" && <label className="block"><span className="mb-1 block text-xs text-text-tertiary">接口集合 *</span><select value={editForm.collectionPath} onChange={(event) => setEditForm((current) => ({ ...current, collectionPath: event.target.value }))} className="input w-full"><option value="">选择集合</option>{collections.map((collection) => <option key={collection.path} value={collection.path}>{collection.path}（{collection.total} 个接口）</option>)}</select></label>}
            <div className={editForm.targetType === "api_collection" ? "" : "lg:col-span-2"}>
              <span className="mb-1 block text-xs text-text-tertiary">执行频率 *</span>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={timing.frequency}
                  onChange={(event) => updateTiming({ ...timing, frequency: event.target.value as ScheduleFrequency })}
                  className="input min-w-40"
                  aria-label="执行频率"
                >
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="interval">每隔几分钟</option>
                  {timing.frequency === "custom" && <option value="custom">原有自定义规则</option>}
                </select>
                {(timing.frequency === "daily" || timing.frequency === "weekly") && <><span className="text-xs text-text-tertiary">执行时间</span><input type="time" value={timing.time} onChange={(event) => updateTiming({ ...timing, time: event.target.value })} className="input w-36" aria-label="执行时间" /></>}
                {timing.frequency === "interval" && <><span className="text-xs text-text-tertiary">每隔</span><input type="number" min={1} max={59} value={timing.intervalMinutes} onChange={(event) => updateTiming({ ...timing, intervalMinutes: Math.min(Math.max(Number(event.target.value) || 1, 1), 59) })} className="input w-24" aria-label="间隔分钟数" /><span className="text-xs text-text-tertiary">分钟执行一次</span></>}
              </div>
              {timing.frequency === "weekly" && <div className="mt-2 flex flex-wrap gap-1.5">{weekdayLabels.map((day) => <button key={day.value} type="button" onClick={() => updateTiming({ ...timing, weekdays: timing.weekdays.includes(day.value) ? timing.weekdays.filter((value) => value !== day.value) : [...timing.weekdays, day.value].sort((a, b) => a - b) })} className={`rounded border px-2.5 py-1.5 text-xs ${timing.weekdays.includes(day.value) ? "border-accent bg-accent/15 text-accent" : "border-border/60 bg-bg-elevated text-text-tertiary"}`}>{day.label}</button>)}</div>}
              {timing.frequency === "custom" && <p className="mt-2 text-xs text-warning">这是历史任务的高级规则。要修改执行时间，请选择“每天”“每周”或“每隔几分钟”。</p>}
              {timing.frequency === "weekly" && timing.weekdays.length === 0 && <p className="mt-2 text-xs text-warning">请至少选择一天</p>}
            </div>
          </div>
          {editForm.targetType === "platform" && <div className="mt-4"><span className="mb-2 block text-xs text-text-tertiary">关联平台用例（可多选）*</span><div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">{cases.map((item) => <button key={item.id} type="button" onClick={() => toggleCase(item.id)} className={`rounded border px-2.5 py-1.5 text-xs ${editForm.caseIds.includes(item.id) ? "border-accent bg-accent/15 text-accent" : "border-border/60 bg-bg-elevated text-text-secondary hover:text-text"}`}>{item.name}</button>)}</div></div>}
          <div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={cancelEdit}>取消</button><button className="btn-primary" onClick={() => void handleSave()} disabled={!editForm.name.trim() || !validTarget || !validTiming || saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? "保存中" : "保存"}</button></div>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {items.map((item) => {
          const isApiCollection = item.targetType === "api_collection";
          const environmentList = isApiCollection ? apiEnvs : platformEnvs;
          const collection = collections.find((entry) => entry.path === item.collectionPath);
          return (
            <article key={item.id} className="card p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-accent/15">{isApiCollection ? <FolderTree className="h-4 w-4 text-accent" /> : <Clock className="h-4 w-4 text-accent" />}</div><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{item.name}</h3><div className="text-[11px] text-text-tertiary">{timingDescription(item.cronExpression)}</div></div></div>
                <StatusBadge status={item.enabled ? "active" : "inactive"} size="sm" />
              </div>
              <div className="mb-3 space-y-1 text-xs text-text-tertiary">
                <div>类型：{isApiCollection ? "接口测试集合" : "平台用例"}</div>
                <div>{isApiCollection ? `集合：${item.collectionPath || "未设置"}（${collection?.total || 0} 个接口）` : `用例：${item.caseIds.length} 条`}</div>
                <div>环境：{environmentList.find((environment) => environment.id === item.environmentId)?.name || "未指定"}</div>
                {item.lastRunTime && <div>上次执行：{new Date(item.lastRunTime).toLocaleString("zh-CN", { hour12: false })}</div>}
              </div>
              <div className="flex items-center justify-between border-t border-border/60 pt-3">
                <div className="flex gap-2"><button onClick={() => void handleRun(item)} disabled={runningId === item.id} className="btn-secondary !px-2.5 !py-1 text-xs">{runningId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}立即执行</button>{isApiCollection && <Link to="/reports?tab=api" className="btn-secondary !px-2.5 !py-1 text-xs"><ExternalLink className="h-3.5 w-3.5" />报告</Link>}</div>
                <div className="flex items-center gap-1"><button onClick={() => void handleToggle(item)} className="flex h-8 w-8 items-center justify-center rounded text-text-secondary hover:bg-bg-elevated" title={item.enabled ? "暂停" : "启用"}>{item.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button><button onClick={() => startEdit(item)} className="flex h-8 w-8 items-center justify-center rounded text-text-secondary hover:bg-bg-elevated" title="编辑"><Edit2 className="h-4 w-4" /></button><button onClick={() => void handleDelete(item.id)} className="flex h-8 w-8 items-center justify-center rounded text-text-secondary hover:bg-danger/10 hover:text-danger" title="删除"><Trash2 className="h-4 w-4" /></button></div>
              </div>
            </article>
          );
        })}
      </div>
      {items.length === 0 && <div className="py-16 text-center text-sm text-text-tertiary">暂无定时任务</div>}
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { Plus, Edit2, Trash2, Webhook, Mail, MessageSquare, TestTube, Check, X, Save } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { confirmAction } from "@/components/ConfirmDialog";
import { alertsService, type AlertItem } from "@/api/services";

const icons: Record<string, typeof MessageSquare> = { dingtalk: MessageSquare, feishu: MessageSquare, email: Mail, webhook: Webhook };
const labels: Record<string, string> = { dingtalk: "钉钉", feishu: "飞书", email: "邮件", webhook: "通用 Webhook" };

function empty(): AlertItem {
  return { id: "", name: "", channel: "dingtalk", webhookUrl: "", notifyLevels: ["failed"], modules: ["ui"], template: "", testTemplate: "", enabled: true, config: {} };
}

export default function Alerts() {
  const [items, setItems] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AlertItem>(empty());
  const [isNew, setIsNew] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await alertsService.list();
    if (res.ok) setItems(res.data.items);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (item?: AlertItem) => {
    if (item) { setEditForm({ ...item }); setIsNew(false); setEditingId(item.id); }
    else { setEditForm(empty()); setIsNew(true); setEditingId("__new__"); }
  };

  const cancelEdit = () => { setEditingId(null); setIsNew(false); };

  const handleSave = async () => {
    if (!editForm.name.trim()) return;
    setSaving(true);
    setMessage(null);
    const res = isNew
      ? await alertsService.create(editForm)
      : await alertsService.update(editForm.id, editForm);
    setSaving(false);
    if (!res.ok) {
      setMessage({ type: "error", text: res.error || "保存失败" });
      return;
    }
    if (isNew) {
      setItems(prev => [res.data, ...prev]);
    } else {
      setItems(prev => prev.map(i => i.id === editForm.id ? res.data : i));
    }
    cancelEdit();
    setMessage({ type: "success", text: "告警通道已保存" });
  };

  const handleDelete = async (id: string) => {
    if (!await confirmAction({ title: "删除告警通道？", message: "此告警通道会被永久删除。", confirmLabel: "确认删除" })) return;
    const res = await alertsService.remove(id);
    if (!res.ok) {
      setMessage({ type: "error", text: res.error || "删除失败" });
      return;
    }
    setItems(prev => prev.filter(i => i.id !== id));
    if (editingId === id) cancelEdit();
  };

  const handleToggle = async (item: AlertItem) => {
    const res = await alertsService.update(item.id, { enabled: !item.enabled });
    if (res.ok) setItems(prev => prev.map(i => i.id === item.id ? res.data : i));
    else setMessage({ type: "error", text: res.error || "状态更新失败" });
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setMessage(null);
    const res = await alertsService.test(id);
    setTestingId(null);
    setMessage(res.ok
      ? { type: "success", text: res.data.message }
      : { type: "error", text: res.error || "测试消息发送失败" });
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-text-tertiary">加载中...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold mb-1">告警通知</h1>
          <p className="text-sm text-text-tertiary">配置告警通道，测试失败时自动通知</p>
        </div>
        <button className="btn-primary" onClick={() => startEdit()}>
          <Plus className="w-4 h-4" />
          新建通道
        </button>
      </div>

      {message && <div className={`px-4 py-3 rounded-lg border text-sm ${message.type === "success" ? "bg-success/10 border-success/30 text-success" : "bg-danger/10 border-danger/30 text-danger"}`}>{message.text}</div>}

      {/* 编辑抽屉 */}
      {editingId && (
        <div className="card p-5 space-y-4 border-accent/40">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{isNew ? "新建通道" : "编辑通道"}</h3>
            <button onClick={cancelEdit} className="p-1 rounded hover:bg-bg-elevated"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-tertiary mb-1 block">名称 *</label>
              <input type="text" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className="input w-full" placeholder="QA 团队群" />
            </div>
            <div>
              <label className="text-xs text-text-tertiary mb-1 block">渠道</label>
              <select value={editForm.channel} onChange={e => setEditForm(p => ({ ...p, channel: e.target.value as AlertItem["channel"] }))} className="input w-full">
                <option value="dingtalk">钉钉</option>
                <option value="feishu">飞书</option>
                <option value="email" disabled>邮件（未配置）</option>
                <option value="webhook">通用 Webhook</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-text-tertiary mb-1 block">
              {editForm.channel === "email" ? "接收邮箱" : "Webhook URL"}
            </label>
            <input type="text" value={editForm.webhookUrl} onChange={e => setEditForm(p => ({ ...p, webhookUrl: e.target.value }))} className="input font-mono text-xs w-full" placeholder="https://..." />
          </div>
          {editForm.channel === "dingtalk" && (
            <div>
              <label className="text-xs text-text-tertiary mb-1 block">加签密钥（Secret）</label>
              <input type="text" value={editForm.config?.secret || ""} onChange={e => setEditForm(p => ({ ...p, config: { ...(p.config || {}), secret: e.target.value } }))} className="input font-mono text-xs w-full" placeholder="SECxxxx（机器人安全设置选「加签」时必填，留空则不加签）" />
            </div>
          )}
          <div>
            <label className="text-xs text-text-tertiary mb-1 block">适用模块<span className="text-text-tertiary/60 font-normal">（该模块执行完成后才用此通道通知，至少勾一个）</span></label>
            <div className="flex gap-4">
              {[{ v: "ui", l: "UI" }, { v: "api", l: "接口" }, { v: "performance", l: "性能" }].map(({ v, l }) => (
                <label key={v} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editForm.modules.includes(v)}
                    onChange={(e) => setEditForm((p) => {
                      const has = p.modules.includes(v);
                      const next = has ? p.modules.filter((m) => m !== v) : [...p.modules, v];
                      // 至少保留一个模块，避免通道变成不生效
                      return { ...p, modules: next.length === 0 ? p.modules : next };
                    })}
                    className="accent-accent"
                  />
                  {l}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-text-tertiary mb-1 block">通知级别</label>
            <div className="flex gap-4">
              {["failed", "timeout", "success", "completed"].map((level) => (
                <label key={level} className="flex items-center gap-2 text-sm" title={level === "completed" ? "无论成败，执行结束即通知（不受全局通知开关限制）" : undefined}>
                  <input type="checkbox" checked={editForm.notifyLevels.includes(level)} onChange={(e) => setEditForm((p) => ({ ...p, notifyLevels: e.target.checked ? [...p.notifyLevels, level] : p.notifyLevels.filter((item) => item !== level) }))} className="accent-accent" />
                  {level === "failed" ? "失败" : level === "timeout" ? "超时" : level === "completed" ? "执行完毕" : "成功"}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-text-tertiary mb-1 block">消息模板<span className="text-text-tertiary/60 font-normal">（执行结果推送用）</span></label>
            <textarea value={editForm.template} onChange={(e) => setEditForm((p) => ({ ...p, template: e.target.value }))} className="input w-full resize-none" rows={3} placeholder="【自动化告警】{{caseName}} 执行失败" />
          </div>
          <div>
            <label className="text-xs text-text-tertiary mb-1 block">测试消息模板<span className="text-text-tertiary/60 font-normal">（仅点「发送测试消息」时用，可用 {'{{name}}/{{channel}}/{{time}}'}）</span></label>
            <textarea value={editForm.testTemplate || ""} onChange={(e) => setEditForm((p) => ({ ...p, testTemplate: e.target.value }))} className="input w-full resize-none" rows={2} placeholder="【AutoTest 测试消息】告警通道「{{name}}」连接成功" />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button className="btn-secondary" onClick={cancelEdit}>取消</button>
            <button className="btn-primary" onClick={handleSave} disabled={!editForm.name.trim() || saving}>
              <Save className="w-4 h-4" /> {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {items.map((ch) => {
          const Icon = icons[ch.channel] || Webhook;
          return (
            <div key={ch.id} className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{ch.name}</h3>
                    <div className="text-xs text-text-tertiary">{labels[ch.channel]} · {ch.webhookUrl?.slice(0, 40)}...</div>
                    <div className="text-xs text-text-tertiary/80 mt-0.5">适用模块：{(ch.modules && ch.modules.length ? ch.modules : ["ui"]).map((m) => ({ ui: "UI", api: "接口", performance: "性能" }[m] || m)).join("、")}</div>
                  </div>
                </div>
                <StatusBadge status={ch.enabled ? "active" : "inactive"} size="sm" />
              </div>

              <div className="flex items-center justify-between pt-4 mt-4 border-t border-border/60">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggle(ch)}
                    role="switch"
                    aria-checked={ch.enabled}
                    title={ch.enabled ? "停用告警通道" : "启用告警通道"}
                    aria-label={`${ch.enabled ? "停用" : "启用"}告警通道 ${ch.name}`}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${ch.enabled ? "bg-accent" : "bg-bg-elevated"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${ch.enabled ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                  <span className={`text-xs ${ch.enabled ? "text-success font-medium" : "text-text-tertiary"}`}>{ch.enabled ? "已启用" : "已禁用"}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleTest(ch.id)}
                    title="发送测试消息"
                    aria-label={`测试告警通道 ${ch.name}`}
                    className="p-1.5 rounded-md hover:bg-accent/15 text-text-secondary hover:text-accent transition-colors"
                    disabled={testingId === ch.id}
                  >
                    {testingId === ch.id ? <Check className="w-4 h-4 text-success" /> : <TestTube className="w-4 h-4" />}
                  </button>
                  <button title="编辑" aria-label={`编辑告警通道 ${ch.name}`} className="p-1.5 rounded-md hover:bg-bg-elevated text-text-secondary hover:text-text" onClick={() => startEdit(ch)}>
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button title="删除" aria-label={`删除告警通道 ${ch.name}`} className="p-1.5 rounded-md hover:bg-bg-elevated text-text-secondary hover:text-danger" onClick={() => handleDelete(ch.id)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

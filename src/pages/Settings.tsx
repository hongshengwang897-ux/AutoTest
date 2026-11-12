import { useEffect, useRef, useState } from "react";
import { User, FolderKanban, Bell, Download, Upload, Save, Loader2 } from "lucide-react";
import { settingsService, type SettingsData } from "@/api/services";
import { confirmAction } from "@/components/ConfirmDialog";

const defaults: SettingsData = {
  profile: {
    name: "QA Engineer",
    email: "qa@example.com",
    title: "QA 工程师",
    department: "测试部",
  },
  notifications: {
    executionComplete: true,
    failureOnly: false,
    systemAlerts: true,
    dailyDigest: true,
  },
  maxConcurrency: 5,
  defaultTimeout: 60000,
  retryOnFailure: true,
  maxRetries: 2,
  screenshotOnFailure: true,
  videoRecording: false,
  notifyOnComplete: true,
};

type Tab = "profile" | "workspace" | "notification";

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [settings, setSettings] = useState<SettingsData>(defaults);
  const [savedSettings, setSavedSettings] = useState<SettingsData>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const res = await settingsService.get();
    if (res.ok) {
      const merged = {
        ...defaults,
        ...res.data,
        profile: { ...defaults.profile, ...res.data.profile },
        notifications: { ...defaults.notifications, ...res.data.notifications },
      };
      setSettings(merged);
      setSavedSettings(merged);
    } else {
      setMessage({ type: "error", text: res.error || "设置加载失败" });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const res = await settingsService.update(settings);
    setSaving(false);
    if (res.ok) {
      setSavedSettings(settings);
      setMessage({ type: "success", text: "设置已保存" });
    } else {
      setMessage({ type: "error", text: res.error || "保存失败" });
    }
  };

  const cancel = () => {
    setSettings(savedSettings);
    setMessage(null);
  };

  const exportAll = async () => {
    setMessage(null);
    const res = await settingsService.exportData();
    if (!res.ok) {
      setMessage({ type: "error", text: res.error || "导出失败" });
      return;
    }
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `autotest-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage({ type: "success", text: "数据备份已导出" });
  };

  const importAll = async (file: File) => {
    setMessage(null);
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      if (!await confirmAction({ title: "导入数据备份？", message: "导入会替换备份文件中包含的数据。", detail: "建议先导出当前数据作为备份。", confirmLabel: "确认导入" })) return;
      const res = await settingsService.importData(parsed);
      if (!res.ok) throw new Error(res.error || "导入失败");
      await load();
      setMessage({ type: "success", text: "数据已导入" });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "备份文件无效" });
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const uploadAvatar = (file: File) => {
    if (!file.type.startsWith("image/") || file.size > 1024 * 1024) {
      setMessage({ type: "error", text: "头像必须是小于 1MB 的图片" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSettings((prev) => ({
      ...prev,
      profile: { ...prev.profile, avatar: String(reader.result) },
    }));
    reader.readAsDataURL(file);
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-text-tertiary">加载中...</div>;

  const tabs: { key: Tab; label: string; icon: typeof User }[] = [
    { key: "profile", label: "个人资料", icon: User },
    { key: "workspace", label: "工作区", icon: FolderKanban },
    { key: "notification", label: "通知偏好", icon: Bell },
  ];

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div>
        <h1 className="text-xl font-bold mb-1">系统设置</h1>
        <p className="text-sm text-text-tertiary">管理个人资料、执行参数和通知偏好</p>
      </div>

      <div className="flex gap-2 border-b border-border/60">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 ${activeTab === tab.key ? "border-accent text-accent" : "border-transparent text-text-secondary hover:text-text"}`}>
              <Icon className="w-4 h-4" />{tab.label}
            </button>
          );
        })}
      </div>

      {message && <div className={`px-4 py-3 rounded-lg border text-sm ${message.type === "success" ? "bg-success/10 border-success/30 text-success" : "bg-danger/10 border-danger/30 text-danger"}`}>{message.text}</div>}

      {activeTab === "profile" && (
        <div className="card p-6 space-y-6">
          <div className="flex items-center gap-6">
            {settings.profile.avatar ? (
              <img src={settings.profile.avatar} alt="头像" className="w-20 h-20 rounded-full object-cover border border-border" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center text-white text-2xl font-bold">{settings.profile.name.slice(0, 2).toUpperCase()}</div>
            )}
            <label className="btn-secondary cursor-pointer">
              <Upload className="w-4 h-4" />上传头像
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {([
              ["name", "姓名", "text"],
              ["email", "邮箱", "email"],
              ["title", "职位", "text"],
              ["department", "部门", "text"],
            ] as const).map(([key, label, type]) => (
              <label key={key} className="space-y-1.5">
                <span className="text-xs font-medium text-text-tertiary">{label}</span>
                <input type={type} value={settings.profile[key]} onChange={(e) => setSettings((prev) => ({ ...prev, profile: { ...prev.profile, [key]: e.target.value } }))} className="input" />
              </label>
            ))}
          </div>
        </div>
      )}

      {activeTab === "workspace" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-6 space-y-4">
            <h3 className="text-sm font-semibold">执行参数</h3>
            <label className="space-y-1.5 block"><span className="text-xs text-text-tertiary">最大并发数</span><input type="number" min={1} max={50} value={settings.maxConcurrency} onChange={(e) => setSettings((p) => ({ ...p, maxConcurrency: Number(e.target.value) }))} className="input" /></label>
            <label className="space-y-1.5 block"><span className="text-xs text-text-tertiary">默认超时（秒）</span><input type="number" min={1} value={Math.round(settings.defaultTimeout / 1000)} onChange={(e) => setSettings((p) => ({ ...p, defaultTimeout: Number(e.target.value) * 1000 }))} className="input" /></label>
            <label className="space-y-1.5 block"><span className="text-xs text-text-tertiary">失败重试次数</span><input type="number" min={0} max={10} value={settings.maxRetries} onChange={(e) => setSettings((p) => ({ ...p, maxRetries: Number(e.target.value), retryOnFailure: Number(e.target.value) > 0 }))} className="input" /></label>
            <label className="flex items-center justify-between p-3 bg-bg-elevated/50 rounded-lg"><span><span className="text-sm block">用例执行结束自动截图</span><span className="text-xs text-text-tertiary mt-1 block">固定开启，成功和失败均保存</span></span><input type="checkbox" checked disabled className="accent-accent w-4 h-4" /></label>
          </div>
          <div className="card p-6 space-y-3">
            <h3 className="text-sm font-semibold">数据管理</h3>
            <button onClick={exportAll} className="w-full btn-secondary justify-start"><Download className="w-4 h-4" />导出所有数据</button>
            <button onClick={() => importRef.current?.click()} className="w-full btn-secondary justify-start"><Upload className="w-4 h-4" />导入数据</button>
            <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importAll(e.target.files[0])} />
          </div>
        </div>
      )}

      {activeTab === "notification" && (
        <div className="card p-6 space-y-3">
          {([
            ["executionComplete", "执行完成通知", "每次执行完成后发送通知"],
            ["failureOnly", "仅失败时通知", "只在执行失败时发送通知"],
            ["systemAlerts", "异常告警通知", "系统异常时发送紧急通知"],
          ] as const).map(([key, name, desc]) => (
            <label key={key} className="flex items-center justify-between p-3 bg-bg-elevated/50 rounded-lg cursor-pointer">
              <span><span className="block text-sm font-medium">{name}</span><span className="text-xs text-text-tertiary">{desc}</span></span>
              <input type="checkbox" checked={settings.notifications[key]} onChange={(e) => setSettings((prev) => ({ ...prev, notifications: { ...prev.notifications, [key]: e.target.checked }, notifyOnComplete: key === "executionComplete" ? e.target.checked : prev.notifyOnComplete }))} className="accent-accent w-4 h-4" />
            </label>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={cancel} className="btn-secondary">取消</button>
        <button onClick={save} disabled={saving || !settings.profile.name.trim()} className="btn-primary min-w-[110px]">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{saving ? "保存中" : "保存更改"}</button>
      </div>
    </div>
  );
}

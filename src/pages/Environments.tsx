import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Server, Globe, Key, User, Eye, EyeOff, Edit2, Trash2,
  ChevronDown, X, Save, Upload, Loader2, AlertCircle, XCircle,
} from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { confirmAction } from "@/components/ConfirmDialog";
import { environmentsService, type EnvironmentItem } from "@/api/services";

/** 空环境模板 */
type EnvironmentScope = EnvironmentItem["scope"];

function emptyEnv(scope: EnvironmentScope = "platform"): EnvironmentItem {
  return {
    id: "",
    name: "",
    url: "",
    type: "dev" as const,
    scope,
    variables: {},
    accounts: [],
    status: "online" as const,
  };
}

export default function Environments() {
  const [environments, setEnvironments] = useState<EnvironmentItem[]>([]);
  const [activeScope, setActiveScope] = useState<EnvironmentScope>("platform");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});

  // 编辑模式
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EnvironmentItem>(emptyEnv());
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Postman 环境导入
  const [importing, setImporting] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载列表
  const loadEnvs = useCallback(async () => {
    const res = await environmentsService.list();
    if (res.ok) {
      setEnvironments(res.data.items);
      setExpandedId((current) => current || res.data.items.find((env) => env.scope === "platform")?.id || null);
    } else {
      setMessage({ type: "error", text: res.error || "环境加载失败" });
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadEnvs(); }, [loadEnvs]);

  // 开始编辑（新建或修改）
  const startEdit = (env?: EnvironmentItem) => {
    if (env) {
      setEditForm({ ...env, variables: { ...env.variables }, accounts: env.accounts.map(a => ({ ...a })) });
      setIsNew(false);
      setEditingId(env.id);
    } else {
      setEditForm(emptyEnv(activeScope));
      setIsNew(true);
      setEditingId("__new__");
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyEnv(activeScope));
    setIsNew(false);
  };

  // 保存
  const handleSave = async () => {
    if (!editForm.name.trim()) return;
    setSaving(true);
    setMessage(null);
      if (isNew) {
        const created = await environmentsService.create({
          name: editForm.name,
          url: editForm.url,
          type: editForm.type,
          scope: editForm.scope,
          variables: editForm.variables,
          accounts: editForm.accounts,
          status: editForm.status,
        });
        if (!created.ok) {
          setMessage({ type: "error", text: created.error || "保存失败" });
          setSaving(false);
          return;
        }
        setEnvironments(prev => [created.data, ...prev]);
      } else {
        const updated = await environmentsService.update(editForm.id, {
          name: editForm.name,
          url: editForm.url,
          type: editForm.type,
          scope: editForm.scope,
          variables: editForm.variables,
          accounts: editForm.accounts,
          status: editForm.status,
        });
        if (!updated.ok) {
          setMessage({ type: "error", text: updated.error || "保存失败" });
          setSaving(false);
          return;
        }
        setEnvironments(prev => prev.map(e => e.id === editForm.id ? updated.data : e));
      }
      setSaving(false);
      cancelEdit();
      setMessage({ type: "success", text: "环境已保存" });
  };

  // 删除
  const handleDelete = async (id: string) => {
    if (!await confirmAction({ title: "删除环境？", message: "此环境配置会被永久删除。", detail: "引用该环境的用例可能无法继续执行。", confirmLabel: "确认删除" })) return;
      const res = await environmentsService.remove(id);
      if (!res.ok) {
        setMessage({ type: "error", text: res.error || "删除失败" });
        return;
      }
      setEnvironments(prev => prev.filter(e => e.id !== id));
      if (expandedId === id) setExpandedId(null);
      if (editingId === id) cancelEdit();
  };

  // Postman 环境导入（支持单环境对象或多环境数组，导入到当前激活的用途标签）
  const importPostman = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setMessage({ type: "error", text: "Postman JSON 文件不能超过 10 MB" });
      return;
    }
    setImporting(true);
    setMessage(null);
    try {
      let collection: unknown;
      try { collection = JSON.parse(await file.text()); }
      catch { setMessage({ type: "error", text: "文件不是有效的 JSON" }); return; }
      const result = await environmentsService.importPostman(collection, activeScope);
      if (!result.ok) {
        setMessage({ type: "error", text: result.error || "Postman 环境导入失败" });
        return;
      }
      const data = result.data;
      setImportWarnings(data.warnings);
      setMessage({
        type: "success",
        text: `已导入 ${data.imported} 个环境${data.updated ? `，更新 ${data.updated} 个` : ""}${data.skipped ? `，跳过 ${data.skipped} 个` : ""}`,
      });
      await loadEnvs();
      if (data.environments[0]) setExpandedId(data.environments[0].id);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 变量操作
  const addVariable = () => {
    setEditForm(prev => ({ ...prev, variables: { ...prev.variables, "": "" } }));
  };
  const updateVarKey = (oldKey: string, newKey: string) => {
    const vars = { ...editForm.variables };
    const value = vars[oldKey];
    delete vars[oldKey];
    vars[newKey] = value;
    setEditForm(prev => ({ ...prev, variables: vars }));
  };
  const updateVarValue = (key: string, value: string) => {
    setEditForm(prev => ({ ...prev, variables: { ...prev.variables, [key]: value } }));
  };
  const removeVar = (key: string) => {
    const vars = { ...editForm.variables };
    delete vars[key];
    setEditForm(prev => ({ ...prev, variables: vars }));
  };

  // 账号操作
  const addAccount = () => {
    setEditForm(prev => ({
      ...prev,
      accounts: [...prev.accounts, { username: "", password: "", role: "" }],
    }));
  };
  const updateAccount = (index: number, field: string, value: string) => {
    const accounts = editForm.accounts.map((a, i) =>
      i === index ? { ...a, [field]: value } : a
    );
    setEditForm(prev => ({ ...prev, accounts }));
  };
  const removeAccount = (index: number) => {
    setEditForm(prev => ({
      ...prev,
      accounts: prev.accounts.filter((_, i) => i !== index),
    }));
  };

  const scopedEnvironments = environments.filter((env) => env.scope === activeScope);
  const scopeCounts = {
    platform: environments.filter((env) => env.scope === "platform").length,
    api: environments.filter((env) => env.scope === "api").length,
  };

  const changeScope = (scope: EnvironmentScope) => {
    setActiveScope(scope);
    setExpandedId(environments.find((env) => env.scope === scope)?.id || null);
    setEditingId(null);
    setEditForm(emptyEnv(scope));
    setIsNew(false);
    setMessage(null);
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-text-tertiary">加载中...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold mb-1">环境管理</h1>
          <p className="text-sm text-text-tertiary">按使用场景隔离平台用例与接口测试的环境配置</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            data-testid="environment-postman-file-input"
            onChange={(event) => void importPostman(event.target.files?.[0])}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="btn-secondary"
            title="导入 Postman 导出的环境 JSON（单个或多个）"
            data-testid="environment-postman-import-button"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            导入 Postman
          </button>
          <button className="btn-primary" onClick={() => startEdit()}>
            <Plus className="w-4 h-4" />
            新建{activeScope === "platform" ? "平台" : "接口测试"}环境
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border/60" role="tablist" aria-label="环境用途">
        {([
          { value: "platform", label: "平台环境", description: "用于 UI自动化测试 与执行" },
          { value: "api", label: "接口测试环境", description: "用于接口请求与变量切换" },
        ] as const).map((scope) => (
          <button
            key={scope.value}
            type="button"
            role="tab"
            aria-selected={activeScope === scope.value}
            onClick={() => changeScope(scope.value)}
            className={`min-w-0 border-b-2 px-3 py-3 text-left transition-colors sm:px-4 ${
              activeScope === scope.value
                ? "border-accent text-text"
                : "border-transparent text-text-tertiary hover:text-text-secondary"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {scope.label}
              <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[11px] text-text-secondary">{scopeCounts[scope.value]}</span>
            </span>
            <span className="mt-0.5 hidden text-xs text-text-tertiary sm:block">{scope.description}</span>
          </button>
        ))}
      </div>

      {message && <div className={`px-4 py-3 rounded-lg border text-sm ${message.type === "success" ? "bg-success/10 border-success/30 text-success" : "bg-danger/10 border-danger/30 text-danger"}`}>{message.text}</div>}

      {/* 导入警告弹窗 */}
      {importWarnings.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-lg border border-warning/40 bg-bg-card shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-2 text-sm font-semibold"><AlertCircle className="w-4 h-4 text-warning" />导入完成，但有部分警告</div>
              <button onClick={() => setImportWarnings([])} className="w-7 h-7 flex items-center justify-center rounded text-text-tertiary hover:bg-bg-elevated"><XCircle className="w-4 h-4" /></button>
            </div>
            <div className="max-h-72 overflow-y-auto px-4 py-3 space-y-2">{importWarnings.map((warning, index) => <div key={`${warning}-${index}`} className="text-xs text-text-secondary leading-5">{index + 1}. {warning}</div>)}</div>
            <div className="px-4 py-3 border-t border-border/50 flex justify-end"><button onClick={() => setImportWarnings([])} className="btn-secondary !py-1.5">知道了</button></div>
          </div>
        </div>
      )}

      {/* 编辑抽屉 */}
      {editingId && (
        <div className="card p-5 space-y-4 border-accent/40">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{isNew ? "新建环境" : "编辑环境"}</h3>
            <button onClick={cancelEdit} className="p-1 rounded hover:bg-bg-elevated"><X className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="text-xs text-text-tertiary mb-1 block">名称 *</label>
              <input
                type="text"
                value={editForm.name}
                onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                className="input w-full"
                placeholder="例如：开发环境"
              />
            </div>
            <div>
              <label className="text-xs text-text-tertiary mb-1 block">URL</label>
              <input
                type="text"
                value={editForm.url}
                onChange={e => setEditForm(prev => ({ ...prev, url: e.target.value }))}
                className="input w-full"
                placeholder="https://dev.example.com"
              />
            </div>
            <div>
              <label className="text-xs text-text-tertiary mb-1 block">环境用途</label>
              <select
                value={editForm.scope}
                onChange={e => setEditForm(prev => ({ ...prev, scope: e.target.value as EnvironmentScope }))}
                className="input w-full"
              >
                <option value="platform">平台环境（UI 用例）</option>
                <option value="api">接口测试环境</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-tertiary mb-1 block">类型</label>
              <select
                value={editForm.type}
                onChange={e => setEditForm(prev => ({ ...prev, type: e.target.value }))}
                className="input w-full"
              >
                <option value="dev">开发 (dev)</option>
                <option value="staging">预发布 (staging)</option>
                <option value="prod">生产 (prod)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-text-tertiary mb-1 block">状态</label>
            <select
              value={editForm.status}
              onChange={e => setEditForm(prev => ({ ...prev, status: e.target.value }))}
              className="input w-28"
            >
              <option value="online">在线</option>
              <option value="offline">离线</option>
              <option value="maintenance">维护中</option>
            </select>
          </div>

          {/* 环境变量 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Key className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium">环境变量</span>
              <button onClick={addVariable} className="text-xs text-accent hover:underline ml-auto">+ 添加</button>
            </div>
            {Object.entries(editForm.variables).length === 0 && (
              <p className="text-xs text-text-tertiary">暂无变量</p>
            )}
            {Object.entries(editForm.variables).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 mb-1.5">
                <input
                  type="text"
                  value={key}
                  onChange={e => updateVarKey(key, e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-bg-elevated border border-border/60 rounded-lg text-sm"
                  placeholder="变量名"
                />
                <span className="text-text-tertiary">=</span>
                <input
                  type="text"
                  value={value}
                  onChange={e => updateVarValue(key, e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-bg-elevated border border-border/60 rounded-lg text-sm"
                  placeholder="值"
                />
                <button onClick={() => removeVar(key)} className="p-1 text-text-tertiary hover:text-danger"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>

          {/* 测试账号 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium">测试账号</span>
              <button onClick={addAccount} className="text-xs text-accent hover:underline ml-auto">+ 添加</button>
            </div>
            {editForm.accounts.length === 0 && (
              <p className="text-xs text-text-tertiary">暂无账号</p>
            )}
            {editForm.accounts.map((acc, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5 p-2 bg-bg-elevated/50 rounded-lg">
                <input
                  type="text"
                  value={acc.username}
                  onChange={e => updateAccount(i, "username", e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-bg-elevated border border-border/60 rounded text-sm"
                  placeholder="用户名"
                />
                <div className="relative flex-1">
                  <input
                    type={showPassword[i] ? "text" : "password"}
                    value={acc.password}
                    onChange={e => updateAccount(i, "password", e.target.value)}
                    className="w-full px-2 py-1.5 bg-bg-elevated border border-border/60 rounded text-sm pr-8"
                    placeholder="密码"
                  />
                  <button
                    onClick={() => setShowPassword(prev => ({ ...prev, [i]: !prev[i] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text"
                  >
                    {showPassword[i] ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <input
                  type="text"
                  value={acc.role}
                  onChange={e => updateAccount(i, "role", e.target.value)}
                  className="w-24 px-2 py-1.5 bg-bg-elevated border border-border/60 rounded text-sm"
                  placeholder="角色"
                />
                <button onClick={() => removeAccount(i)} className="p-1 text-text-tertiary hover:text-danger"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={cancelEdit}>取消</button>
            <button className="btn-primary" onClick={handleSave} disabled={!editForm.name.trim() || saving}>
              <Save className="w-4 h-4" />
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      )}

      {/* 环境列表 */}
      {scopedEnvironments.length === 0 && (
        <div className="border border-dashed border-border/70 px-4 py-12 text-center text-sm text-text-tertiary">
          暂无{activeScope === "platform" ? "平台" : "接口测试"}环境
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {scopedEnvironments.map((env) => {
          const expanded = expandedId === env.id;
          return (
            <div key={env.id} className="card overflow-hidden">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpandedId(expanded ? null : env.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setExpandedId(expanded ? null : env.id);
                  }
                }}
                className="w-full flex items-center justify-between p-5 hover:bg-bg-elevated/30 transition-colors text-left"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center">
                    <Server className="w-5 h-5 text-accent" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="min-w-0 break-words font-semibold">{env.name}</h3>
                      <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-tertiary">
                        {env.scope === "platform" ? "平台" : "接口"}
                      </span>
                      <StatusBadge status={env.status} size="sm" />
                    </div>
                    <div className="text-xs text-text-tertiary flex items-center gap-1 mt-0.5">
                      <Globe className="w-3 h-3" />
                      {env.url || "(未设置)"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 hover:opacity-100" style={{ opacity: expanded ? 1 : 0 }}>
                    <button
                      title="编辑环境"
                      aria-label={`编辑环境 ${env.name}`}
                      className="p-1.5 rounded-md hover:bg-bg-elevated text-text-secondary hover:text-accent transition-colors"
                      onClick={(e) => { e.stopPropagation(); startEdit(env); }}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      title="删除环境"
                      aria-label={`删除环境 ${env.name}`}
                      className="p-1.5 rounded-md hover:bg-bg-elevated text-text-secondary hover:text-danger transition-colors"
                      onClick={(e) => { e.stopPropagation(); handleDelete(env.id); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-text-tertiary transition-transform ${expanded ? "rotate-180" : ""}`} />
                </div>
              </div>

              {expanded && (
                <div className="px-5 pb-5 space-y-4 animate-slide-up">
                  {/* 信息行 */}
                  <div className="flex flex-col gap-2 border-t border-border/60 pt-4 text-sm sm:flex-row sm:gap-6">
                    <span className="text-text-tertiary">类型：<span className="text-text font-medium">{env.type === "dev" ? "开发" : env.type === "staging" ? "预发布" : "生产"}</span></span>
                    <span className="min-w-0 text-text-tertiary">URL：<span className="break-all font-mono text-xs text-text">{env.url}</span></span>
                  </div>

                  {/* 变量 */}
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium mb-3">
                      <Key className="w-4 h-4 text-accent" /> 环境变量
                    </div>
                    {Object.keys(env.variables).length === 0 ? (
                      <p className="text-xs text-text-tertiary">暂无变量</p>
                    ) : (
                      <div className="space-y-1.5">
                        {Object.entries(env.variables).map(([k, v]) => (
                          <div key={k} className="grid grid-cols-[minmax(0,auto)_auto_minmax(0,1fr)] items-start gap-2 text-sm">
                            <code className="max-w-full break-all rounded bg-bg-elevated px-2 py-0.5 font-mono text-xs text-accent">{k}</code>
                            <span className="text-text-tertiary">=</span>
                            <code className="min-w-0 whitespace-pre-wrap break-all rounded bg-bg-elevated px-2 py-0.5 font-mono text-xs">{v}</code>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 账号 */}
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium mb-3">
                      <User className="w-4 h-4 text-accent" /> 测试账号
                    </div>
                    {env.accounts.length === 0 ? (
                      <p className="text-xs text-text-tertiary">暂无账号</p>
                    ) : (
                      <div className="space-y-2">
                        {env.accounts.map((acc, i) => (
                          <div key={i} className="p-3 bg-bg-elevated/50 rounded-lg">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-text-tertiary">{acc.role || "未设置角色"}</span>
                              <button
                                onClick={() => setShowPassword(prev => ({ ...prev, [`${env.id}-${i}`]: !prev[`${env.id}-${i}`] }))}
                                className="text-text-tertiary hover:text-text transition-colors"
                              >
                                {showPassword[`${env.id}-${i}`] ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-medium">{acc.username}</span>
                              <span className="text-text-tertiary">/</span>
                              <span className="text-text-secondary">
                                {showPassword[`${env.id}-${i}`] ? acc.password : "••••••••"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button className="btn-secondary text-xs" onClick={() => startEdit(env)}>
                      <Edit2 className="w-3 h-3" /> 编辑
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

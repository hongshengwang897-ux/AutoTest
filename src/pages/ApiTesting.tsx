import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Braces,
  CheckCircle2,
  Clock3,
  Copy,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Folder,
  FolderOpen,
  Globe,
  GripVertical,
  Eye,
  EyeOff,
  Loader2,
  Play,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { apiTestsService, environmentsService } from "@/api/services";
import { confirmAction } from "@/components/ConfirmDialog";
import { writeClipboard } from "@/lib/clipboard";
import type {
  ApiAssertion,
  ApiExtraction,
  ApiKeyValue,
  ApiTestCase,
  ApiTestExecution,
  EnvironmentItem,
} from "@/api/services";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const SELECTED_ENVIRONMENT_KEY = "api-testing.selected-environment-id";
const methodColor: Record<string, string> = {
  GET: "text-success",
  POST: "text-accent-light",
  PUT: "text-warning",
  PATCH: "text-yellow-300",
  DELETE: "text-danger",
  HEAD: "text-purple-300",
  OPTIONS: "text-text-secondary",
};

interface ApiCaseFolder {
  name: string;
  path: string;
  cases: ApiTestCase[];
  children: ApiCaseFolder[];
  total: number;
}

interface MutableApiCaseFolder {
  name: string;
  path: string;
  cases: ApiTestCase[];
  children: Map<string, MutableApiCaseFolder>;
}

type CaseDropTarget = { caseId: string; position: "before" | "after" } | null;

type VariableSource = "environment" | "case";

interface VariableDraftItem {
  value: string;
  source: VariableSource;
}

const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;

function extractTemplateNames(values: string[]): string[] {
  const names = new Set<string>();
  values.forEach((value) => {
    for (const match of value.matchAll(TEMPLATE_VARIABLE_PATTERN)) names.add(match[1]);
  });
  return [...names];
}

function isSensitiveVariable(name: string): boolean {
  return /(?:token|secret|password|passwd|pass|key|auth|credential)/i.test(name);
}

function renderTemplatePreview(value: string, variables: Record<string, string>, revealSensitive: boolean): string {
  return value.replace(TEMPLATE_VARIABLE_PATTERN, (template, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, name)) return template;
    if (isSensitiveVariable(name) && !revealSensitive) return "••••••••";
    return variables[name];
  });
}

function buildCaseFolders(items: ApiTestCase[]): ApiCaseFolder[] {
  const roots = new Map<string, MutableApiCaseFolder>();

  for (const item of items) {
    const parts = item.group.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) parts.push("未分组");
    let siblings = roots;
    let current: MutableApiCaseFolder | undefined;
    const path: string[] = [];
    for (const part of parts) {
      path.push(part);
      current = siblings.get(part);
      if (!current) {
        current = { name: part, path: path.join(" / "), cases: [], children: new Map() };
        siblings.set(part, current);
      }
      siblings = current.children;
    }
    current?.cases.push(item);
  }

  const finalize = (nodes: Map<string, MutableApiCaseFolder>): ApiCaseFolder[] =>
    [...nodes.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
      .map((node) => {
        const children = finalize(node.children);
        return {
          name: node.name,
          path: node.path,
          cases: node.cases,
          children,
          total: node.cases.length + children.reduce((sum, child) => sum + child.total, 0),
        };
      });

  return finalize(roots);
}

function collectFolderPaths(folders: ApiCaseFolder[]): string[] {
  return folders.flatMap((folder) => [folder.path, ...collectFolderPaths(folder.children)]);
}

function ApiCaseFolderTree({
  folders,
  activeId,
  collapsedFolders,
  forceExpanded,
  onToggle,
  onSelect,
  onCreate,
  onSchedule,
  onRun,
  runningCollectionPath,
  draggingCaseId,
  dropTarget,
  dragDisabled,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  folders: ApiCaseFolder[];
  activeId: string;
  collapsedFolders: Set<string>;
  forceExpanded: boolean;
  onToggle: (path: string) => void;
  onSelect: (item: ApiTestCase) => void;
  onCreate: (path: string) => void;
  onSchedule: (path: string) => void;
  onRun: (path: string) => void;
  runningCollectionPath: string | null;
  draggingCaseId: string | null;
  dropTarget: CaseDropTarget;
  dragDisabled: boolean;
  onDragStart: (caseId: string) => void;
  onDragOver: (target: CaseDropTarget) => void;
  onDrop: (targetId: string, position: "before" | "after") => void;
  onDragEnd: () => void;
}) {
  return folders.map((folder) => {
    const expanded = forceExpanded || !collapsedFolders.has(folder.path);
    return (
      <div key={folder.path} className="mb-1">
        <div className="group flex items-center rounded hover:bg-bg-elevated/70">
          <button
            type="button"
            onClick={() => onSchedule(folder.path)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-tertiary hover:bg-accent/10 hover:text-accent"
            title={`为集合 ${folder.path} 创建定时任务`}
          >
            <Clock3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => onToggle(folder.path)}
            className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2 text-left"
          >
            <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform ${expanded ? "rotate-90" : ""}`} />
            {expanded ? <FolderOpen className="h-4 w-4 shrink-0 text-accent" /> : <Folder className="h-4 w-4 shrink-0 text-text-secondary" />}
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{folder.name}</span>
            <span className="rounded bg-bg px-1.5 py-0.5 text-[10px] text-text-tertiary">{folder.total}</span>
          </button>
          <button
            type="button"
            onClick={() => onRun(folder.path)}
            disabled={runningCollectionPath === folder.path}
            className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-tertiary hover:bg-accent/10 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
            title={`运行集合 ${folder.path}`}
          >
            {runningCollectionPath === folder.path ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onCreate(folder.path)}
            className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-tertiary hover:bg-accent/10 hover:text-accent"
            title={`在集合 ${folder.path} 中新建接口`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {expanded && (
          <div className="ml-3 border-l border-border/50 pl-1">
            <ApiCaseFolderTree
              folders={folder.children}
              activeId={activeId}
              collapsedFolders={collapsedFolders}
              forceExpanded={forceExpanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onCreate={onCreate}
              onSchedule={onSchedule}
              onRun={onRun}
              runningCollectionPath={runningCollectionPath}
              draggingCaseId={draggingCaseId}
              dropTarget={dropTarget}
              dragDisabled={dragDisabled}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
            {folder.cases.map((item) => (
              <button
                key={item.id}
                type="button"
                draggable={!dragDisabled}
                title={dragDisabled ? "请清除搜索后再拖动排序" : "拖动接口排序"}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", item.id);
                  onDragStart(item.id);
                }}
                onDragOver={(event) => {
                  if (!draggingCaseId || draggingCaseId === item.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const bounds = event.currentTarget.getBoundingClientRect();
                  onDragOver({ caseId: item.id, position: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" });
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dropTarget?.caseId === item.id) onDrop(item.id, dropTarget.position);
                }}
                onDragEnd={onDragEnd}
                onClick={() => onSelect(item)}
                className={`relative mb-1 w-full rounded border px-2 py-2 text-left transition-opacity ${
                  draggingCaseId === item.id ? "opacity-40" : ""
                } ${activeId === item.id ? "border-accent/30 bg-accent/10" : "border-transparent hover:bg-bg-elevated"}`}
              >
                {dropTarget?.caseId === item.id && <span className={`absolute left-0 right-0 z-10 h-0.5 bg-accent ${dropTarget.position === "before" ? "-top-0.5" : "-bottom-0.5"}`} />}
                <div className="flex min-w-0 items-center gap-1.5">
                  <GripVertical className={`h-3.5 w-3.5 shrink-0 text-text-tertiary ${dragDisabled ? "cursor-not-allowed opacity-40" : "cursor-grab"}`} aria-label="拖动排序" />
                  <span className={`w-9 shrink-0 text-[10px] font-bold ${methodColor[item.method] || "text-text-secondary"}`}>{item.method}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{item.name}</span>
                </div>
                <div className="mt-1 truncate pl-[56px] font-mono text-[10px] text-text-tertiary">{item.url || "未配置 URL"}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  });
}

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function newKeyValue(): ApiKeyValue {
  return { id: uid("kv"), key: "", value: "", enabled: true };
}

function newAssertion(): ApiAssertion {
  return { id: uid("assert"), source: "status", operator: "equals", target: "", expected: "200" };
}

function newExtraction(): ApiExtraction {
  return { id: uid("extraction"), variable: "", path: "", scope: "case" };
}

function newCase(): ApiTestCase {
  return {
    id: "",
    name: "未命名接口",
    description: "",
    method: "GET",
    url: "",
    headers: [],
    queryParams: [],
    bodyType: "none",
    body: "",
    assertions: [newAssertion()],
    variables: {},
    extractions: [],
    environmentId: "",
    group: "默认分组",
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function prettyResponse(body: string) {
  try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
}

function KeyValueEditor({
  items,
  onChange,
  keyPlaceholder = "参数名",
  valuePlaceholder = "参数值",
}: {
  items: ApiKeyValue[];
  onChange: (items: ApiKeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const update = (index: number, patch: Partial<ApiKeyValue>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <div className="h-full overflow-auto">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[36px_1fr_1fr_36px] border-b border-border/50 bg-bg-elevated/40 text-[11px] text-text-tertiary">
          <span className="px-2 py-2" />
          <span className="px-2 py-2 border-l border-border/30">名称</span>
          <span className="px-2 py-2 border-l border-border/30">值</span>
          <span />
        </div>
        {items.map((item, index) => (
          <div key={item.id} className="grid grid-cols-[36px_1fr_1fr_36px] border-b border-border/30 min-h-10">
            <label className="flex items-center justify-center">
              <input type="checkbox" checked={item.enabled} onChange={(event) => update(index, { enabled: event.target.checked })} className="accent-accent" />
            </label>
            <input value={item.key} onChange={(event) => update(index, { key: event.target.value })} placeholder={keyPlaceholder} className="bg-transparent border-l border-border/30 px-2 outline-none focus:bg-bg-elevated/50" />
            <input value={item.value} onChange={(event) => update(index, { value: event.target.value })} placeholder={valuePlaceholder} className="bg-transparent border-l border-border/30 px-2 outline-none focus:bg-bg-elevated/50 font-mono text-xs" />
            <button onClick={() => onChange(items.filter((_, i) => i !== index))} className="flex items-center justify-center text-text-tertiary hover:text-danger" title="删除">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <button onClick={() => onChange([...items, newKeyValue()])} className="h-10 px-3 flex items-center gap-1.5 text-xs text-text-tertiary hover:text-accent">
          <Plus className="w-3.5 h-3.5" /> 添加一行
        </button>
      </div>
    </div>
  );
}

const assertionSourceLabels: Record<ApiAssertion["source"], string> = {
  status: "状态码",
  body: "响应体",
  header: "响应头",
  json: "JSON 路径",
};

const operatorLabels: Record<ApiAssertion["operator"], string> = {
  equals: "等于",
  not_equals: "不等于",
  contains: "包含",
  not_contains: "不包含",
  exists: "存在",
  not_exists: "不存在",
  matches: "正则匹配",
  greater_than: "大于",
  less_than: "小于",
};

function AssertionEditor({ items, onChange }: { items: ApiAssertion[]; onChange: (items: ApiAssertion[]) => void }) {
  const update = (index: number, patch: Partial<ApiAssertion>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <div className="h-full overflow-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[130px_1fr_140px_1fr_40px] bg-bg-elevated/40 border-b border-border/50 text-[11px] text-text-tertiary">
          <span className="px-2 py-2">断言对象</span><span className="px-2 py-2 border-l border-border/30">目标</span><span className="px-2 py-2 border-l border-border/30">条件</span><span className="px-2 py-2 border-l border-border/30">期望值</span><span />
        </div>
        {items.map((item, index) => {
          const noTarget = item.source === "status" || item.source === "body";
          const noExpected = item.operator === "exists" || item.operator === "not_exists";
          return (
            <div key={item.id} className="grid grid-cols-[130px_1fr_140px_1fr_40px] min-h-11 border-b border-border/30">
              <select value={item.source} onChange={(event) => update(index, { source: event.target.value as ApiAssertion["source"], target: "" })} className="bg-transparent px-2 outline-none">
                {Object.entries(assertionSourceLabels).map(([value, label]) => <option key={value} value={value} className="bg-bg-card">{label}</option>)}
              </select>
              <input value={item.target} disabled={noTarget} onChange={(event) => update(index, { target: event.target.value })} placeholder={item.source === "json" ? "data.id 或 $.data.id" : item.source === "header" ? "Content-Type" : "无需填写"} className="bg-transparent border-l border-border/30 px-2 outline-none focus:bg-bg-elevated/50 disabled:opacity-40" />
              <select value={item.operator} onChange={(event) => update(index, { operator: event.target.value as ApiAssertion["operator"] })} className="bg-transparent border-l border-border/30 px-2 outline-none">
                {Object.entries(operatorLabels).map(([value, label]) => <option key={value} value={value} className="bg-bg-card">{label}</option>)}
              </select>
              <input value={item.expected} disabled={noExpected} onChange={(event) => update(index, { expected: event.target.value })} placeholder={noExpected ? "无需填写" : "期望值"} className="bg-transparent border-l border-border/30 px-2 outline-none focus:bg-bg-elevated/50 font-mono text-xs disabled:opacity-40" />
              <button onClick={() => onChange(items.filter((_, i) => i !== index))} className="flex items-center justify-center text-text-tertiary hover:text-danger" title="删除断言"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          );
        })}
        <button onClick={() => onChange([...items, newAssertion()])} className="h-10 px-3 flex items-center gap-1.5 text-xs text-text-tertiary hover:text-accent"><Plus className="w-3.5 h-3.5" /> 添加断言</button>
      </div>
    </div>
  );
}

function VariableEditor({ variables, environment, onChange }: { variables: Record<string, string>; environment?: EnvironmentItem; onChange: (value: Record<string, string>) => void }) {
  const entries = Object.entries(variables);
  const environmentEntries = Object.entries(environment?.variables || {});
  const rename = (oldKey: string, newKey: string, value: string) => {
    const next = { ...variables };
    delete next[oldKey];
    next[newKey] = value;
    onChange(next);
  };
  return (
    <div className="h-full overflow-auto min-w-[520px]">
      {/* 查看入口 1：当前用例变量 */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-text-secondary">
        <Braces className="w-3 h-3" /> 当前用例变量 <span className="font-normal text-text-tertiary">({entries.length})</span>
      </div>
      <div className="grid grid-cols-[1fr_1fr_40px] bg-bg-elevated/40 border-b border-border/50 text-[11px] text-text-tertiary"><span className="px-2 py-2">变量名</span><span className="px-2 py-2 border-l border-border/30">变量值</span><span /></div>
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[1fr_1fr_40px] min-h-11 border-b border-border/30">
          <input value={key} onChange={(event) => rename(key, event.target.value, value)} className="bg-transparent px-2 outline-none focus:bg-bg-elevated/50" />
          <input value={value} onChange={(event) => onChange({ ...variables, [key]: event.target.value })} className="bg-transparent border-l border-border/30 px-2 outline-none focus:bg-bg-elevated/50 font-mono text-xs" />
          <button onClick={() => { const next = { ...variables }; delete next[key]; onChange(next); }} className="flex items-center justify-center text-text-tertiary hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <button onClick={() => { let key = "variable"; let index = 1; while (key in variables) key = `variable${++index}`; onChange({ ...variables, [key]: "" }); }} className="h-10 px-3 flex items-center gap-1.5 text-xs text-text-tertiary hover:text-accent"><Plus className="w-3.5 h-3.5" /> 添加变量</button>

      {/* 查看入口 2：接口环境变量（只读，在环境管理页维护） */}
      {environment && environmentEntries.length > 0 && (
        <>
          <div className="mt-2 flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-text-secondary">
            <Globe className="w-3 h-3" /> 接口环境变量：{environment.name}
            <span className="font-normal text-text-tertiary">({environmentEntries.length}) · 只读，请在环境管理页编辑</span>
          </div>
          <div className="grid grid-cols-[1fr_1fr_40px] bg-bg-elevated/40 border-b border-border/50 text-[11px] text-text-tertiary"><span className="px-2 py-2">变量名</span><span className="px-2 py-2 border-l border-border/30">变量值</span><span /></div>
          {environmentEntries.map(([key, value]) => {
            const shadowed = key in variables;
            return (
              <div key={key} className="grid grid-cols-[1fr_1fr_40px] min-h-11 border-b border-border/30 bg-bg-elevated/20">
                <code className="flex items-center gap-1.5 px-2 text-xs text-accent break-all">
                  {key}
                  {shadowed && <span className="shrink-0 rounded bg-warning/15 px-1 py-0.5 text-[10px] text-warning">已覆盖</span>}
                </code>
                <code className="flex items-center border-l border-border/30 px-2 font-mono text-xs text-text-secondary break-all">{value || <span className="text-text-tertiary">（空）</span>}</code>
                <span />
              </div>
            );
          })}
        </>
      )}
      <p className="px-3 py-2 text-[11px] text-text-tertiary">在 URL、参数、Header、Body 和断言中使用 {"{{变量名}}"}；当前用例变量优先于接口环境变量</p>
    </div>
  );
}

function ExtractionEditor({ items, environment, onChange }: { items: ApiExtraction[]; environment?: EnvironmentItem; onChange: (value: ApiExtraction[]) => void }) {
  const update = (index: number, patch: Partial<ApiExtraction>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div className="h-full overflow-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-[1fr_1.4fr_130px_40px] bg-bg-elevated/40 border-b border-border/50 text-[11px] text-text-tertiary">
          <span className="px-2 py-2">变量名</span>
          <span className="px-2 py-2 border-l border-border/30">JSON 路径</span>
          <span className="px-2 py-2 border-l border-border/30">存到</span>
          <span />
        </div>
        {items.map((item, index) => (
          <div key={item.id} className="grid grid-cols-[1fr_1.4fr_130px_40px] min-h-11 border-b border-border/30">
            <input value={item.variable} onChange={(event) => update(index, { variable: event.target.value })} placeholder="token" className="bg-transparent px-2 outline-none focus:bg-bg-elevated/50" />
            <input value={item.path} onChange={(event) => update(index, { path: event.target.value })} placeholder="data.token 或 $.data.token" className="bg-transparent border-l border-border/30 px-2 outline-none focus:bg-bg-elevated/50 font-mono text-xs" />
            <select value={item.scope} onChange={(event) => update(index, { scope: event.target.value as ApiExtraction["scope"] })} className="bg-transparent border-l border-border/30 px-2 outline-none text-xs">
              <option value="case" className="bg-bg-card">当前用例</option>
              <option value="environment" disabled={!environment} className="bg-bg-card">接口环境</option>
            </select>
            <button onClick={() => onChange(items.filter((_, i) => i !== index))} className="flex items-center justify-center text-text-tertiary hover:text-danger" title="删除提取"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        <button onClick={() => onChange([...items, newExtraction()])} className="h-10 px-3 flex items-center gap-1.5 text-xs text-text-tertiary hover:text-accent"><Plus className="w-3.5 h-3.5" /> 添加提取</button>
        <p className="px-3 py-2 text-[11px] text-text-tertiary">执行成功后按 JSON 路径从响应取值并写入指定变量，仅在断言全部通过时生效{environment ? "" : "；未选择接口环境，暂不可存到环境"}</p>
      </div>
    </div>
  );
}

function VariablePreviewModal({
  active,
  environment,
  draft,
  revealSensitive,
  saving,
  onDraftChange,
  onRevealChange,
  onClose,
  onSave,
}: {
  active: ApiTestCase;
  environment?: EnvironmentItem;
  draft: Record<string, VariableDraftItem>;
  revealSensitive: boolean;
  saving: boolean;
  onDraftChange: (draft: Record<string, VariableDraftItem>) => void;
  onRevealChange: (value: boolean) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const resolvedVariables = useMemo(() => {
    const values = { ...(environment?.variables || {}), ...active.variables };
    Object.entries(draft).forEach(([name, item]) => { values[name] = item.value; });
    return values;
  }, [active.variables, draft, environment]);
  const unresolvedCount = Object.keys(draft).filter((name) => !draft[name].value).length;
  const previewUrl = renderTemplatePreview(active.url, resolvedVariables, revealSensitive);
  const previewBody = renderTemplatePreview(active.body, resolvedVariables, revealSensitive);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="variable-preview-title">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-bg-card shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div className="min-w-0">
            <h2 id="variable-preview-title" className="text-sm font-semibold">变量预览与编辑</h2>
            <p className="mt-0.5 truncate text-[11px] text-text-tertiary">
              {environment ? `接口环境：${environment.name}` : "未选择接口环境，变量将保存到当前用例"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onRevealChange(!revealSensitive)}
              className="btn-secondary !px-2.5 !py-1.5"
              title={revealSensitive ? "隐藏敏感变量" : "显示敏感变量"}
            >
              {revealSensitive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="hidden sm:inline">{revealSensitive ? "隐藏敏感值" : "显示敏感值"}</span>
            </button>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded text-text-tertiary hover:bg-bg-elevated hover:text-text" title="关闭">
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className="border-b border-border/50 px-4 py-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium text-text-secondary">解析后的 URL</h3>
              {unresolvedCount > 0 && <span className="text-[11px] text-warning">{unresolvedCount} 个变量尚未填写</span>}
            </div>
            <code className="block min-h-9 break-all rounded border border-border/50 bg-bg-elevated/60 px-3 py-2 text-xs leading-5 text-text-secondary" data-testid="resolved-url">
              {previewUrl || "未填写 URL"}
            </code>
          </section>

          {active.bodyType !== "none" && (
            <section className="border-b border-border/50 px-4 py-3">
              <h3 className="mb-1.5 text-xs font-medium text-text-secondary">解析后的 Body</h3>
              <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words rounded border border-border/50 bg-bg-elevated/60 px-3 py-2 font-mono text-xs leading-5 text-text-secondary" data-testid="resolved-body">
                {previewBody || "Body 为空"}
              </pre>
            </section>
          )}

          <section className="min-w-[620px]">
            <div className="grid grid-cols-[minmax(150px,0.8fr)_160px_minmax(260px,1.5fr)] border-b border-border/50 bg-bg-elevated/40 text-[11px] text-text-tertiary">
              <span className="px-4 py-2">变量名</span>
              <span className="border-l border-border/30 px-3 py-2">保存位置</span>
              <span className="border-l border-border/30 px-3 py-2">变量值</span>
            </div>
            {Object.entries(draft).map(([name, item]) => {
              const sensitive = isSensitiveVariable(name);
              return (
                <div key={name} className="grid min-h-12 grid-cols-[minmax(150px,0.8fr)_160px_minmax(260px,1.5fr)] border-b border-border/30">
                  <div className="flex min-w-0 items-center gap-2 px-4 py-2">
                    <code className="truncate text-xs text-accent">{`{{${name}}}`}</code>
                    {!item.value && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning" aria-label="变量值为空" />}
                  </div>
                  <select
                    value={item.source}
                    onChange={(event) => onDraftChange({ ...draft, [name]: { ...item, source: event.target.value as VariableSource } })}
                    className="border-l border-border/30 bg-transparent px-3 text-xs outline-none"
                    aria-label={`${name} 的保存位置`}
                  >
                    <option value="case" className="bg-bg-card">当前用例</option>
                    <option value="environment" disabled={!environment} className="bg-bg-card">接口环境</option>
                  </select>
                  <div className="relative border-l border-border/30">
                    <input
                      type={sensitive && !revealSensitive ? "password" : "text"}
                      value={item.value}
                      onChange={(event) => onDraftChange({ ...draft, [name]: { ...item, value: event.target.value } })}
                      placeholder="输入变量值"
                      className={`h-full w-full bg-transparent px-3 pr-9 font-mono text-xs outline-none focus:bg-bg-elevated/50 ${!item.value ? "placeholder:text-warning/70" : ""}`}
                      aria-label={`${name} 的变量值`}
                    />
                    {sensitive && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-tertiary">敏感</span>}
                  </div>
                </div>
              );
            })}
            {Object.keys(draft).length === 0 && <div className="py-10 text-center text-xs text-text-tertiary">当前请求中没有引用 {"{{变量}}"}</div>}
          </section>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
          <span className="text-[11px] text-text-tertiary">当前用例变量优先于接口环境变量</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="btn-secondary !py-1.5">取消</button>
            <button type="button" onClick={onSave} disabled={saving || Object.keys(draft).length === 0} className="btn-primary !py-1.5" data-testid="save-variable-preview">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存变量
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ApiTesting() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<ApiTestCase[]>([]);
  const [active, setActive] = useState<ApiTestCase>(newCase());
  const [environments, setEnvironments] = useState<EnvironmentItem[]>([]);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState(() => localStorage.getItem(SELECTED_ENVIRONMENT_KEY) || "");
  const [history, setHistory] = useState<ApiTestExecution[]>([]);
  const [response, setResponse] = useState<ApiTestExecution | null>(null);
  const [search, setSearch] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const [runningCollectionPath, setRunningCollectionPath] = useState<string | null>(null);
  const [draggingCaseId, setDraggingCaseId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<CaseDropTarget>(null);
  const [reordering, setReordering] = useState(false);
  const [requestTab, setRequestTab] = useState<"params" | "headers" | "body" | "assertions" | "variables" | "extractions">("params");
  const [responseTab, setResponseTab] = useState<"body" | "headers" | "assertions" | "history">("body");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [showVariablePreview, setShowVariablePreview] = useState(false);
  const [variableDraft, setVariableDraft] = useState<Record<string, VariableDraftItem>>({});
  const [revealSensitive, setRevealSensitive] = useState(false);
  const [savingVariableDraft, setSavingVariableDraft] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const flash = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const copyResponseBody = async () => {
    if (!response) return;
    const copied = await writeClipboard(response.responseBody);
    flash(copied ? "success" : "error", copied ? "响应内容已复制" : "复制失败，请手动选择内容");
  };

  const loadHistory = async (caseId: string) => {
    if (!caseId) { setHistory([]); return; }
    const result = await apiTestsService.listExecutions({ caseId, limit: 30 });
    if (result.ok) setHistory(result.data.items);
  };

  // 历史列表为瘦身数据，点击后先展示标量字段，再按需拉取完整详情（响应体/断言/Headers）
  const openHistoryExecution = async (item: ApiTestExecution) => {
    setResponse(item);
    const result = await apiTestsService.getExecution(item.id);
    if (result.ok) setResponse((current) => (current?.id === item.id ? result.data : current));
  };

  useEffect(() => {
    (async () => {
      const [caseResult, envResult] = await Promise.all([
        apiTestsService.listCases(),
        environmentsService.list({ scope: "api" }),
      ]);
      const rememberedEnvironmentId = localStorage.getItem(SELECTED_ENVIRONMENT_KEY) || "";
      const availableEnvironments = envResult.ok ? envResult.data.items : [];
      const effectiveEnvironmentId = envResult.ok
        ? (availableEnvironments.some((item) => item.id === rememberedEnvironmentId) ? rememberedEnvironmentId : "")
        : rememberedEnvironmentId;
      if (envResult.ok) setEnvironments(availableEnvironments);
      setSelectedEnvironmentId(effectiveEnvironmentId);
      if (envResult.ok && rememberedEnvironmentId && !effectiveEnvironmentId) localStorage.removeItem(SELECTED_ENVIRONMENT_KEY);

      if (caseResult.ok) {
        setCases(caseResult.data.items);
        if (caseResult.data.items[0]) {
          setActive({ ...caseResult.data.items[0], environmentId: effectiveEnvironmentId });
          void loadHistory(caseResult.data.items[0].id);
        }
      }
      setLoading(false);
    })();
  }, []);

  const filteredCases = useMemo(() => {
    const keyword = search.toLowerCase();
    return cases.filter((item) =>
      item.name.toLowerCase().includes(keyword)
      || item.url.toLowerCase().includes(keyword)
      || item.group.toLowerCase().includes(keyword)
    );
  }, [cases, search]);

  const caseFolders = useMemo(() => buildCaseFolders(filteredCases), [filteredCases]);
  const allCaseFolders = useMemo(() => buildCaseFolders(cases), [cases]);
  const allFolderPaths = useMemo(() => collectFolderPaths(allCaseFolders), [allCaseFolders]);
  const groupOptions = useMemo(
    () => [...new Set(cases.map((item) => item.group.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [cases],
  );
  const selectedEnvironment = useMemo(
    () => environments.find((item) => item.id === selectedEnvironmentId),
    [environments, selectedEnvironmentId],
  );
  const referencedVariableNames = useMemo(
    () => extractTemplateNames([
      active.url,
      active.body,
      ...active.headers.flatMap((item) => item.enabled ? [item.key, item.value] : []),
      ...active.queryParams.flatMap((item) => item.enabled ? [item.key, item.value] : []),
      ...active.assertions.flatMap((item) => [item.target, item.expected]),
    ]),
    [active.assertions, active.body, active.headers, active.queryParams, active.url],
  );

  const patchActive = (patch: Partial<ApiTestCase>) => setActive((current) => ({ ...current, ...patch }));

  const openVariablePreview = () => {
    const environmentVariables = selectedEnvironment?.variables || {};
    const draft = Object.fromEntries(referencedVariableNames.map((name) => {
      if (Object.prototype.hasOwnProperty.call(active.variables, name)) {
        return [name, { value: active.variables[name], source: "case" as const }];
      }
      if (Object.prototype.hasOwnProperty.call(environmentVariables, name)) {
        return [name, { value: environmentVariables[name], source: "environment" as const }];
      }
      return [name, { value: "", source: "case" as const }];
    }));
    setVariableDraft(draft);
    setRevealSensitive(false);
    setShowVariablePreview(true);
  };

  const saveVariableDraft = async () => {
    const nextCaseVariables = { ...active.variables };
    const nextEnvironmentVariables = { ...(selectedEnvironment?.variables || {}) };
    let environmentChanged = false;

    Object.entries(variableDraft).forEach(([name, item]) => {
      if (item.source === "environment" && selectedEnvironment) {
        if (nextEnvironmentVariables[name] !== item.value) environmentChanged = true;
        nextEnvironmentVariables[name] = item.value;
        delete nextCaseVariables[name];
      } else {
        nextCaseVariables[name] = item.value;
      }
    });

    setSavingVariableDraft(true);
    if (environmentChanged && selectedEnvironment) {
      const environmentResult = await environmentsService.update(selectedEnvironment.id, { variables: nextEnvironmentVariables });
      if (!environmentResult.ok) {
        setSavingVariableDraft(false);
        flash("error", environmentResult.error || "接口环境变量保存失败");
        return;
      }
      setEnvironments((current) => current.map((item) => item.id === environmentResult.data.id ? environmentResult.data : item));
    }

    if (active.id) {
      const caseResult = await apiTestsService.updateCase(active.id, {
        variables: nextCaseVariables,
        environmentId: selectedEnvironmentId,
      });
      if (!caseResult.ok) {
        setSavingVariableDraft(false);
        flash("error", caseResult.error || "用例变量保存失败");
        return;
      }
      const savedCase = { ...caseResult.data, environmentId: selectedEnvironmentId };
      setActive(savedCase);
      setCases((current) => current.map((item) => item.id === savedCase.id ? caseResult.data : item));
    } else {
      patchActive({ variables: nextCaseVariables });
    }

    setSavingVariableDraft(false);
    setShowVariablePreview(false);
    flash("success", active.id ? "变量已保存" : "变量已应用，请保存新接口用例");
  };

  const selectEnvironment = (environmentId: string) => {
    setSelectedEnvironmentId(environmentId);
    patchActive({ environmentId });
    if (environmentId) localStorage.setItem(SELECTED_ENVIRONMENT_KEY, environmentId);
    else localStorage.removeItem(SELECTED_ENVIRONMENT_KEY);
  };

  // 运行集合：文件夹即集合，执行该文件夹及其子文件夹的全部用例
  const runCollection = async (path: string) => {
    setRunningCollectionPath(path);
    try {
      const res = await apiTestsService.runCollection({
        collectionPath: path,
        environmentId: selectedEnvironmentId || undefined,
      });
      if (!res.ok) {
        flash("error", res.error || "集合执行失败");
        return;
      }
      const run = res.data;
      flash("success", `集合「${run.collectionName}」已开始执行，共 ${run.total} 个接口`);
      navigate("/reports?tab=api");
    } finally {
      setRunningCollectionPath(null);
    }
  };

  const startNewCase = (group = "默认分组") => {
    setActive({ ...newCase(), group, environmentId: selectedEnvironmentId });
    setResponse(null);
    setHistory([]);
  };

  const selectCase = (item: ApiTestCase) => {
    setActive({ ...item, environmentId: selectedEnvironmentId });
    setResponse(null);
    void loadHistory(item.id);
  };

  const reorderCase = async (targetId: string, position: "before" | "after") => {
    const draggedId = draggingCaseId;
    setDraggingCaseId(null);
    setDropTarget(null);
    if (!draggedId || draggedId === targetId || reordering) return;

    const dragged = cases.find((item) => item.id === draggedId);
    const target = cases.find((item) => item.id === targetId);
    if (!dragged || !target) return;

    const previous = cases;
    const affectedGroups = new Set([dragged.group, target.group]);
    const reordered = cases.filter((item) => item.id !== draggedId);
    const targetIndex = reordered.findIndex((item) => item.id === targetId);
    reordered.splice(targetIndex + (position === "after" ? 1 : 0), 0, { ...dragged, group: target.group });

    const groupIndexes = new Map<string, number>();
    const normalized = reordered.map((item) => {
      if (!affectedGroups.has(item.group)) return item;
      const sortOrder = groupIndexes.get(item.group) || 0;
      groupIndexes.set(item.group, sortOrder + 1);
      return { ...item, sortOrder };
    });
    const updates = normalized
      .filter((item) => affectedGroups.has(item.group))
      .map((item) => ({ id: item.id, group: item.group, sortOrder: item.sortOrder }));

    setCases(normalized);
    const movedActive = normalized.find((item) => item.id === active.id);
    if (movedActive) setActive((current) => ({ ...current, group: movedActive.group, sortOrder: movedActive.sortOrder }));
    setReordering(true);
    const result = await apiTestsService.reorderCases(updates);
    setReordering(false);
    if (result.ok) return;

    setCases(previous);
    const previousActive = previous.find((item) => item.id === active.id);
    if (previousActive) setActive((current) => ({ ...current, group: previousActive.group, sortOrder: previousActive.sortOrder }));
    flash("error", result.error || "排序保存失败");
  };

  const saveCase = async () => {
    if (!active.name.trim()) { flash("error", "请输入接口用例名称"); return; }
    setSaving(true);
    const definition = { ...active, environmentId: selectedEnvironmentId };
    const result = active.id ? await apiTestsService.updateCase(active.id, definition) : await apiTestsService.createCase(definition);
    setSaving(false);
    if (!result.ok) { flash("error", result.error || "保存失败"); return; }
    setActive({ ...result.data, environmentId: selectedEnvironmentId });
    setCases((current) => {
      const exists = current.some((item) => item.id === result.data.id);
      return exists ? current.map((item) => item.id === result.data.id ? result.data : item) : [result.data, ...current];
    });
    flash("success", "接口用例已保存");
  };

  const runCase = async () => {
    if (!active.url.trim()) { flash("error", "请输入请求 URL"); return; }
    setRunning(true);
    const result = await apiTestsService.run({ ...active, environmentId: selectedEnvironmentId });
    setRunning(false);
    if (!result.ok) { flash("error", result.error || "请求执行失败"); return; }
    setResponse(result.data);
    setResponseTab(result.data.status === "failed" ? "assertions" : "body");
    setHistory((current) => [result.data, ...current.filter((item) => item.id !== result.data.id)]);
    flash(result.data.status === "success" ? "success" : "error", result.data.status === "success" ? "请求执行完成" : result.data.errorMessage || "请求或断言失败");
    // 响应提取写入后刷新：成功时回填用例变量（避免覆盖未保存的其它编辑）并刷新环境，让新值立即显示
    if (result.data.status === "success") {
      if (active.id) {
        const refreshed = await apiTestsService.getCase(active.id);
        if (refreshed.ok) setActive((current) => ({ ...current, variables: refreshed.data.variables, extractions: refreshed.data.extractions }));
      }
      const envRefresh = await environmentsService.list();
      if (envRefresh.ok) setEnvironments(envRefresh.data.items);
    }
  };

  const deleteCase = async () => {
    if (!active.id) { startNewCase(); return; }
    if (!await confirmAction({ title: "删除接口用例？", message: `即将删除“${active.name}”。`, detail: "接口用例及其执行历史会被删除，且无法恢复。", confirmLabel: "确认删除" })) return;
    const result = await apiTestsService.removeCase(active.id);
    if (!result.ok) { flash("error", result.error || "删除失败"); return; }
    const remaining = cases.filter((item) => item.id !== active.id);
    setCases(remaining);
    setActive(remaining[0] ? { ...remaining[0], environmentId: selectedEnvironmentId } : { ...newCase(), environmentId: selectedEnvironmentId });
    setResponse(null);
    setHistory([]);
  };

  const importPostman = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      flash("error", "Postman JSON 文件不能超过 10 MB");
      return;
    }
    setImporting(true);
    try {
      let collection: unknown;
      try { collection = JSON.parse(await file.text()); }
      catch { flash("error", "文件不是有效的 JSON"); return; }
      const result = await apiTestsService.importPostman(collection);
      if (!result.ok) { flash("error", result.error || "Postman Collection 导入失败"); return; }
      const importResult = result.data;
      if (importResult.kind === "environment") {
        const importedEnvironment = importResult.environment;
        setEnvironments((current) => {
          const exists = current.some((item) => item.id === importedEnvironment.id);
          return exists
            ? current.map((item) => item.id === importedEnvironment.id ? importedEnvironment : item)
            : [importedEnvironment, ...current];
        });
        selectEnvironment(importedEnvironment.id);
        setImportWarnings(importResult.warnings);
        flash(
          "success",
          `${importResult.updated ? "已更新" : "已导入"}环境 ${importedEnvironment.name}，共 ${importResult.importedVariables} 个变量`
        );
        return;
      }
      const importedItems = importResult.items;
      setCases((current) => [...importedItems, ...current]);
      if (importedItems[0]) {
        setActive({ ...importedItems[0], environmentId: selectedEnvironmentId });
        setResponse(null);
        setHistory([]);
      }
      setImportWarnings(importResult.warnings);
      flash(
        "success",
        `已从 ${importResult.collectionName} 导入 ${importResult.imported} 个接口${importResult.skipped ? `，跳过 ${importResult.skipped} 个` : ""}`
      );
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const requestTabs = [
    { id: "params", label: "Params", count: active.queryParams.filter((item) => item.enabled && item.key).length },
    { id: "headers", label: "Headers", count: active.headers.filter((item) => item.enabled && item.key).length },
    { id: "body", label: "Body" },
    { id: "assertions", label: "断言", count: active.assertions.length },
    { id: "variables", label: "变量", count: Object.keys(active.variables).length },
    { id: "extractions", label: "提取", count: active.extractions.length },
  ] as const;

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>;

  return (
    <div className="h-[calc(100vh-4rem)] lg:h-screen flex flex-col bg-bg animate-fade-in">
      {message && <div className={`fixed bottom-20 lg:bottom-4 right-4 z-50 px-4 py-2.5 rounded border shadow-xl text-sm ${message.type === "success" ? "bg-bg-card border-success/40 text-success" : "bg-bg-card border-danger/40 text-danger"}`}>{message.text}</div>}
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

      <header className="h-14 shrink-0 flex items-center justify-between gap-3 px-3 lg:px-5 bg-bg-card border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <Braces className="w-5 h-5 text-accent shrink-0" />
          <div className="min-w-0"><h1 className="text-xs sm:text-sm font-semibold whitespace-nowrap">接口测试</h1><p className="text-[10px] text-text-tertiary hidden sm:block">请求、断言与响应调试</p></div>
          <select value={active.id} onChange={(event) => { const item = cases.find((entry) => entry.id === event.target.value); if (item) selectCase(item); else startNewCase(); }} className="md:hidden max-w-36 bg-bg-elevated border border-border/50 rounded px-2 py-1 text-xs">
            <option value="">新接口</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.group ? `${item.group} / ` : ""}{item.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            data-testid="postman-file-input"
            onChange={(event) => void importPostman(event.target.files?.[0])}
          />
          <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="btn-secondary !px-3 !py-1.5" title="导入 Postman Collection JSON" data-testid="postman-import-button">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <span className="hidden xl:inline">导入 Postman</span>
          </button>
          <select value={selectedEnvironmentId} onChange={(event) => selectEnvironment(event.target.value)} className="hidden sm:block max-w-52 bg-bg-elevated border border-border/50 rounded px-2 py-1.5 text-xs" title="全局接口测试环境，刷新后仍保留">
            <option value="">不使用环境</option>{environments.map((env) => <option key={env.id} value={env.id}>{env.name}</option>)}
          </select>
          <button onClick={saveCase} disabled={saving} className="btn-secondary !px-3 !py-1.5" data-testid="api-save"><Save className="w-4 h-4" /><span className="hidden sm:inline">保存</span></button>
          <button onClick={runCase} disabled={running} className="btn-primary !px-3 !py-1.5" data-testid="api-run">{running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}<span className="hidden sm:inline">发送</span></button>
        </div>
      </header>

      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/50 bg-bg-card px-3 sm:hidden">
        <span className="text-[11px] text-text-tertiary">全局环境</span>
        <select value={selectedEnvironmentId} onChange={(event) => selectEnvironment(event.target.value)} className="min-w-0 flex-1 rounded border border-border/50 bg-bg-elevated px-2 py-1 text-xs" title="全局接口测试环境，刷新后仍保留">
          <option value="">不使用环境</option>{environments.map((env) => <option key={env.id} value={env.id}>{env.name}</option>)}
        </select>
      </div>

      <div className="flex-1 min-h-0 flex">
        <aside className="hidden md:flex w-64 xl:w-72 shrink-0 flex-col bg-bg-card border-r border-border/60">
          <div className="p-3 border-b border-border/50">
            <button onClick={() => startNewCase()} className="w-full btn-primary !py-1.5"><Plus className="w-4 h-4" />新建接口</button>
            <div className="mt-2 flex items-center gap-1">
              <div className="relative min-w-0 flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称或 URL" className="input !py-1.5 !pl-8 text-xs" /></div>
              <button type="button" onClick={() => setCollapsedFolders(new Set())} className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border/50 text-text-tertiary hover:bg-bg-elevated hover:text-text" title="展开全部文件夹"><ChevronsDown className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => setCollapsedFolders(new Set(allFolderPaths))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border/50 text-text-tertiary hover:bg-bg-elevated hover:text-text" title="折叠全部文件夹"><ChevronsUp className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {filteredCases.length === 0 ? (
              <div className="py-12 text-center text-xs text-text-tertiary"><Folder className="w-7 h-7 mx-auto mb-2 opacity-40" />暂无接口用例</div>
            ) : (
              <ApiCaseFolderTree
                folders={caseFolders}
                activeId={active.id}
                collapsedFolders={collapsedFolders}
                forceExpanded={Boolean(search.trim())}
                onToggle={(path) => setCollapsedFolders((current) => {
                  const next = new Set(current);
                  if (next.has(path)) next.delete(path); else next.add(path);
                  return next;
                })}
                onSelect={selectCase}
                onCreate={startNewCase}
                onSchedule={(path) => navigate(`/schedules?type=api&collection=${encodeURIComponent(path)}`)}
                onRun={(path) => void runCollection(path)}
                runningCollectionPath={runningCollectionPath}
                draggingCaseId={draggingCaseId}
                dropTarget={dropTarget}
                dragDisabled={reordering || Boolean(search.trim())}
                onDragStart={(caseId) => {
                  setDraggingCaseId(caseId);
                  setDropTarget(null);
                }}
                onDragOver={setDropTarget}
                onDrop={(targetId, position) => void reorderCase(targetId, position)}
                onDragEnd={() => {
                  setDraggingCaseId(null);
                  setDropTarget(null);
                }}
              />
            )}
          </div>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col">
          <section className="h-[52%] min-h-[290px] flex flex-col border-b border-border/60">
            <div className="px-3 py-2 flex items-center gap-2 border-b border-border/40 bg-bg-card/40">
              <input value={active.name} onChange={(event) => patchActive({ name: event.target.value })} className="min-w-0 flex-1 bg-transparent outline-none text-sm font-medium" placeholder="接口用例名称" data-testid="api-name" />
              <input list="api-test-groups" value={active.group} onChange={(event) => patchActive({ group: event.target.value })} className="hidden lg:block w-44 bg-bg-elevated border border-border/40 rounded px-2 py-1 text-xs" placeholder="集合路径，如 用户 / 登录" title="接口所属集合，使用 / 创建层级" />
              <datalist id="api-test-groups">{groupOptions.map((group) => <option key={group} value={group} />)}</datalist>
              <button onClick={deleteCase} className="w-7 h-7 flex items-center justify-center rounded text-text-tertiary hover:text-danger hover:bg-danger/10" title="删除接口用例"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="p-3 flex items-stretch gap-2">
              <select value={active.method} onChange={(event) => patchActive({ method: event.target.value })} className={`w-24 sm:w-28 bg-bg-elevated border border-border/60 rounded px-2 font-bold text-xs outline-none ${methodColor[active.method] || ""}`} data-testid="api-method">
                {METHODS.map((method) => <option key={method} value={method} className="bg-bg-card text-text">{method}</option>)}
              </select>
              <div className="relative min-w-0 flex-1">
                <input value={active.url} onChange={(event) => patchActive({ url: event.target.value })} placeholder="https://api.example.com/users 或 /users" className="h-10 w-full rounded border border-border/60 bg-bg-elevated px-3 pr-11 font-mono text-xs outline-none focus:border-accent" data-testid="api-url" />
                <button
                  type="button"
                  onClick={openVariablePreview}
                  className={`absolute right-1 top-1 flex h-8 min-w-8 items-center justify-center gap-1 rounded px-1.5 ${referencedVariableNames.length > 0 ? "text-accent hover:bg-accent/10" : "text-text-tertiary hover:bg-bg-card"}`}
                  title={`变量预览与编辑${referencedVariableNames.length ? `（${referencedVariableNames.length}）` : ""}`}
                  data-testid="variable-preview-button"
                >
                  <Eye className="h-4 w-4" />
                  {referencedVariableNames.length > 0 && <span className="text-[10px] font-semibold">{referencedVariableNames.length}</span>}
                </button>
              </div>
              <button onClick={runCase} disabled={running} className="w-10 h-10 flex items-center justify-center rounded bg-accent hover:bg-accent-hover text-white disabled:opacity-50 sm:hidden" title="发送"><Send className="w-4 h-4" /></button>
            </div>
            <div className="flex items-center gap-1 px-3 border-b border-border/50 overflow-x-auto">
              {requestTabs.map((tab) => <button key={tab.id} onClick={() => setRequestTab(tab.id)} className={`h-9 px-3 text-xs whitespace-nowrap border-b-2 ${requestTab === tab.id ? "border-accent text-accent" : "border-transparent text-text-tertiary hover:text-text"}`}>{tab.label}{"count" in tab && tab.count > 0 ? <span className="ml-1.5 text-[10px] bg-bg-elevated rounded px-1.5">{tab.count}</span> : null}</button>)}
            </div>
            <div className="flex-1 min-h-0 text-xs">
              {requestTab === "params" && <KeyValueEditor items={active.queryParams} onChange={(queryParams) => patchActive({ queryParams })} />}
              {requestTab === "headers" && <KeyValueEditor items={active.headers} onChange={(headers) => patchActive({ headers })} keyPlaceholder="Header 名称" valuePlaceholder="Header 值" />}
              {requestTab === "body" && <div className="h-full flex flex-col"><div className="h-9 flex items-center gap-1 px-3 border-b border-border/30">{(["none", "json", "text", "form"] as const).map((type) => <button key={type} onClick={() => patchActive({ bodyType: type })} className={`px-2 py-1 rounded text-[11px] ${active.bodyType === type ? "bg-accent/15 text-accent" : "text-text-tertiary hover:text-text"}`}>{type === "none" ? "none" : type === "form" ? "x-www-form-urlencoded" : type}</button>)}</div>{active.bodyType === "none" ? <div className="flex-1 flex items-center justify-center text-text-tertiary">当前请求不发送 Body</div> : <textarea value={active.body} onChange={(event) => patchActive({ body: event.target.value })} placeholder={active.bodyType === "json" ? '{\n  "name": "{{username}}"\n}' : active.bodyType === "form" ? "name=test&enabled=true" : "输入请求体"} className="flex-1 resize-none bg-bg-card p-3 font-mono text-xs outline-none" data-testid="api-body" />}</div>}
              {requestTab === "assertions" && <AssertionEditor items={active.assertions} onChange={(assertions) => patchActive({ assertions })} />}
              {requestTab === "variables" && <VariableEditor variables={active.variables} environment={selectedEnvironment} onChange={(variables) => patchActive({ variables })} />}
              {requestTab === "extractions" && <ExtractionEditor items={active.extractions} environment={selectedEnvironment} onChange={(extractions) => patchActive({ extractions })} />}
            </div>
          </section>

          <section className="flex-1 min-h-0 flex flex-col bg-bg-elevated/30">
            <div className="h-10 shrink-0 flex items-center justify-between px-3 border-b border-border/50 bg-bg-card/50">
              <div className="flex items-center h-full overflow-x-auto">
                {(["body", "headers", "assertions", "history"] as const).map((tab) => <button key={tab} onClick={() => setResponseTab(tab)} className={`h-full px-3 text-xs whitespace-nowrap border-b-2 ${responseTab === tab ? "border-accent text-accent" : "border-transparent text-text-tertiary"}`}>{tab === "body" ? "响应 Body" : tab === "headers" ? "响应 Headers" : tab === "assertions" ? "断言结果" : "执行历史"}</button>)}
              </div>
              {response && <div className="flex items-center gap-3 text-[11px] shrink-0"><span className={response.status === "success" ? "text-success" : "text-danger"}>{response.statusCode ? `HTTP ${response.statusCode}` : response.status.toUpperCase()}</span><span className="text-text-tertiary">{response.duration} ms</span><span className="text-text-tertiary hidden sm:inline">{formatBytes(response.responseSize)}</span></div>}
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {!response && responseTab !== "history" ? <div className="h-full flex flex-col items-center justify-center text-text-tertiary"><Send className="w-7 h-7 mb-2 opacity-30" /><span className="text-xs">发送请求后在此查看响应</span></div> : null}
          {response && responseTab === "body" && <div className="relative h-full"><button onClick={() => void copyResponseBody()} className="absolute right-3 top-3 z-10 w-7 h-7 flex items-center justify-center rounded bg-bg-elevated text-text-tertiary hover:text-text" title="复制响应"><Copy className="w-3.5 h-3.5" /></button>{response.errorMessage ? <div className="m-3 p-3 border border-danger/40 bg-danger/10 text-danger rounded text-xs"><AlertCircle className="w-4 h-4 inline mr-2" />{response.errorMessage}</div> : <pre className="p-4 pr-12 text-xs leading-5 font-mono whitespace-pre-wrap break-words text-text-secondary">{prettyResponse(response.responseBody || "")}</pre>}</div>}
              {response && responseTab === "headers" && <div className="min-w-[520px]">{Object.entries(response.responseHeaders || {}).map(([key, value]) => <div key={key} className="grid grid-cols-[200px_1fr] border-b border-border/30 text-xs"><span className="px-3 py-2 text-text-tertiary">{key}</span><code className="px-3 py-2 border-l border-border/30 break-all">{value}</code></div>)}</div>}
              {response && responseTab === "assertions" && <div>{(response.assertionResults || []).length === 0 ? <div className="p-6 text-center text-xs text-text-tertiary">未配置断言</div> : (response.assertionResults || []).map((result) => <div key={result.id} className="flex items-start gap-3 px-4 py-3 border-b border-border/30">{result.passed ? <CheckCircle2 className="w-4 h-4 text-success mt-0.5" /> : <XCircle className="w-4 h-4 text-danger mt-0.5" />}<div className="min-w-0"><div className="text-xs">{assertionSourceLabels[result.source]} · {operatorLabels[result.operator]} <span className="font-mono">{result.expected}</span></div><div className="text-[11px] text-text-tertiary mt-1 break-all">实际值: {result.actual}</div></div></div>)}</div>}
              {responseTab === "history" && <div>{history.length === 0 ? <div className="p-6 text-center text-xs text-text-tertiary">暂无执行历史</div> : history.map((item) => <button key={item.id} onClick={() => { void openHistoryExecution(item); setResponseTab("body"); }} className="w-full grid grid-cols-[28px_1fr_80px_90px] items-center gap-2 px-3 py-2.5 border-b border-border/30 text-left hover:bg-bg-elevated/30">{item.status === "success" ? <CheckCircle2 className="w-4 h-4 text-success" /> : item.status === "failed" ? <XCircle className="w-4 h-4 text-danger" /> : <AlertCircle className="w-4 h-4 text-warning" />}<span className="text-xs truncate"><span className={`mr-2 font-bold ${methodColor[item.method]}`}>{item.method}</span>{item.url}</span><span className="text-[11px] text-text-tertiary"><Clock3 className="w-3 h-3 inline mr-1" />{item.duration} ms</span><span className="text-[10px] text-text-tertiary text-right">{new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}</span></button>)}</div>}
            </div>
          </section>
        </main>
      </div>
      {showVariablePreview && (
        <VariablePreviewModal
          active={active}
          environment={selectedEnvironment}
          draft={variableDraft}
          revealSensitive={revealSensitive}
          saving={savingVariableDraft}
          onDraftChange={setVariableDraft}
          onRevealChange={setRevealSensitive}
          onClose={() => setShowVariablePreview(false)}
          onSave={() => void saveVariableDraft()}
        />
      )}
    </div>
  );
}

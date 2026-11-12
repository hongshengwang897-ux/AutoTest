import { useState, useEffect, useRef, useCallback } from "react";
import {
  Circle,
  Square,
  Play,
  Pause,
  Download,
  Trash2,
  Copy,
  Eye,
  Code,
  Globe,
  MousePointerClick,
  Plus,
  Keyboard,
  CheckCircle,
  Filter,
  ArrowDown,
  Sparkles,
  Tag,
  Loader2,
  ExternalLink,
  Save,
  X,
  RefreshCw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { RecordedStep } from "@/types";
import { useElementStore } from "@/store/elementStore";
import { casesService } from "@/api/services/cases";
import { environmentsService } from "@/api/services/environments";
import { post, get } from "@/api/client";
import { API } from "@/api/endpoints";
import { writeClipboard } from "@/lib/clipboard";

// ---- 录制事件类型 ----

interface RawEvent {
  id: string;
  timestamp: string;
  action: string;
  target: string;
  selector: string;
  selectorType?: string;
  value?: string;
  tagName?: string;
  pageUrl: string;
}

interface EmbeddedElement {
  selector: string;
  selectorType: "css";
  target: string;
  tagName: string;
  type: string;
  value: string;
  bounds: { x: number; y: number; width: number; height: number };
}

interface EmbeddedSnapshot {
  image: string;
  width: number;
  height: number;
  url: string;
  title: string;
}

type ManualAction = "click" | "fill" | "select" | "hover" | "check" | "uncheck" | "assert";

const manualActionLabels: Record<ManualAction, string> = {
  click: "点击",
  fill: "输入",
  select: "选择",
  hover: "悬停",
  check: "勾选",
  uncheck: "取消勾选",
  assert: "断言可见",
};

// ---- 脚本生成 ----

function jsString(value: string | undefined): string {
  return JSON.stringify(value || "");
}

function mergeRawEvents(previous: RawEvent[], incoming: RawEvent[]): RawEvent[] {
  const merged = new Map(previous.map((event) => [event.id, event]));
  for (const event of incoming) merged.set(event.id, event);
  return [...merged.values()];
}

function generatePlaywrightCode(steps: RecordedStep[], initialUrl?: string): string {
  const lines: string[] = [
    "import { test, expect } from '@playwright/test';",
    "",
    "test('录制的测试用例', async ({ page }) => {",
  ];

  // 始终包含初始URL导航（录制在浏览阶段之后开始，初始goto不在事件中）
  if (initialUrl && initialUrl.startsWith("http")) {
    lines.push(`  await page.goto(${jsString(initialUrl)});`);
  }

  let hasNavigate = false;
  for (const step of steps) {
    if (step.action === "navigate") {
      const url = step.target.startsWith("http") ? step.target : step.value || step.target;
      lines.push(`  await page.goto(${jsString(url)});`);
      hasNavigate = true;
    } else if (step.action === "click") {
      lines.push(`  await page.click(${jsString(step.selector)});`);
    } else if (step.action === "fill") {
      lines.push(`  await page.fill(${jsString(step.selector)}, ${jsString(step.value)});`);
    } else if (step.action === "select") {
      lines.push(`  await page.selectOption(${jsString(step.selector)}, ${jsString(step.value)});`);
    } else if (step.action === "hover") {
      lines.push(`  await page.hover(${jsString(step.selector)});`);
    } else if (step.action === "check") {
      lines.push(`  await page.check(${jsString(step.selector)});`);
    } else if (step.action === "uncheck") {
      lines.push(`  await page.uncheck(${jsString(step.selector)});`);
    } else if (step.action === "assert") {
      lines.push(`  await expect(page.locator(${jsString(step.selector)})).toBeVisible();`);
    } else if (step.action === "scroll") {
      lines.push(`  await page.evaluate(() => window.scrollTo(0, ${step.value || 0}));`);
    }
  }

  if (!hasNavigate) {
    lines.unshift("", `  // 未捕获到页面导航，请手动添加 page.goto()`);
  }

  lines.push("});");
  return lines.join("\n");
}

function rawToStep(evt: RawEvent): RecordedStep {
  const code = (() => {
    switch (evt.action) {
      case "navigate":
        return `await page.goto(${jsString(evt.target)});`;
      case "click":
        return evt.selector ? `await page.click(${jsString(evt.selector)});` : `// click on ${evt.target}`;
      case "fill":
        return evt.selector
          ? `await page.fill(${jsString(evt.selector)}, ${jsString(evt.value)});`
          : `// fill ${evt.target}`;
      case "select":
        return evt.selector
          ? `await page.selectOption(${jsString(evt.selector)}, ${jsString(evt.value)});`
          : `// select ${evt.target}`;
      case "hover":
        return evt.selector ? `await page.hover(${jsString(evt.selector)});` : `// hover ${evt.target}`;
      case "check":
        return evt.selector ? `await page.check(${jsString(evt.selector)});` : `// check ${evt.target}`;
      case "uncheck":
        return evt.selector ? `await page.uncheck(${jsString(evt.selector)});` : `// uncheck ${evt.target}`;
      case "assert":
        return evt.selector
          ? `await expect(page.locator(${jsString(evt.selector)})).toBeVisible();`
          : `// assert ${evt.target}`;
      case "scroll":
        return `await page.evaluate(() => window.scrollTo(0, ${evt.value || 0}));`;
      default:
        return `// ${evt.action}: ${evt.target}`;
    }
  })();

  return {
    id: evt.id,
    timestamp: evt.timestamp,
    action: (evt.action as any) || "click",
    target: evt.target,
    selector: evt.selector,
    value: evt.value,
    description: evt.target ? `${evt.action} ${evt.target}` : evt.action,
    generatedCode: code,
  };
}

// ---- 图标映射 ----

const actionIcons: Record<string, typeof MousePointerClick> = {
  click: MousePointerClick,
  fill: Keyboard,
  select: Filter,
  hover: MousePointerClick,
  check: CheckCircle,
  uncheck: CheckCircle,
  navigate: Globe,
  assert: Eye,
  scroll: ArrowDown,
};

const actionLabels: Record<string, string> = {
  click: "点击", fill: "输入", select: "选择", hover: "悬停",
  check: "勾选", uncheck: "取消勾选", navigate: "导航", assert: "断言", scroll: "滚动",
};

// ---- 主组件 ----

export default function Recorder() {
  const navigate = useNavigate();
  const addElements = useElementStore((s) => s.addElements);

  const [url, setUrl] = useState("https://example.com");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<EmbeddedSnapshot | null>(null);
  const [selectedElement, setSelectedElement] = useState<EmbeddedElement | null>(null);
  const [selectedAction, setSelectedAction] = useState<ManualAction>("click");
  const [selectedValue, setSelectedValue] = useState("");
  const [inspecting, setInspecting] = useState(false);
  const [performing, setPerforming] = useState(false);
  const [cancellingVisit, setCancellingVisit] = useState(false);
  const [refreshingSnapshot, setRefreshingSnapshot] = useState(false);
  // idle → connecting → browsing → recording → stopped
  const [phase, setPhase] = useState<"idle" | "connecting" | "browsing" | "recording" | "paused" | "stopped">("idle");
  const [steps, setSteps] = useState<RecordedStep[]>([]);
  const [rawEvents, setRawEvents] = useState<RawEvent[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 保存用例对话框
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [caseName, setCaseName] = useState("");
  const [caseDescription, setCaseDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedCaseId, setSavedCaseId] = useState<string | null>(null);
  const [savingElements, setSavingElements] = useState(false);
  const [elementNotice, setElementNotice] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEventTsRef = useRef<number>(0);
  const deletedEventIdsRef = useRef<Set<string>>(new Set());
  const snapshotRequestRef = useRef(0);
  const snapshotAppliedRef = useRef(0);

  const refreshSnapshot = useCallback(async (showLoading = false) => {
    if (!sessionId || !["browsing", "recording", "paused"].includes(phase)) return;
    const requestId = ++snapshotRequestRef.current;
    if (showLoading) setRefreshingSnapshot(true);
    const res = await get<EmbeddedSnapshot>(API.recorder.snapshot(sessionId), {
      timeout: 15000,
      params: { timestamp: Date.now() },
    });
    if (res.ok && requestId > snapshotAppliedRef.current) {
      snapshotAppliedRef.current = requestId;
      setSnapshot(res.data);
    }
    if (showLoading) setRefreshingSnapshot(false);
  }, [phase, sessionId]);

  // 轮询录制事件（仅在 recording 阶段）
  useEffect(() => {
    if (phase !== "recording" || !sessionId) return;

    const poll = async () => {
      try {
        const res = await get<{ events: RawEvent[]; status: string }>(
          API.recorder.events(sessionId),
          { params: { since: lastEventTsRef.current || undefined } }
        );
        if (!res.ok) return;
        const newEvents = res.data.events.filter((event) => !deletedEventIdsRef.current.has(event.id));
        if (newEvents.length > 0) {
          setRawEvents((prev) => mergeRawEvents(prev, newEvents));
          const maxTs = Math.max(...newEvents.map((e) => Date.parse(e.timestamp)));
          if (maxTs > lastEventTsRef.current) lastEventTsRef.current = maxTs;
        }
      } catch {}
    };

    poll();
    pollRef.current = setInterval(poll, 800);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [phase, sessionId]);

  // 内嵌页面画布：截图来自同一个 Playwright 会话，不受目标站点 iframe 限制。
  useEffect(() => {
    if (!sessionId || !["browsing", "recording", "paused"].includes(phase)) {
      snapshotAppliedRef.current = ++snapshotRequestRef.current;
      setSnapshot(null);
      return;
    }
    void refreshSnapshot();
    const timer = setInterval(() => void refreshSnapshot(), phase === "recording" ? 700 : 1200);
    return () => clearInterval(timer);
  }, [phase, refreshSnapshot, sessionId]);

  // raw → steps（去重 fill/select）
  useEffect(() => {
    const merged: RecordedStep[] = [];
    const seen: Record<string, number> = {};
    for (const evt of rawEvents) {
      if (evt.action === "scroll" && !evt.selector) continue;
      if (evt.action === "fill" || evt.action === "select") {
        const key = `${evt.action}:${evt.selector}`;
        const prevIdx = seen[key];
        if (prevIdx !== undefined && merged[prevIdx]) {
          merged[prevIdx] = rawToStep(evt);
          continue;
        }
        seen[key] = merged.length;
      }
      merged.push(rawToStep(evt));
    }
    setSteps(merged);
  }, [rawEvents]);

  // ---- 阶段 1: 访问页面 ----
  const handleVisit = async () => {
    setError(null);
    setPhase("connecting");

    let normalizedUrl = url.trim();
    if (!normalizedUrl) {
      setError("请输入要访问的 URL");
      setPhase("idle");
      return;
    }
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      const host = normalizedUrl.split(/[/:]/, 1)[0].toLowerCase();
      const isLocal = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" ||
        /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
      normalizedUrl = `${isLocal ? "http" : "https"}://${normalizedUrl}`;
      setUrl(normalizedUrl);
    }

    const res = await post<{ sessionId: string; status: string; warning?: string }>(API.recorder.visit, {
      url: normalizedUrl,
      headless: true,
    }, { timeout: 45000 });

    if (!res.ok) {
      setError(res.error || "访问失败");
      setPhase("idle");
      return;
    }

    setSessionId(res.data.sessionId);
    setSelectedElement(null);
    setSnapshot(null);
    if (res.data.warning) setError(res.data.warning);
    setPhase("browsing");
  };

  const executeEmbeddedAction = async (element: EmbeddedElement, action: ManualAction, value: string) => {
    if (!sessionId || phase !== "recording") return;
    setPerforming(true);
    const res = await post<{ event: RawEvent; snapshot: EmbeddedSnapshot | null }>(API.recorder.action(sessionId), {
      action,
      selector: element.selector,
      value,
      target: element.target,
      tagName: element.tagName,
      x: element.bounds.x + element.bounds.width / 2,
      y: element.bounds.y + element.bounds.height / 2,
    }, { timeout: 45000 });
    setPerforming(false);
    if (!res.ok) { setError(res.error || "页面操作失败"); return; }
    setRawEvents((previous) => mergeRawEvents(previous, [res.data.event]));
    if (res.data.snapshot) {
      snapshotAppliedRef.current = snapshotRequestRef.current;
      setSnapshot(res.data.snapshot);
    }
    setError(null);
    void refreshSnapshot(true);
  };

  const handleViewportClick = async (event: React.MouseEvent<HTMLImageElement>) => {
    if (phase !== "recording" || !sessionId || !snapshot) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * snapshot.width;
    const y = ((event.clientY - rect.top) / rect.height) * snapshot.height;
    setInspecting(true);
    const res = await post<{ element: EmbeddedElement | null }>(API.recorder.inspect(sessionId), { x, y });
    setInspecting(false);
    if (!res.ok) { setError(res.error || "元素识别失败"); return; }
    if (!res.data.element) { setSelectedElement(null); setError("当前位置没有可识别元素"); return; }
    const element = res.data.element;
    const action: ManualAction = element.type === "input" || element.tagName === "textarea"
      ? "fill"
      : element.type === "select" || element.tagName === "select"
        ? "select"
        : element.type === "checkbox"
          ? "check"
          : "click";
    setSelectedElement(element);
    setSelectedValue(element.value || "");
    setSelectedAction(action);
    setError(null);
    await executeEmbeddedAction(element, action, element.value || "");
  };

  const handleEmbeddedAction = async () => {
    if (!sessionId || !selectedElement) return;
    if (phase !== "recording") { setError("请先点击“开始录制”，再添加页面操作"); return; }
    await executeEmbeddedAction(selectedElement, selectedAction, selectedValue);
  };

  // ---- 阶段 2: 开始录制 ----
  const handleStartRecording = async () => {
    if (!sessionId) return;
    setError(null);

    const res = await post<{ status: string }>(API.recorder.start(sessionId));
    if (!res.ok) {
      setError(res.error || "启动录制失败");
      return;
    }

    setRawEvents([]);
    setSteps([]);
    setSelectedElement(null);
    setSelectedValue("");
    deletedEventIdsRef.current.clear();
    lastEventTsRef.current = 0;
    setPhase("recording");
  };

  const handleCancelVisit = async () => {
    if (!sessionId || phase !== "browsing") return;
    setCancellingVisit(true);
    setError(null);
    const res = await post<{ status: string }>(API.recorder.close(sessionId));
    setCancellingVisit(false);
    if (!res.ok) { setError(res.error || "取消访问失败"); return; }
    setSessionId(null);
    setSnapshot(null);
    setSelectedElement(null);
    setSelectedValue("");
    setPhase("idle");
  };

  // 停止录制
  const handleStop = async () => {
    if (pollRef.current) clearInterval(pollRef.current);

    if (sessionId) {
      try {
        const res = await post<{ events: RawEvent[] }>(API.recorder.stop(sessionId));
        if (res.ok && res.data.events.length > 0) {
          const availableEvents = res.data.events.filter((event) => !deletedEventIdsRef.current.has(event.id));
          setRawEvents((prev) => mergeRawEvents(prev, availableEvents));
        }
      } catch {}
      // 关闭浏览器
      post(API.recorder.close(sessionId)).catch(() => {});
    }

    setPhase("stopped");
  };

  // 暂停 / 继续
  const handlePause = async () => {
    if (!sessionId) return;
    const pausing = phase === "recording";
    const res = await post<{ status: string }>(pausing ? API.recorder.pause(sessionId) : API.recorder.resume(sessionId));
    if (res.ok) {
      setPhase(pausing ? "paused" : "recording");
    }
    else setError(res.error || (pausing ? "暂停失败" : "继续录制失败"));
  };

  // 清空步骤
  const handleClear = () => {
    rawEvents.forEach((event) => deletedEventIdsRef.current.add(event.id));
    setSteps([]);
    setRawEvents([]);
    lastEventTsRef.current = 0;
  };

  const handleDeleteStep = (step: RecordedStep) => {
    const matchingIds = rawEvents
      .filter((event) => event.id === step.id || ((step.action === "fill" || step.action === "select") && event.action === step.action && event.selector === step.selector))
      .map((event) => event.id);
    matchingIds.forEach((id) => deletedEventIdsRef.current.add(id));
    setRawEvents((current) => current.filter((event) => !matchingIds.includes(event.id)));
  };

  const generatedScript = generatePlaywrightCode(steps, url);

  const handleCopyScript = async () => {
    if (await writeClipboard(generatedScript)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setError("复制失败，请手动选择脚本内容");
    }
  };

  const handleExportFile = () => {
    const blob = new Blob([generatedScript], { type: "text/typescript" });
    const url_ = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url_;
    a.download = "recorded-test.spec.ts";
    a.click();
    URL.revokeObjectURL(url_);
  };

  const handleSaveElements = async () => {
    setError(null);
    setElementNotice(null);
    const elements = steps
      .filter((s) => s.selector && s.target)
      .map((s) => ({
        name: s.target.slice(0, 40),
        type: s.action === "fill" ? "input" : s.action === "select" ? "select" : s.action === "check" || s.action === "uncheck" ? "checkbox" : "button",
        selector: s.selector,
        selectorType: "css" as const,
        page: (() => { try { return new URL(url).pathname || "/"; } catch { return "/"; } })(),
        tags: ["录制"],
        source: "recorder" as const,
      }));
    if (elements.length === 0) {
      setError("当前录制步骤中没有可保存的页面元素");
      return;
    }
    setSavingElements(true);
    const result = await addElements(elements);
    setSavingElements(false);
    if (result.ok) setElementNotice(`已保存 ${elements.length} 个元素到元素库`);
    else setError(result.error || "元素保存失败");
  };

  // 保存用例
  const handleOpenSaveDialog = () => {
    // 默认名称：域名 + 时间
    let host = "";
    try { host = new URL(url).hostname; } catch {}
    setCaseName(host ? `${host}_录制用例_${new Date().toLocaleDateString("zh-CN")}` : `录制用例_${new Date().toLocaleString("zh-CN")}`);
    setCaseDescription(`由录制器自动生成，包含 ${steps.length} 个步骤`);
    setSavedCaseId(null);
    setShowSaveDialog(true);
  };

  const handleSaveCase = async () => {
    if (!caseName.trim()) return;
    setSaving(true);

    // 自动匹配/创建环境
    let envId = "";
    try {
      const envsRes = await environmentsService.list({ scope: "platform" });
      if (envsRes.ok) {
        // 尝试从URL提取origin作为匹配key
        let origin = "";
        try { origin = new URL(url).origin; } catch {}
        const match = origin
          ? envsRes.data.items.find((e: any) => e.url && e.url.startsWith(origin))
          : null;
        if (match) {
          envId = match.id;
        } else if (origin) {
          // 自动创建环境
          const host = new URL(url).hostname;
          const created = await environmentsService.create({
            name: `录制环境 - ${host}`,
            url: origin,
            type: "dev",
            status: "online",
          } as any);
          if (created.ok) envId = created.data.id;
        }
      }
    } catch {}

    const res = await casesService.create({
      name: caseName.trim(),
      description: caseDescription.trim() || `${steps.length} 个录制步骤`,
      script: generatedScript,
      language: "playwright",
      tags: ["录制", url],
      group: "录制用例",
      status: "draft",
      environmentId: envId || undefined,
    });
    setSaving(false);
    if (res.ok) {
      setSavedCaseId(res.data.id);
      setTimeout(() => setShowSaveDialog(false), 1200);
    } else {
      setError(res.error || "保存失败");
    }
  };

  const uniquePages = [...new Set(rawEvents.map((e) => e.pageUrl))];

  const statusText = {
    idle: "",
    connecting: "正在打开浏览器...",
    browsing: "🟢 浏览中 — 在内嵌页面中选择元素",
    recording: "🔴 录制中 — 您的操作将被捕获",
    paused: "⏸ 录制已暂停",
    stopped: "⏹ 录制已停止",
  }[phase];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold mb-1">录制中心</h1>
          <p className="text-sm text-text-tertiary">
            {statusText || "真实浏览器录制，所见即所得"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {steps.length > 0 && (
            <button onClick={handleSaveElements} disabled={savingElements} className="btn-secondary text-xs">
              <Tag className="w-3.5 h-3.5" /> {savingElements ? "保存中..." : "保存元素"}
            </button>
          )}
          <button onClick={() => navigate("/elements")} className="btn-secondary text-xs">
            <Sparkles className="w-3.5 h-3.5" /> 元素库
          </button>
        </div>
      </div>

      {elementNotice && <div className="px-4 py-2.5 rounded-lg border border-success/30 bg-success/10 text-success text-sm">{elementNotice}</div>}

      {/* URL Bar + Controls */}
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-bg-elevated rounded-lg px-3 py-2 flex-1">
            <Globe className="w-4 h-4 text-text-tertiary shrink-0" />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={phase !== "idle" && phase !== "stopped"}
              className="bg-transparent text-sm outline-none flex-1 text-text placeholder:text-text-tertiary"
            />
          </div>

          {/* 连接中（禁用状态按钮） */}
          {phase === "connecting" && (
            <button disabled className="btn-secondary min-w-[100px] opacity-60">
              <Loader2 className="w-4 h-4 animate-spin" /> 打开中...
            </button>
          )}

          {/* 阶段 1: 访问按钮 */}
          {(phase === "idle" || phase === "stopped") && (
            <button onClick={handleVisit} className="btn-secondary min-w-[100px]">
              <ExternalLink className="w-4 h-4" /> 访问
            </button>
          )}

          {/* 阶段 2: 浏览中 → 开始录制 */}
          {phase === "browsing" && (
            <button onClick={handleStartRecording} className="btn-primary min-w-[120px]">
              <Circle className="w-4 h-4 text-danger" fill="currentColor" />
              开始录制
            </button>
          )}

          {sessionId && ["browsing", "recording", "paused"].includes(phase) && (
            <button
              type="button"
              onClick={() => void handleCancelVisit()}
              disabled={phase !== "browsing" || cancellingVisit}
              className="btn-secondary min-w-[108px] disabled:cursor-not-allowed disabled:opacity-40"
              title={phase === "browsing" ? "关闭当前访问页面" : "录制开始后不能取消访问"}
              data-testid="cancel-recorder-visit"
            >
              {cancellingVisit ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              {cancellingVisit ? "取消中" : "取消访问"}
            </button>
          )}

          {/* 录制中 → 暂停 + 停止 */}
          {(phase === "recording" || phase === "paused") && (
            <>
              <button onClick={handlePause} className="btn-secondary">
                {phase === "paused" ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                {phase === "paused" ? "继续" : "暂停"}
              </button>
              <button onClick={handleStop} className="btn-primary bg-danger hover:bg-danger/80 border-danger min-w-[100px]">
                <Square className="w-4 h-4" fill="currentColor" /> 停止
              </button>
            </>
          )}
        </div>

        {error && (
          <p className={`text-xs mt-2 ${phase === 'browsing' ? 'text-warning' : 'text-danger'}`}>
            {phase === 'browsing' ? '⚠️ ' : '❌ '}{error}
          </p>
        )}
        {phase === "browsing" && (
          <p className="text-xs text-text-tertiary mt-2">
            💡 页面已加载。点击「开始录制」后，可在中间画布选取元素并添加操作。
          </p>
        )}
        {phase === "recording" && (
          <p className="text-xs text-text-tertiary mt-2">
            🔴 正在录制您的每一步操作。点击、输入、导航等都会被实时捕获。
          </p>
        )}
      </div>

      {sessionId && ["browsing", "recording", "paused"].includes(phase) && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 bg-bg-card/60 px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <Globe className="h-4 w-4 shrink-0 text-accent" />
              <span className="text-sm font-semibold">内嵌页面</span>
              <span className="truncate text-xs text-text-tertiary">{snapshot?.title || snapshot?.url || url}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] text-text-tertiary">
                {refreshingSnapshot ? "刷新中..." : phase === "browsing" ? "开始录制后可选择元素" : phase === "paused" ? "录制已暂停" : inspecting ? "识别中..." : "点击页面元素进行选择"}
              </span>
              <button
                type="button"
                onClick={() => void refreshSnapshot(true)}
                disabled={refreshingSnapshot}
                className="flex h-7 w-7 items-center justify-center rounded text-text-tertiary hover:bg-bg-elevated hover:text-text disabled:opacity-40"
                title="立即刷新内嵌页面"
                data-testid="refresh-recorder-snapshot"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshingSnapshot ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
          <div className="grid min-h-[520px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-h-[360px] items-start justify-center overflow-auto bg-[#0D1117] p-3">
              {snapshot ? (
                <div className="relative w-full max-w-[1280px] leading-none">
                  <img
                    src={snapshot.image}
                    alt="录制页面"
                    onClick={phase === "recording" ? (event) => void handleViewportClick(event) : undefined}
                    className={`block h-auto w-full rounded border border-border/50 shadow-lg ${phase === "recording" ? "cursor-crosshair" : "cursor-not-allowed"}`}
                  />
                  {selectedElement && (
                    <span
                      className="pointer-events-none absolute rounded border-2 border-accent bg-accent/10 shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
                      style={{
                        left: `${(selectedElement.bounds.x / snapshot.width) * 100}%`,
                        top: `${(selectedElement.bounds.y / snapshot.height) * 100}%`,
                        width: `${(selectedElement.bounds.width / snapshot.width) * 100}%`,
                        height: `${(selectedElement.bounds.height / snapshot.height) * 100}%`,
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center py-28 text-sm text-text-tertiary">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载页面画布...
                </div>
              )}
            </div>
            <aside className="border-t border-border/60 bg-bg-card p-4 lg:border-l lg:border-t-0">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">选中元素</h3>
                {selectedElement && <button onClick={() => setSelectedElement(null)} className="btn-ghost p-1 text-text-tertiary" title="清除选择"><X className="h-3.5 w-3.5" /></button>}
              </div>
              {selectedElement ? (
                <div className="space-y-3">
                  <div className="rounded border border-accent/30 bg-accent/5 p-3">
                    <div className="text-sm font-medium break-words">{selectedElement.target || selectedElement.tagName}</div>
                    <code className="mt-1 block break-all text-[11px] text-text-tertiary">{selectedElement.selector}</code>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-text-tertiary">操作</label>
                    <select value={selectedAction} onChange={(event) => setSelectedAction(event.target.value as ManualAction)} className="input w-full">
                      {Object.entries(manualActionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  {(selectedAction === "fill" || selectedAction === "select") && (
                    <div>
                      <label className="mb-1 block text-xs text-text-tertiary">{selectedAction === "fill" ? "输入值" : "选项值"}</label>
                      <input value={selectedValue} onChange={(event) => setSelectedValue(event.target.value)} className="input w-full" placeholder="输入操作值" />
                    </div>
                  )}
                  <button onClick={() => void handleEmbeddedAction()} disabled={performing || phase !== "recording"} className="btn-primary w-full">
                    {performing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {phase !== "recording" ? "开始录制后可操作" : "执行并记录"}
                  </button>
                </div>
              ) : (
                <div className="flex min-h-52 items-center justify-center text-center text-xs leading-5 text-text-tertiary">
                  {phase === "recording" ? <>点击中间页面中的按钮、输入框或链接，<br />默认操作会自动记录为步骤。</> : phase === "paused" ? "录制已暂停，继续录制后可重新选取元素。" : "点击开始录制后，才能选取页面元素并记录步骤。"}
                </div>
              )}
            </aside>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Steps list */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">录制步骤 ({steps.length})</h3>
            <div className="flex items-center gap-1">
              {steps.length > 0 && phase !== "recording" && (
                <button onClick={handleClear} className="btn-ghost p-1.5 text-text-tertiary" title="清空">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {steps.length === 0 ? (
            <div className="text-center py-12 text-text-tertiary">
              <MousePointerClick className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {phase === "recording" ? "等待操作..." : phase === "browsing" ? "准备就绪后点击「开始录制」" : "先点击「访问」打开页面"}
              </p>
              <p className="text-xs mt-1 opacity-60">点击、输入、导航等操作将被实时捕获</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-[500px] overflow-auto">
              {steps.map((step, i) => {
                const Icon = actionIcons[step.action] || MousePointerClick;
                const label = actionLabels[step.action] || step.action;
                return (
                  <div key={step.id || i} data-event-id={step.id} className="flex items-start gap-3 p-2 rounded hover:bg-bg-elevated/50 transition-colors group">
                    <span className="w-5 h-5 rounded bg-bg-elevated flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-3 h-3 text-accent" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary">
                          {label}
                        </span>
                        <span className="text-sm text-text truncate">{step.target || step.selector}</span>
                      </div>
                      {step.selector && (
                        <code className="text-xs text-text-tertiary mt-0.5 block truncate">{step.selector}</code>
                      )}
                      {step.value && (
                        <span className="text-xs text-accent mt-0.5 block truncate">值: {step.value}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteStep(step)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-tertiary opacity-70 hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                      title="删除步骤"
                      aria-label={`删除步骤 ${i + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Script preview */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold">生成脚本</h3>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleCopyScript} className="btn-ghost p-1.5 text-text-tertiary" title="复制脚本">
                {copied ? <CheckCircle className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              {steps.length > 0 && (
                <>
                  <button onClick={handleExportFile} className="btn-ghost p-1.5 text-text-tertiary" title="导出文件">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={handleOpenSaveDialog} className="btn-ghost p-1.5 text-accent" title="保存为用例">
                    <Save className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          <pre className="bg-bg-elevated rounded-lg p-4 text-xs text-text-secondary overflow-auto max-h-[500px] leading-relaxed font-mono">
            {generatedScript}
          </pre>
        </div>
      </div>

      {/* Page URLs */}
      {uniquePages.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-2">访问的页面 ({uniquePages.length})</h3>
          <div className="flex flex-wrap gap-2">
            {uniquePages.map((u) => (
              <span key={u} className="text-xs px-2 py-1 bg-bg-elevated rounded text-text-secondary truncate max-w-[400px]">
                {u}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 保存用例对话框 */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSaveDialog(false)}>
          <div className="card p-6 w-full max-w-md mx-4 animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">
                {savedCaseId ? "保存成功" : "保存为用例"}
              </h3>
              <button onClick={() => setShowSaveDialog(false)} className="btn-ghost p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {savedCaseId ? (
              <div className="text-center py-6">
                <CheckCircle className="w-12 h-12 text-success mx-auto mb-3" />
                <p className="text-sm text-text-secondary mb-4">用例已保存，可在 UI自动化测试 中查看和编辑</p>
                <div className="flex gap-2 justify-center">
                  <button onClick={() => { setShowSaveDialog(false); navigate("/cases"); }} className="btn-primary text-sm">
                    前往 UI自动化测试
                  </button>
                  <button onClick={() => setShowSaveDialog(false)} className="btn-secondary text-sm">
                    继续录制
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-text-tertiary mb-1 block">用例名称</label>
                    <input
                      type="text"
                      value={caseName}
                      onChange={(e) => setCaseName(e.target.value)}
                      placeholder="输入用例名称..."
                      className="w-full bg-bg-elevated rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-tertiary mb-1 block">描述（可选）</label>
                    <textarea
                      value={caseDescription}
                      onChange={(e) => setCaseDescription(e.target.value)}
                      placeholder="描述这个测试用例..."
                      rows={3}
                      className="w-full bg-bg-elevated rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent resize-none"
                    />
                  </div>
                  <div className="text-xs text-text-tertiary">
                    将保存 {steps.length} 个步骤的 Playwright 脚本
                  </div>
                </div>
                <div className="flex gap-2 justify-end mt-4">
                  <button onClick={() => setShowSaveDialog(false)} className="btn-secondary text-sm">取消</button>
                  <button onClick={handleSaveCase} disabled={saving || !caseName.trim()} className="btn-primary text-sm min-w-[80px]">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "保存"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

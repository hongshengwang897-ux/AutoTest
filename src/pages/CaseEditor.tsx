import { useState, useEffect, useRef, useMemo } from "react";
import type { DragEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Save,
  X,
  FileCode,
  Settings2,
  ChevronDown,
  PlayCircle,
  History,
  Library,
  Search,
  Copy,
  MousePointerClick,
  Keyboard,
  Eye,
  Filter,
  Tag,
  Sparkles,
  Loader2,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Trash2,
  Plus,
  List,
  GitBranch,
  ImagePlus,
} from "lucide-react";
import { elementTypeLabels } from "@/data/elements";
import { useElementStore, type ElementItem } from "@/store/elementStore";
import { casesService } from "@/api/services";
import { environmentsService } from "@/api/services";
import type { CaseAssertionType, CaseItem, EnvironmentItem } from "@/api/services";
import type { ElementAction } from "@/types";
import { writeClipboard } from "@/lib/clipboard";
// 步骤 ⇄ 脚本双向转换的纯函数集中在此，便于复用与单测
import {
  type StepItem,
  assertionGroups,
  assertionMetaMap,
  getAssertionType,
  stepActionMetaMap,
  toWaitMilliseconds,
  nextStepId,
  createStep,
  normalizeStep,
  parseScriptToSteps,
  preserveStepImages,
  extractTestName,
  generateScriptFromSteps,
} from "@/lib/scriptCodegen";

const actionGenerators: Record<ElementAction, (selector: string, value?: string) => string> = {
  click: (sel) => `await page.click('${sel}');`,
  fill: (sel, val) => `await page.fill('${sel}', '${val || ""}');`,
  select: (sel, val) => `await page.selectOption('${sel}', '${val || ""}');`,
  hover: (sel) => `await page.hover('${sel}');`,
  check: (sel) => `await page.locator('${sel}').check();`,
  uncheck: (sel) => `await page.locator('${sel}').uncheck();`,
  navigate: (sel) => `await page.goto('${sel}');`,
  assert: (sel) => `await expect(page.locator('${sel}')).toBeVisible();`,
  scroll: (sel) => `await page.locator('${sel}').scrollIntoView();`,
  wait: (_sel, val) => `await page.waitForTimeout(${toWaitMilliseconds(val)});`,
};

// ──── 图片上传辅助 ────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

async function normalizeUploadedImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
  if (file.size > 6 * 1024 * 1024) throw new Error("图片不能超过 6 MB");
  const source = await fileToDataUrl(file);
  const image = document.createElement("img");
  image.src = source;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法处理这张图片");
  context.drawImage(image, 0, 0);
  const png = canvas.toDataURL("image/png");
  if (png.length > 8_000_000) throw new Error("转换后的图片过大，请裁剪后重新上传");
  return png;
}

// ──── 从元素库插入的弹窗 ────

function InsertElementPopover({
  elements,
  onInsert,
  onClose,
}: {
  elements: ElementItem[];
  onInsert: (el: ElementItem) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // 延迟挂载避免按钮点击立即关闭弹窗
    const id = setTimeout(() => document.addEventListener("click", handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("click", handler);
    };
  }, [onClose]);

  const filtered = elements.filter(
    (el) =>
      (el.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (el.selector || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-1 w-80 bg-bg-card border border-border/60 rounded-lg shadow-xl z-50"
    >
      <div className="p-2 border-b border-border/60">
        <input
          type="text"
          placeholder="搜索元素…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-bg-elevated border border-border/60 rounded px-2 py-1.5 text-xs outline-none focus:border-accent/50"
          autoFocus
        />
      </div>
      <div className="max-h-60 overflow-y-auto">
        {filtered.slice(0, 50).map((el) => (
          <button
            key={el.id}
            onClick={() => onInsert(el)}
            className="w-full text-left px-3 py-2 hover:bg-bg-elevated transition-colors border-b border-border/20 last:border-0"
          >
            <div className="text-xs font-medium text-text truncate">{el.name}</div>
            <code className="text-[10px] text-accent truncate block mt-0.5">
              {el.selector}
            </code>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-6 text-xs text-text-tertiary">
            {elements.length === 0 ? "元素库为空，请先录制或导入元素" : "无匹配元素"}
          </div>
        )}
      </div>
    </div>
  );
}

// ──── 主组件 ────

const INITIAL_SCRIPT = `import { test, expect } from '@playwright/test';

test('新建测试用例', async ({ page }) => {
  // TODO: 编写测试步骤
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
});`;

export default function CaseEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const elements = useElementStore((s) => s.elements);

  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [envs, setEnvs] = useState<EnvironmentItem[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [script, setScript] = useState(INITIAL_SCRIPT);
  const [language, setLanguage] = useState<"typescript" | "python">("typescript");
  const [tags, setTags] = useState("");
  const [group, setGroup] = useState("");
  const [envId, setEnvId] = useState("");
  const [preconditionCaseIds, setPreconditionCaseIds] = useState<string[]>([]);
  const [preconditionCandidateId, setPreconditionCandidateId] = useState("");
  const [availableCases, setAvailableCases] = useState<CaseItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showElementLib, setShowElementLib] = useState(false);
  const [showCaseSettings, setShowCaseSettings] = useState(false);
  const [elementSearch, setElementSearch] = useState("");
  const [elementTypeFilter, setElementTypeFilter] = useState<string>("all");

  // ── 步骤编辑模式 ──
  const [editMode, setEditMode] = useState<"code" | "steps">("steps");
  const [stepItems, setStepItems] = useState<StepItem[]>(() => parseScriptToSteps(INITIAL_SCRIPT));
  const [testName, setTestName] = useState("新建测试用例");
  const [codeDirty, setCodeDirty] = useState(false);
  const [draggedStepId, setDraggedStepId] = useState<string | null>(null);
  const [showInsertPopover, setShowInsertPopover] = useState(false);

  // 加载环境列表和可作为前置条件的已保存用例
  useEffect(() => {
    (async () => {
      const [envRes, casesRes] = await Promise.all([
        environmentsService.list({ scope: "platform" }),
        casesService.list({ limit: 1000 }),
      ]);
      if (envRes.ok && envRes.data.items.length > 0) {
        setEnvs(envRes.data.items);
        if (!id) setEnvId(envRes.data.items[0].id);
      }
      if (casesRes.ok) {
        setAvailableCases(casesRes.data.items.filter((item) => item.id !== id && Boolean(item.script)));
      }
    })();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const res = await casesService.getById(id);
      if (res.ok) {
        const c = res.data;
        setName(c.name);
        setDescription(c.description || "");
        const loadedScript = c.script || INITIAL_SCRIPT;
        setScript(loadedScript);
        setStepItems(
          Array.isArray(c.steps) && c.steps.length > 0
            ? c.steps.map(normalizeStep)
            : parseScriptToSteps(loadedScript)
        );
        setTestName(extractTestName(loadedScript));
        setCodeDirty(false);
        setLanguage((c.language as any) || "typescript");
        setTags((c.tags || []).join(", "));
        setGroup(c.group || "");
        setEnvId(c.environmentId || "");
        setPreconditionCaseIds(
          Array.isArray(c.preconditionCaseIds) && c.preconditionCaseIds.length > 0
            ? c.preconditionCaseIds
            : (c.preconditionCaseId ? [c.preconditionCaseId] : [])
        );
      }
      setLoading(false);
    })();
  }, [id]);

  // 深链/刷新进入编辑页时元素库可能尚未加载（loadElements 只有元素库页面会调用），
  // 挂载时主动拉取一次；store 本身无防重入，这里用 ref 保证只请求一次
  const elementsRequestedRef = useRef(false);
  useEffect(() => {
    if (elementsRequestedRef.current) return;
    elementsRequestedRef.current = true;
    void useElementStore.getState().loadElements();
  }, []);

  // 步骤模式对应的脚本只在 stepItems/testName/language 变化时生成一次，
  // 供保存、切回代码模式、状态栏字数统计复用，避免每次击键重复拼装整套脚本
  const generatedScript = useMemo(
    () => generateScriptFromSteps(stepItems, testName, language),
    [stepItems, testName, language]
  );

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleSave = async (andExecute = false) => {
    if (!name.trim()) {
      flashToast("请输入用例名称");
      return;
    }
    setSaving(true);

    // 步骤模式下先生成脚本再保存（复用 generatedScript memo）
    const finalScript =
      editMode === "steps"
        ? generatedScript
        : script;

    const stepsToSave = editMode === "steps" || !codeDirty
      ? stepItems
      : preserveStepImages(parseScriptToSteps(finalScript), stepItems);

    const missingImage = stepsToSave.find(
      (step) => step.action === "assert" && step.assertionType === "image" && !step.expectedImage
    );
    if (missingImage) {
      setSaving(false);
      flashToast(`图片断言“${missingImage.description || missingImage.id}”需要上传基准截图`);
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim(),
      script: finalScript,
      steps: stepsToSave,
      language,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      group: group.trim(),
      environmentId: envId,
      preconditionCaseIds,
    };

    const res = id
      ? await casesService.update(id, payload)
      : await casesService.create(payload);

    setSaving(false);
    if (res.ok) {
      setScript(finalScript);
      setStepItems(stepsToSave);
      setCodeDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      if (andExecute) {
        const executeRes = await casesService.execute(res.data.id);
        flashToast(executeRes.ok ? "保存成功，已在本机执行完成" : `保存成功，但执行失败: ${executeRes.error || "未知错误"}`);
      } else {
        flashToast("保存成功");
      }
      // 新建后跳转到编辑页
      if (!id) navigate(`/cases/${res.data.id}`, { replace: true });
    } else {
      flashToast("保存失败: " + (res.error || "未知错误"));
    }
  };

  // ── 步骤编辑模式操作 ──

  const handleSwitchToSteps = () => {
    if (codeDirty || stepItems.length === 0) {
      setStepItems(preserveStepImages(parseScriptToSteps(script), stepItems));
      setTestName(extractTestName(script));
      setCodeDirty(false);
    }
    setEditMode("steps");
  };

  const handleSwitchToCode = () => {
    // 仅在步骤模式下触发，generatedScript 与 stepItems 同步（见 useMemo）
    const newScript = generatedScript;
    setScript(newScript);
    setCodeDirty(false);
    setEditMode("code");
  };

  const updateStep = (
    index: number,
    field: "description" | "action" | "selector" | "value" | "expectedResult" | "assertionType" | "assertionAttribute" | "expectedImage" | "imageSimilarityThreshold",
    val: string | number
  ) => {
    setStepItems((prev) =>
      prev.map((s, i) => (i === index ? ({ ...s, [field]: val } as StepItem) : s))
    );
  };

  const handleExpectedImageUpload = async (index: number, file?: File) => {
    if (!file) return;
    try {
      const expectedImage = await normalizeUploadedImage(file);
      updateStep(index, "expectedImage", expectedImage);
      flashToast("基准截图已上传");
    } catch (error) {
      flashToast(error instanceof Error ? error.message : "图片上传失败");
    }
  };

  const deleteStep = (index: number) => {
    setStepItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addStep = (index = stepItems.length) => {
    setStepItems((prev) => {
      const next = [...prev];
      next.splice(index, 0, createStep());
      return next;
    });
  };

  const duplicateStep = (index: number) => {
    setStepItems((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, { ...prev[index], id: nextStepId() });
      return next;
    });
  };

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, stepId: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", stepId);
    setDraggedStepId(stepId);
  };

  const handleDrop = (event: DragEvent<HTMLTableRowElement>, targetStepId: string) => {
    event.preventDefault();
    const sourceStepId = draggedStepId || event.dataTransfer.getData("text/plain");
    if (!sourceStepId || sourceStepId === targetStepId) return;
    setStepItems((prev) => {
      const sourceIndex = prev.findIndex((step) => step.id === sourceStepId);
      const targetIndex = prev.findIndex((step) => step.id === targetStepId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDraggedStepId(null);
  };

  const insertElementAsStep = (el: ElementItem) => {
    setStepItems((prev) => [
      ...prev,
      createStep("click", el.selector, "", `点击 ${el.name}`),
    ]);
    setShowInsertPopover(false);
  };

  // ── 渲染 ──

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-accent animate-spin" />
      </div>
    );
  }

  const allActionKeys = Object.keys(stepActionMetaMap) as ElementAction[];

  return (
    <div className="h-[calc(100vh-4rem)] lg:h-screen flex flex-col animate-fade-in">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-bg-card border border-border/60 rounded-lg px-4 py-2.5 shadow-lg animate-slide-down">
          <CheckCircle className="w-4 h-4 text-success" />
          <span className="text-sm">{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 lg:px-6 py-3 border-b border-border/60 bg-bg-card">
        <div className="flex items-center gap-2 lg:gap-4 min-w-0">
          <button
            onClick={() => navigate("/cases")}
            className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-secondary hover:text-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="case-name-input"
              placeholder="输入用例名称..."
              className="text-base lg:text-lg font-semibold bg-transparent border-none outline-none text-text placeholder:text-text-tertiary w-40 sm:w-64 lg:w-96 max-w-full"
            />
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-text-tertiary">
                {id ? "编辑用例" : "新建用例"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowCaseSettings(true)}
            className="btn-secondary xl:hidden"
            title="用例配置"
            aria-label="打开用例配置"
          >
            <Settings2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowElementLib(!showElementLib)}
            className={`btn-secondary ${showElementLib ? "bg-accent/15 text-accent" : ""}`}
            title="元素库"
          >
            <Library className="w-4 h-4" />
            <span className="hidden 2xl:inline">元素库</span>
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="btn-secondary hidden 2xl:inline-flex"
          >
            <History className="w-4 h-4" />
            历史版本
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="btn-secondary"
            title="保存并执行"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PlayCircle className="w-4 h-4" />
            )}
            <span className="hidden 2xl:inline">保存并执行</span>
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="btn-primary"
            title="保存"
            data-testid="case-save-button"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">保存</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {showCaseSettings && (
          <button
            className="fixed top-0 inset-x-0 bottom-16 z-30 bg-black/50 xl:hidden"
            onClick={() => setShowCaseSettings(false)}
            aria-label="关闭用例配置"
          />
        )}
        {/* Left sidebar */}
        <div className={`${
          showCaseSettings
            ? "fixed top-0 bottom-16 left-0 z-40 block shadow-2xl"
            : "hidden"
        } xl:static xl:block xl:shadow-none w-72 xl:w-64 shrink-0 border-r border-border/60 bg-bg-card p-4 overflow-y-auto space-y-4`}>
          <div className="flex items-center justify-between pb-3 border-b border-border/60 xl:hidden">
            <span className="text-sm font-semibold">用例配置</span>
            <button
              onClick={() => setShowCaseSettings(false)}
              className="w-7 h-7 inline-flex items-center justify-center rounded hover:bg-bg-elevated text-text-tertiary"
              aria-label="关闭用例配置"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="text-xs font-medium text-text-tertiary block mb-1.5">
              用例分组
            </label>
            <input
              type="text"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="如: 用户模块"
              className="input"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-text-tertiary block mb-1.5">
              标签 (逗号分隔)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="如: P0, 核心流程"
              className="input"
            />
            {tags && (
              <div className="flex items-center gap-1 flex-wrap mt-2">
                {tags
                  .split(",")
                  .filter(Boolean)
                  .map((tag, i) => (
                    <span key={i} className="tag bg-accent/10 text-accent">
                      {tag.trim()}
                    </span>
                  ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-text-tertiary block mb-1.5">
              执行环境
            </label>
            <div className="relative">
              <select
                value={envId}
                onChange={(e) => setEnvId(e.target.value)}
                className="input appearance-none pr-8 cursor-pointer"
              >
                {envs.map((env) => (
                  <option key={env.id} value={env.id} className="bg-bg-card">
                    {env.name} - {env.url}
                  </option>
                ))}
                {envs.length === 0 && <option value="">暂无环境</option>}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-text-tertiary block mb-1.5">
              脚本语言
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLanguage("typescript")}
                data-testid="case-language-typescript"
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  language === "typescript"
                    ? "bg-accent text-white"
                    : "bg-bg-elevated text-text-secondary hover:text-text"
                }`}
              >
                TypeScript
              </button>
              <button
                onClick={() => setLanguage("python")}
                data-testid="case-language-python"
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  language === "python"
                    ? "bg-accent text-white"
                    : "bg-bg-elevated text-text-secondary hover:text-text"
                }`}
              >
                Python
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-text-tertiary block mb-1.5">
              用例描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述这个测试用例的目的和预期结果..."
              rows={4}
              className="input resize-none"
            />
          </div>

          <div className="pt-3 border-t border-border/60">
            <div className="flex items-center gap-2 text-xs text-text-tertiary">
              <Settings2 className="w-3.5 h-3.5" />
              高级配置
            </div>
            <div className="mt-2 space-y-2">
              <label className="flex items-center justify-between text-sm text-text-secondary">
                <span>超时时间</span>
                <input
                  type="number"
                  defaultValue={30}
                  className="w-20 bg-bg-elevated border border-border/60 rounded px-2 py-1 text-sm text-text text-center"
                />
              </label>
              <label className="flex items-center justify-between text-sm text-text-secondary">
                <span>重试次数</span>
                <input
                  type="number"
                  defaultValue={0}
                  className="w-20 bg-bg-elevated border border-border/60 rounded px-2 py-1 text-sm text-text text-center"
                />
              </label>
              <label className="flex items-center justify-between text-sm text-text-secondary">
                <input type="checkbox" checked disabled className="accent-accent" />
                <span className="flex-1 ml-2">执行结束自动截图</span>
              </label>
              <label className="flex items-center justify-between text-sm text-text-secondary">
                <input type="checkbox" defaultChecked className="accent-accent" />
                <span className="flex-1 ml-2">录制视频</span>
              </label>
            </div>
          </div>
        </div>

        {/* ── Editor ── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 bg-bg-elevated/50 border-b border-border/60">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <FileCode className="w-4 h-4 text-accent" />
              test-case.{language === "typescript" ? "spec.ts" : "py"}
              <button
                onClick={() => {
                  if (editMode === "code") {
                    handleSwitchToSteps();
                  } else {
                    handleSwitchToCode();
                  }
                }}
                data-testid="case-mode-toggle"
                className={`ml-3 px-2 py-0.5 rounded text-xs transition-colors ${
                  editMode === "steps"
                    ? "bg-accent/15 text-accent"
                    : "bg-bg-elevated hover:bg-accent/10 text-text-secondary"
                }`}
              >
                <List className="w-3 h-3 inline mr-1" />
                {editMode === "code" ? "步骤编辑" : "代码编辑"}
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  saved ? "bg-success" : "bg-bg-elevated"
                }`}
              />
              {saved ? "已保存" : id ? "已加载" : "未保存"}
            </div>
          </div>

          {/* Editor body */}
          <div className="flex-1 overflow-hidden">
            {editMode === "code" ? (
              /* ── 代码模式 ── */
              <textarea
                value={script}
                data-testid="case-code-editor"
                onChange={(e) => {
                  setScript(e.target.value);
                  setCodeDirty(true);
                }}
                className="w-full h-full bg-bg-card text-text font-mono text-sm p-4 outline-none resize-none leading-relaxed"
                spellCheck={false}
              />
            ) : (
              /* ── 步骤编辑模式 ── */
              <div className="flex flex-col h-full bg-bg-card">
                <div className="px-3 py-2.5 bg-bg-card/45 border-b border-border/50 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 min-w-24 text-xs font-medium text-text-secondary">
                      <GitBranch className="w-3.5 h-3.5 text-accent" />
                      前置用例
                      {preconditionCaseIds.length > 0 && <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent">{preconditionCaseIds.length}</span>}
                    </div>
                    <div className="relative min-w-64 max-w-lg flex-1">
                      <select
                        value={preconditionCandidateId}
                        onChange={(event) => {
                          const selectedId = event.target.value;
                          if (selectedId && !preconditionCaseIds.includes(selectedId)) {
                            setPreconditionCaseIds((items) => [...items, selectedId]);
                          }
                          setPreconditionCandidateId("");
                        }}
                        data-testid="case-precondition-select"
                        className="w-full h-9 appearance-none rounded border border-border/50 bg-bg-elevated px-3 pr-8 text-xs text-text outline-none focus:border-accent/60 cursor-pointer"
                      >
                        <option value="" className="bg-bg-card">+ 添加前置用例</option>
                        {availableCases.filter((caseItem) => !preconditionCaseIds.includes(caseItem.id)).map((caseItem) => (
                          <option key={caseItem.id} value={caseItem.id} className="bg-bg-card">
                            {caseItem.group ? `${caseItem.group} / ` : ""}{caseItem.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" />
                    </div>
                    <span className="text-[11px] text-text-tertiary">按下方从上到下的顺序执行</span>
                  </div>

                  {preconditionCaseIds.length > 0 && (
                    <div className="ml-0 sm:ml-[108px] space-y-1.5" data-testid="case-precondition-list">
                      {preconditionCaseIds.map((caseId, index) => {
                        const caseItem = availableCases.find((item) => item.id === caseId);
                        return (
                          <div key={caseId} className="flex items-center gap-2 min-h-9 px-2.5 py-1.5 rounded-lg border border-border/45 bg-bg-elevated/60 group">
                            <span className="w-5 h-5 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[10px] font-semibold shrink-0">{index + 1}</span>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs text-text truncate">{caseItem?.name || "已删除的前置用例"}</div>
                              {caseItem?.group && <div className="text-[10px] text-text-tertiary truncate mt-0.5">{caseItem.group}</div>}
                            </div>
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => setPreconditionCaseIds((items) => { const next = [...items]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}
                              className="w-7 h-7 rounded flex items-center justify-center text-text-tertiary hover:text-accent hover:bg-accent/10 disabled:opacity-25"
                              title="上移"
                            ><ArrowUp className="w-3.5 h-3.5" /></button>
                            <button
                              type="button"
                              disabled={index === preconditionCaseIds.length - 1}
                              onClick={() => setPreconditionCaseIds((items) => { const next = [...items]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })}
                              className="w-7 h-7 rounded flex items-center justify-center text-text-tertiary hover:text-accent hover:bg-accent/10 disabled:opacity-25"
                              title="下移"
                            ><ArrowDown className="w-3.5 h-3.5" /></button>
                            <button
                              type="button"
                              onClick={() => setPreconditionCaseIds((items) => items.filter((item) => item !== caseId))}
                              className="w-7 h-7 rounded flex items-center justify-center text-text-tertiary hover:text-danger hover:bg-danger/10"
                              title="移除"
                            ><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        );
                      })}
                      <div className="flex items-center gap-2 px-2.5 py-1 text-[11px] text-text-tertiary"><span className="w-5 text-center">↓</span><span>最后执行当前用例：<span className="text-text-secondary">{name || "当前用例"}</span></span></div>
                    </div>
                  )}
                </div>
                {/* 步骤工具栏 */}
                <div className="flex items-center justify-between px-3 py-2 bg-bg-elevated/30 border-b border-border/40">
                  <span className="text-xs text-text-secondary">
                    <List className="w-3.5 h-3.5 inline mr-1.5" />
                    步骤列表 ({stepItems.length})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div className="relative">
                      <button
                        onClick={() => setShowInsertPopover(!showInsertPopover)}
                        className="px-2 py-1 rounded text-xs bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                      >
                        <Plus className="w-3 h-3 inline mr-1" />
                        从元素库插入
                      </button>
                      {showInsertPopover && (
                        <InsertElementPopover
                          elements={elements}
                          onInsert={insertElementAsStep}
                          onClose={() => setShowInsertPopover(false)}
                        />
                      )}
                    </div>
                    <button
                      onClick={() => addStep()}
                      className="px-2 py-1 rounded text-xs bg-bg-elevated hover:bg-accent/10 text-text-secondary transition-colors"
                    >
                      <Plus className="w-3 h-3 inline mr-1" />
                      添加步骤
                    </button>
                  </div>
                </div>

                {/* 步骤编辑表格 */}
                <div className="flex-1 overflow-auto">
                  {stepItems.length === 0 ? (
                    <div className="min-h-64 flex flex-col items-center justify-center text-text-tertiary">
                      <MousePointerClick className="w-8 h-8 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">暂无步骤</p>
                      <button
                        onClick={() => addStep()}
                        className="mt-3 inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-accent bg-accent/10 hover:bg-accent/20"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        添加第一步
                      </button>
                    </div>
                  ) : (
                    <table className="w-full min-w-[1060px] table-fixed border-collapse text-xs">
                      <colgroup>
                        <col className="w-12" />
                        <col className="w-48" />
                        <col className="w-28" />
                        <col className="w-52" />
                        <col className="w-32" />
                        <col className="w-64" />
                        <col className="w-[100px]" />
                      </colgroup>
                      <thead className="sticky top-0 z-10 bg-bg-elevated">
                        <tr className="text-left text-text-tertiary border-b border-border/60">
                          <th className="px-2 py-2 font-medium text-center">序号</th>
                          <th className="px-2 py-2 font-medium border-l border-border/30">步骤描述</th>
                          <th className="px-2 py-2 font-medium border-l border-border/30">操作类型</th>
                          <th className="px-2 py-2 font-medium border-l border-border/30">操作对象 / 选择器</th>
                          <th className="px-2 py-2 font-medium border-l border-border/30">测试数据 / 断言类型</th>
                          <th className="px-2 py-2 font-medium border-l border-border/30">预期结果</th>
                          <th className="px-2 py-2 font-medium text-center border-l border-border/30">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stepItems.map((step, i) => {
                          const meta = stepActionMetaMap[step.action] || stepActionMetaMap.click;
                          const assertionType = getAssertionType(step);
                          const assertionMeta = assertionMetaMap[assertionType];
                          return (
                            <tr
                              key={step.id}
                              data-testid="case-step-row"
                              onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                              }}
                              onDrop={(event) => handleDrop(event, step.id)}
                              className={`group border-b border-border/30 bg-bg-card/25 hover:bg-bg-card/55 transition-colors ${
                                draggedStepId === step.id ? "opacity-40" : ""
                              }`}
                            >
                              <td className="px-1.5 py-2 align-middle">
                                <div className="flex items-center justify-center gap-1 text-text-tertiary">
                                  <button
                                    draggable
                                    onDragStart={(event) => handleDragStart(event, step.id)}
                                    onDragEnd={() => setDraggedStepId(null)}
                                    className="w-6 h-7 inline-flex items-center justify-center rounded cursor-grab active:cursor-grabbing hover:bg-bg-elevated hover:text-text"
                                    title="拖拽调整顺序"
                                    aria-label={`拖拽第 ${i + 1} 步`}
                                  >
                                    <GripVertical className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="w-4 text-center font-mono">{i + 1}</span>
                                </div>
                              </td>
                              <td className="p-1.5 border-l border-border/30 align-top">
                                <textarea
                                  value={step.description}
                                  onChange={(event) => updateStep(i, "description", event.target.value)}
                                  placeholder="描述本步骤要完成的操作"
                                  rows={2}
                                  className="w-full min-h-14 resize-none rounded border border-transparent bg-transparent px-2 py-1.5 leading-5 text-text outline-none placeholder:text-text-tertiary/60 hover:border-border/40 focus:border-accent/60 focus:bg-bg-elevated"
                                />
                              </td>
                              <td className="p-1.5 border-l border-border/30 align-top">
                                <select
                                  value={step.action}
                                  onChange={(event) => {
                                    const action = event.target.value as ElementAction;
                                    updateStep(i, "action", action);
                                    if (action === "assert") {
                                      updateStep(i, "assertionType", getAssertionType(step));
                                      updateStep(i, "value", "");
                                    }
                                    if (action === "wait") {
                                      updateStep(i, "selector", "");
                                      updateStep(i, "value", step.value || "1000");
                                      if (!step.description.trim()) updateStep(i, "description", "等待 1000 毫秒");
                                    } else {
                                      if (!stepActionMetaMap[action].hasValue) updateStep(i, "value", "");
                                      if (step.action === "wait" && /^等待 \d+ 毫秒$/.test(step.description)) {
                                        updateStep(i, "description", "");
                                      }
                                    }
                                  }}
                                  className="w-full h-9 rounded border border-border/40 bg-bg-elevated px-2 text-text outline-none focus:border-accent/60 cursor-pointer"
                                >
                                  {allActionKeys.map((key) => (
                                    <option key={key} value={key} className="bg-bg-card">
                                      {stepActionMetaMap[key].label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="p-1.5 border-l border-border/30 align-top">
                                <input
                                  type="text"
                                  value={step.selector}
                                  disabled={step.action === "wait" || (step.action === "assert" && assertionMeta.scope === "page")}
                                  onChange={(event) => updateStep(i, "selector", event.target.value)}
                                  placeholder={step.action === "wait" ? "无需操作对象" : step.action === "assert" && assertionType === "image" ? "输入选择器，留空截取当前页面" : step.action === "assert" && assertionMeta.scope === "page" ? "页面级断言" : step.action === "navigate" ? "输入访问 URL" : "输入 CSS / XPath 选择器"}
                                  className="w-full h-9 rounded border border-transparent bg-transparent px-2 font-mono text-[11px] text-text outline-none placeholder:text-text-tertiary/60 hover:border-border/40 focus:border-accent/60 focus:bg-bg-elevated disabled:cursor-not-allowed disabled:opacity-45"
                                />
                              </td>
                              <td className="p-1.5 border-l border-border/30 align-top">
                                {step.action === "assert" ? (
                                  <select
                                    value={assertionType}
                                    onChange={(event) => {
                                      const nextType = event.target.value as CaseAssertionType;
                                      updateStep(i, "assertionType", nextType);
                                      updateStep(i, "expectedResult", "");
                                      if (nextType !== "image") updateStep(i, "expectedImage", "");
                                      if (!assertionMetaMap[nextType].needsAttribute) updateStep(i, "assertionAttribute", "");
                                      if (assertionMetaMap[nextType].scope === "page") updateStep(i, "selector", "");
                                      if (!step.description.trim() || step.description === assertionMeta.label) {
                                        updateStep(i, "description", assertionMetaMap[nextType].label);
                                      }
                                    }}
                                    data-testid="case-assertion-type"
                                    className="w-full h-9 rounded border border-border/40 bg-bg-elevated px-2 text-text outline-none focus:border-accent/60 cursor-pointer"
                                  >
                                    {assertionGroups.map((groupItem) => (
                                      <optgroup key={groupItem.label} label={groupItem.label} className="bg-bg-card">
                                        {groupItem.items.map((type) => (
                                          <option key={type} value={type}>{assertionMetaMap[type].label}</option>
                                        ))}
                                      </optgroup>
                                    ))}
                                  </select>
                                ) : (
                                  <div className="relative">
                                  <input
                                    type={step.action === "wait" ? "number" : "text"}
                                    min={step.action === "wait" ? 0 : undefined}
                                    max={step.action === "wait" ? 2147483647 : undefined}
                                    step={step.action === "wait" ? 100 : undefined}
                                    value={step.value}
                                    disabled={!meta.hasValue}
                                    onChange={(event) => updateStep(i, "value", event.target.value)}
                                    placeholder={step.action === "wait" ? "1000" : meta.hasValue ? "输入测试数据" : "无需数据"}
                                    className={`w-full h-9 rounded border border-transparent bg-transparent px-2 text-text outline-none placeholder:text-text-tertiary/60 hover:border-border/40 focus:border-accent/60 focus:bg-bg-elevated disabled:cursor-not-allowed disabled:opacity-45 ${step.action === "wait" ? "pr-10" : ""}`}
                                  />
                                  {step.action === "wait" && (
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-tertiary pointer-events-none">
                                      毫秒
                                    </span>
                                  )}
                                  </div>
                                )}
                              </td>
                              <td className="p-1.5 border-l border-border/30 align-top">
                                {step.action === "assert" ? (
                                  <div className="space-y-1">
                                    {assertionType === "image" ? (
                                      <div className="flex items-center gap-2 min-h-14">
                                        {step.expectedImage ? (
                                          <img
                                            src={step.expectedImage}
                                            alt="基准截图"
                                            className="w-16 h-12 shrink-0 object-contain rounded border border-border/50 bg-black/30"
                                          />
                                        ) : (
                                          <div className="w-16 h-12 shrink-0 inline-flex items-center justify-center rounded border border-dashed border-border/60 text-text-tertiary">
                                            <ImagePlus className="w-4 h-4" />
                                          </div>
                                        )}
                                        <div className="min-w-0 flex-1 space-y-1">
                                          <div className="flex items-center gap-1">
                                            <label className="h-7 px-2 inline-flex items-center gap-1 rounded bg-accent/10 text-accent hover:bg-accent/20 cursor-pointer whitespace-nowrap">
                                              <ImagePlus className="w-3.5 h-3.5" />
                                              {step.expectedImage ? "更换" : "上传截图"}
                                              <input
                                                type="file"
                                                accept="image/png,image/jpeg,image/webp"
                                                className="hidden"
                                                data-testid="case-assertion-image-input"
                                                onChange={(event) => {
                                                  void handleExpectedImageUpload(i, event.target.files?.[0]);
                                                  event.target.value = "";
                                                }}
                                              />
                                            </label>
                                            {step.expectedImage && (
                                              <button
                                                type="button"
                                                onClick={() => updateStep(i, "expectedImage", "")}
                                                className="w-7 h-7 inline-flex items-center justify-center rounded text-text-tertiary hover:text-danger hover:bg-danger/10"
                                                title="删除基准截图"
                                                aria-label="删除基准截图"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                          </div>
                                          <label className="flex items-center gap-1 text-[10px] text-text-tertiary">
                                            <span>相似度</span>
                                            <input
                                              type="number"
                                              min={50}
                                              max={100}
                                              step={0.1}
                                              value={step.imageSimilarityThreshold ?? 99}
                                              onChange={(event) => updateStep(i, "imageSimilarityThreshold", Number(event.target.value))}
                                              className="w-14 h-6 rounded border border-border/40 bg-bg-elevated px-1.5 text-center text-[10px] text-text outline-none focus:border-accent/60"
                                            />
                                            <span>%</span>
                                          </label>
                                        </div>
                                      </div>
                                    ) : assertionMeta.needsAttribute ? (
                                      <input
                                        type="text"
                                        value={step.assertionAttribute || ""}
                                        onChange={(event) => updateStep(i, "assertionAttribute", event.target.value)}
                                        placeholder="属性名，如 class"
                                        className="w-full h-7 rounded border border-transparent bg-transparent px-2 font-mono text-[11px] text-text outline-none placeholder:text-text-tertiary/60 hover:border-border/40 focus:border-accent/60 focus:bg-bg-elevated"
                                      />
                                    ) : null}
                                    {assertionType !== "image" && <input
                                      type={assertionType === "count_equals" ? "number" : "text"}
                                      min={assertionType === "count_equals" ? 0 : undefined}
                                      value={step.expectedResult}
                                      disabled={!assertionMeta.needsExpected}
                                      onChange={(event) => updateStep(i, "expectedResult", event.target.value)}
                                      placeholder={assertionMeta.needsExpected ? "填写期望值" : "无需期望值"}
                                      className="w-full h-8 rounded border border-transparent bg-transparent px-2 text-text outline-none placeholder:text-text-tertiary/60 hover:border-border/40 focus:border-accent/60 focus:bg-bg-elevated disabled:cursor-not-allowed disabled:opacity-45"
                                    />}
                                  </div>
                                ) : (
                                  <textarea
                                    value={step.expectedResult}
                                    onChange={(event) => updateStep(i, "expectedResult", event.target.value)}
                                    placeholder="填写可验证的预期结果"
                                    rows={2}
                                    className="w-full min-h-14 resize-none rounded border border-transparent bg-transparent px-2 py-1.5 leading-5 text-text outline-none placeholder:text-text-tertiary/60 hover:border-border/40 focus:border-accent/60 focus:bg-bg-elevated"
                                  />
                                )}
                              </td>
                              <td className="p-1.5 border-l border-border/30 align-middle">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => duplicateStep(i)}
                                    className="w-7 h-7 inline-flex items-center justify-center rounded text-text-tertiary hover:text-accent hover:bg-accent/10"
                                    title="复制步骤"
                                    aria-label={`复制第 ${i + 1} 步`}
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => addStep(i + 1)}
                                    className="w-7 h-7 inline-flex items-center justify-center rounded text-text-tertiary hover:text-accent hover:bg-accent/10"
                                    title="在下方插入步骤"
                                    aria-label={`在第 ${i + 1} 步后插入`}
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => deleteStep(i)}
                                    className="w-7 h-7 inline-flex items-center justify-center rounded text-text-tertiary hover:text-danger hover:bg-danger/10"
                                    title="删除步骤"
                                    aria-label={`删除第 ${i + 1} 步`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        <tr>
                          <td colSpan={7} className="p-2">
                            <button
                              onClick={() => addStep()}
                              className="w-full h-9 flex items-center justify-center gap-1.5 border border-dashed border-border/60 rounded text-text-tertiary hover:text-accent hover:border-accent/50 hover:bg-accent/5 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              添加步骤
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Status bar */}
          <div className="flex items-center justify-between px-4 py-1.5 bg-bg-elevated/30 border-t border-border/60 text-xs text-text-tertiary">
            <div className="flex items-center gap-4">
              <span>
                {editMode === "steps"
                  ? `步骤 ${stepItems.length}`
                  : `行 ${script.split("\n").length}`}
              </span>
              <span>
                字符{" "}
                {editMode === "steps"
                  ? generatedScript.length
                  : script.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span>{language === "typescript" ? "TypeScript" : "Python"}</span>
              <span>UTF-8</span>
            </div>
          </div>
        </div>

        {/* Element library sidebar */}
        {showElementLib && (
          <div className="w-72 shrink-0 border-l border-border/60 bg-bg-card hidden xl:flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Library className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold">元素库</span>
              </div>
              <button
                onClick={() => setShowElementLib(false)}
                className="p-1 hover:bg-bg-elevated rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-border/60 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
                <input
                  type="text"
                  placeholder="搜索元素..."
                  value={elementSearch}
                  onChange={(e) => setElementSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-bg-elevated border border-border/60 rounded-lg text-xs"
                />
              </div>
              <div className="flex items-center gap-1">
                <Filter className="w-3 h-3 text-text-tertiary" />
                {["all", "button", "input", "container", "select", "link"].map(
                  (type) => (
                    <button
                      key={type}
                      onClick={() => setElementTypeFilter(type)}
                      className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                        elementTypeFilter === type
                          ? "bg-accent/15 text-accent"
                          : "text-text-tertiary hover:text-text"
                      }`}
                    >
                      {type === "all"
                        ? "全部"
                        : elementTypeLabels[type] || type}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {elements
                .filter((el) => {
                  const matchSearch =
                    (el.name || "")
                      .toLowerCase()
                      .includes(elementSearch.toLowerCase()) ||
                    (el.selector || "")
                      .toLowerCase()
                      .includes(elementSearch.toLowerCase());
                  const matchType =
                    elementTypeFilter === "all" ||
                    el.type === elementTypeFilter;
                  return matchSearch && matchType;
                })
                .map((el) => {
                  const Icon =
                    el.type === "button"
                      ? MousePointerClick
                      : el.type === "input"
                      ? Keyboard
                      : el.type === "select"
                      ? ChevronDown
                      : el.type === "link"
                      ? Tag
                      : Eye;
                  return (
                    <div
                      key={el.id}
                      className="bg-bg-elevated/50 rounded-lg p-2.5 hover:bg-bg-elevated transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Icon className="w-3.5 h-3.5 text-accent shrink-0" />
                          <span className="text-xs font-medium truncate">
                            {el.name}
                          </span>
                        </div>
                        <button
                          onClick={async () => flashToast(await writeClipboard(el.selector) ? "选择器已复制" : "复制失败，请手动选择选择器")}
                          className="p-0.5 rounded hover:bg-accent/15 text-text-tertiary hover:text-accent transition-colors shrink-0"
                          title="复制选择器"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <code className="block text-xs text-accent font-mono bg-bg/50 px-2 py-1 rounded truncate">
                        {el.selector}
                      </code>
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        {(
                          ["click", "fill", "assert"] as ElementAction[]
                        ).map((action) => (
                          <button
                            key={action}
                            onClick={() => {
                              if (editMode === "steps") {
                                setStepItems((prev) => [
                                  ...prev,
                                  createStep(
                                    action,
                                    el.selector,
                                    "",
                                    `${stepActionMetaMap[action].label} ${el.name}`
                                  ),
                                ]);
                              } else {
                                const code = actionGenerators[action](
                                  el.selector
                                );
                                setScript((s) => s + "\n" + code);
                                setCodeDirty(true);
                              }
                            }}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                            title={`插入 ${action} 代码`}
                          >
                            + {action}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="p-3 border-t border-border/60 bg-bg-elevated/30">
              <a
                href="/elements"
                className="flex items-center justify-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                打开完整元素库
              </a>
            </div>
          </div>
        )}

        {/* History sidebar */}
        {showHistory && !showElementLib && (
          <div className="w-64 border-l border-border/60 bg-bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">版本历史</h3>
              <button
                onClick={() => setShowHistory(false)}
                className="p-1 hover:bg-bg-elevated rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-center py-8 text-text-tertiary text-xs">
              版本历史将在 Phase 2 实现
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

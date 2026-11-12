import {
  Globe,
  MousePointerClick,
  Keyboard,
  Filter,
  Eye,
  CheckCircle,
  ArrowDown,
  Timer,
} from "lucide-react";
import type { CaseAssertionType, CaseStep } from "@/api/services";
import type { ElementAction } from "@/types";

// ──── 步骤编辑模式：类型 & 纯函数（脚本 ⇄ 步骤 双向转换） ────
// 本文件与 UI 状态解耦，可独立单测（见 src/__tests__/scriptCodegen.test.ts）

export type StepItem = CaseStep;

export interface AssertionMeta {
  label: string;
  scope: "element" | "page";
  needsExpected: boolean;
  needsAttribute?: boolean;
}

export const assertionGroups: { label: string; items: CaseAssertionType[] }[] = [
  { label: "元素状态", items: ["visible", "hidden", "exists", "not_exists", "enabled", "disabled", "checked", "unchecked"] },
  { label: "文本和值", items: ["text_equals", "text_contains", "value_equals"] },
  { label: "属性、数量和图片", items: ["attribute_equals", "count_equals", "image"] },
  { label: "页面", items: ["url_equals", "url_contains", "title_equals", "title_contains"] },
];

export const assertionMetaMap: Record<CaseAssertionType, AssertionMeta> = {
  visible: { label: "元素可见", scope: "element", needsExpected: false },
  hidden: { label: "元素隐藏", scope: "element", needsExpected: false },
  exists: { label: "元素存在", scope: "element", needsExpected: false },
  not_exists: { label: "元素不存在", scope: "element", needsExpected: false },
  text_equals: { label: "文本等于", scope: "element", needsExpected: true },
  text_contains: { label: "文本包含", scope: "element", needsExpected: true },
  value_equals: { label: "输入值等于", scope: "element", needsExpected: true },
  attribute_equals: { label: "属性值等于", scope: "element", needsExpected: true, needsAttribute: true },
  count_equals: { label: "元素数量等于", scope: "element", needsExpected: true },
  enabled: { label: "元素可用", scope: "element", needsExpected: false },
  disabled: { label: "元素禁用", scope: "element", needsExpected: false },
  checked: { label: "已选中", scope: "element", needsExpected: false },
  unchecked: { label: "未选中", scope: "element", needsExpected: false },
  url_equals: { label: "URL 等于", scope: "page", needsExpected: true },
  url_contains: { label: "URL 包含", scope: "page", needsExpected: true },
  title_equals: { label: "标题等于", scope: "page", needsExpected: true },
  title_contains: { label: "标题包含", scope: "page", needsExpected: true },
  image: { label: "图片", scope: "element", needsExpected: false },
};

export function getAssertionType(step: Partial<StepItem>): CaseAssertionType {
  return step.assertionType && assertionMetaMap[step.assertionType] ? step.assertionType : "visible";
}

let stepIdCounter = 0;
export function nextStepId(): string {
  return `step_${Date.now()}_${++stepIdCounter}`;
}

export const stepActionMetaMap: Record<ElementAction, { icon: any; label: string; hasValue: boolean }> = {
  navigate: { icon: Globe, label: "导航", hasValue: false },
  click: { icon: MousePointerClick, label: "点击", hasValue: false },
  fill: { icon: Keyboard, label: "输入", hasValue: true },
  select: { icon: Filter, label: "选择", hasValue: true },
  hover: { icon: MousePointerClick, label: "悬停", hasValue: false },
  check: { icon: CheckCircle, label: "勾选", hasValue: false },
  uncheck: { icon: CheckCircle, label: "取消勾选", hasValue: false },
  assert: { icon: Eye, label: "断言", hasValue: false },
  scroll: { icon: ArrowDown, label: "滚动", hasValue: true },
  wait: { icon: Timer, label: "等待", hasValue: true },
};

export function toWaitMilliseconds(value: string | undefined): number {
  if (!value?.trim()) return 1000;
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 1000;
  return Math.min(Math.round(milliseconds), 2_147_483_647);
}

export function createStep(
  action: ElementAction = "click",
  selector = "",
  value = "",
  description = "",
  expectedResult = ""
): StepItem {
  const actionLabel = stepActionMetaMap[action]?.label || "操作";
  return {
    id: nextStepId(),
    description: description || (action === "wait" ? `等待 ${toWaitMilliseconds(value)} 毫秒` : selector ? `${actionLabel} ${selector}` : ""),
    action,
    selector,
    value,
    expectedResult,
    assertionType: action === "assert" ? "visible" : undefined,
    assertionAttribute: "",
    expectedImage: "",
    imageSimilarityThreshold: 99,
  };
}

export function normalizeStep(step: Partial<StepItem>): StepItem {
  const action = step.action && stepActionMetaMap[step.action] ? step.action : "click";
  return {
    id: step.id || nextStepId(),
    description: step.description || "",
    action,
    selector: step.selector || "",
    value: step.value || "",
    expectedResult: step.expectedResult || "",
    assertionType: action === "assert" ? getAssertionType(step) : step.assertionType,
    assertionAttribute: step.assertionAttribute || "",
    expectedImage: step.expectedImage || "",
    imageSimilarityThreshold: Number.isFinite(step.imageSimilarityThreshold) ? step.imageSimilarityThreshold : 99,
  };
}

/** 将 Playwright 单引号字符串反转义（\\ → \, \' → '） */
function unesc(s: string): string {
  return s.replace(/\\(.)/g, (_, c) => c);
}

/** 转义为 Playwright 单引号字符串（\ → \\, ' → \'） */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

function unescRegex(s: string): string {
  return s.replace(/\\([.*+?^${}()|[\]\\/])/g, "$1");
}

export function createAssertionStep(
  assertionType: CaseAssertionType,
  selector = "",
  expectedResult = "",
  assertionAttribute = ""
): StepItem {
  return {
    ...createStep("assert", selector, "", assertionMetaMap[assertionType].label, expectedResult),
    assertionType,
    assertionAttribute,
  };
}

/** 将一行脚本解析为一个步骤，无法识别则返回 null */
function parseLineToStep(line: string): StepItem | null {
  const t = line.trim();
  if (!t || t.startsWith("//") || t.startsWith("import ") || t.startsWith("test(")) return null;

  let m: RegExpMatchArray | null;

  m = t.match(/^await\s+visualAssert\(page\.locator\('([^']*)'\),\s*'([^']+)'\);?$/);
  if (m) return { ...createAssertionStep("image", unesc(m[1])), id: unesc(m[2]) };
  m = t.match(/^await\s+visualAssert\(page,\s*'([^']+)'\);?$/);
  if (m) return { ...createAssertionStep("image"), id: unesc(m[1]) };

  // page.goto('url')
  m = t.match(/^await\s+page\.goto\('([^']*)'\);?$/);
  if (m) return createStep("navigate", unesc(m[1]));

  // page.click('sel')
  m = t.match(/^await\s+page\.click\('([^']*)'\);?$/);
  if (m) return createStep("click", unesc(m[1]));

  // page.fill('sel', 'val')
  m = t.match(/^await\s+page\.fill\('([^']*)',\s*'([^']*)'\);?$/);
  if (m) return createStep("fill", unesc(m[1]), unesc(m[2]));

  // page.selectOption('sel', 'val')
  m = t.match(/^await\s+page\.selectOption\('([^']*)',\s*'([^']*)'\);?$/);
  if (m) return createStep("select", unesc(m[1]), unesc(m[2]));

  // page.hover('sel')
  m = t.match(/^await\s+page\.hover\('([^']*)'\);?$/);
  if (m) return createStep("hover", unesc(m[1]));

  // page.check('sel')
  m = t.match(/^await\s+page\.check\('([^']*)'\);?$/);
  if (m) return createStep("check", unesc(m[1]));

  // page.uncheck('sel')
  m = t.match(/^await\s+page\.uncheck\('([^']*)'\);?$/);
  if (m) return createStep("uncheck", unesc(m[1]));

  // page.locator('sel').check()
  m = t.match(/^await\s+page\.locator\('([^']*)'\)\.check\(\);?$/);
  if (m) return createStep("check", unesc(m[1]));

  // page.locator('sel').uncheck()
  m = t.match(/^await\s+page\.locator\('([^']*)'\)\.uncheck\(\);?$/);
  if (m) return createStep("uncheck", unesc(m[1]));

  // 元素状态断言
  m = t.match(/^await\s+expect\(page\.locator\('([^']*)'\)\)\.toBeVisible\(\);?$/);
  if (m) return createAssertionStep("visible", unesc(m[1]));
  m = t.match(/^await\s+expect\(page\.locator\('([^']*)'\)\)\.toBeHidden\(\);?$/);
  if (m) return createAssertionStep("hidden", unesc(m[1]));
  m = t.match(/^await\s+expect\(page\.locator\('([^']*)'\)\)\.not\.toHaveCount\(0\);?$/);
  if (m) return createAssertionStep("exists", unesc(m[1]));
  m = t.match(/^await\s+expect\(page\.locator\('([^']*)'\)\)\.toHaveCount\(0\);?$/);
  if (m) return createAssertionStep("not_exists", unesc(m[1]));
  m = t.match(/^await\s+expect\(page\.locator\('([^']*)'\)\)\.toBeEnabled\(\);?$/);
  if (m) return createAssertionStep("enabled", unesc(m[1]));
  m = t.match(/^await\s+expect\(page\.locator\('([^']*)'\)\)\.toBeDisabled\(\);?$/);
  if (m) return createAssertionStep("disabled", unesc(m[1]));
  m = t.match(/^await\s+expect\(page\.locator\('([^']*)'\)\)\.toBeChecked\(\);?$/);
  if (m) return createAssertionStep("checked", unesc(m[1]));
  m = t.match(/^await\s+expect\(page\.locator\('([^']*)'\)\)\.not\.toBeChecked\(\);?$/);
  if (m) return createAssertionStep("unchecked", unesc(m[1]));

  // 元素内容断言
  m = t.match(/^await\s+expect\(page\.locator\('([^']*)'\)\)\.toHaveText\('([^']*)'\);?$/);
  if (m) return createAssertionStep("text_equals", unesc(m[1]), unesc(m[2]));
  m = t.match(/^await\s+expect\(page\.locator\('([^']*)'\)\)\.toContainText\('([^']*)'\);?$/);
  if (m) return createAssertionStep("text_contains", unesc(m[1]), unesc(m[2]));
  m = t.match(/^await\s+expect\(page\.locator\('([^']*)'\)\)\.toHaveValue\('([^']*)'\);?$/);
  if (m) return createAssertionStep("value_equals", unesc(m[1]), unesc(m[2]));
  m = t.match(/^await\s+expect\(page\.locator\('([^']*)'\)\)\.toHaveAttribute\('([^']*)',\s*'([^']*)'\);?$/);
  if (m) return createAssertionStep("attribute_equals", unesc(m[1]), unesc(m[3]), unesc(m[2]));
  m = t.match(/^await\s+expect\(page\.locator\('([^']*)'\)\)\.toHaveCount\((\d+)\);?$/);
  if (m) return createAssertionStep("count_equals", unesc(m[1]), m[2]);

  // 页面断言
  m = t.match(/^await\s+expect\(page\)\.toHaveURL\('([^']*)'\);?$/);
  if (m) return createAssertionStep("url_equals", "", unesc(m[1]));
  m = t.match(/^await\s+expect\(page\)\.toHaveURL\(\/((?:\\.|[^/])*)\/\);?$/);
  if (m) return createAssertionStep("url_contains", "", unescRegex(m[1]));
  m = t.match(/^await\s+expect\(page\)\.toHaveTitle\('([^']*)'\);?$/);
  if (m) return createAssertionStep("title_equals", "", unesc(m[1]));
  m = t.match(/^await\s+expect\(page\)\.toHaveTitle\(\/((?:\\.|[^/])*)\/\);?$/);
  if (m) return createAssertionStep("title_contains", "", unescRegex(m[1]));

  // page.locator('sel').scrollIntoView()
  m = t.match(/^await\s+page\.locator\('([^']*)'\)\.scrollIntoView\(\);?$/);
  if (m) return createStep("scroll", unesc(m[1]));

  // page.evaluate(() => window.scrollTo(0, N))
  m = t.match(/^await\s+page\.evaluate\(\(\)\s*=>\s*window\.scrollTo\(0,\s*(\d+)\)\);?$/);
  if (m) return createStep("scroll", "window", m[1]);

  // page.waitForTimeout(N) / Python: page.wait_for_timeout(N)
  m = t.match(/^await\s+page\.(?:waitForTimeout|wait_for_timeout)\(\s*(\d+(?:\.\d+)?)\s*\);?$/);
  if (m) return createStep("wait", "", String(toWaitMilliseconds(m[1])));

  return null;
}

/** 将整段脚本解析为步骤列表，无法识别的行会被跳过 */
export function parseScriptToSteps(script: string): StepItem[] {
  return script
    .split("\n")
    .map((line) => parseLineToStep(line))
    .filter((s): s is StepItem => s !== null);
}

/** 解析脚本重建步骤时，尽量保留旧步骤上的基准截图配置 */
export function preserveStepImages(parsedSteps: StepItem[], existingSteps: StepItem[]): StepItem[] {
  return parsedSteps.map((parsedStep) => {
    const existingStep = existingSteps.find((step) => step.id === parsedStep.id);
    return existingStep?.expectedImage
      ? { ...parsedStep, expectedImage: existingStep.expectedImage, imageSimilarityThreshold: existingStep.imageSimilarityThreshold }
      : parsedStep;
  });
}

export function extractTestName(script: string): string {
  const m = script.match(/test\s*\(\s*'([^']*)'/);
  return m ? m[1] : "测试用例";
}

function generateTypeScriptAssertion(step: StepItem): string {
  const type = getAssertionType(step);
  const selector = esc(step.selector);
  const expected = esc(step.expectedResult);
  const attribute = esc(step.assertionAttribute || "");
  const locator = `page.locator('${selector}')`;
  switch (type) {
    case "visible": return `await expect(${locator}).toBeVisible();`;
    case "hidden": return `await expect(${locator}).toBeHidden();`;
    case "exists": return `await expect(${locator}).not.toHaveCount(0);`;
    case "not_exists": return `await expect(${locator}).toHaveCount(0);`;
    case "text_equals": return `await expect(${locator}).toHaveText('${expected}');`;
    case "text_contains": return `await expect(${locator}).toContainText('${expected}');`;
    case "value_equals": return `await expect(${locator}).toHaveValue('${expected}');`;
    case "attribute_equals": return `await expect(${locator}).toHaveAttribute('${attribute}', '${expected}');`;
    case "count_equals": return `await expect(${locator}).toHaveCount(${Math.max(0, Math.round(Number(step.expectedResult) || 0))});`;
    case "enabled": return `await expect(${locator}).toBeEnabled();`;
    case "disabled": return `await expect(${locator}).toBeDisabled();`;
    case "checked": return `await expect(${locator}).toBeChecked();`;
    case "unchecked": return `await expect(${locator}).not.toBeChecked();`;
    case "url_equals": return `await expect(page).toHaveURL('${expected}');`;
    case "url_contains": return `await expect(page).toHaveURL(/${escRegex(step.expectedResult)}/);`;
    case "title_equals": return `await expect(page).toHaveTitle('${expected}');`;
    case "title_contains": return `await expect(page).toHaveTitle(/${escRegex(step.expectedResult)}/);`;
    case "image": return `await visualAssert(${step.selector ? locator : "page"}, '${esc(step.id)}');`;
  }
}

function generatePythonAssertion(step: StepItem): string {
  const type = getAssertionType(step);
  const selector = esc(step.selector);
  const expected = esc(step.expectedResult);
  const attribute = esc(step.assertionAttribute || "");
  const locator = `page.locator('${selector}')`;
  switch (type) {
    case "visible": return `assert await ${locator}.is_visible()`;
    case "hidden": return `assert not await ${locator}.is_visible()`;
    case "exists": return `assert await ${locator}.count() > 0`;
    case "not_exists": return `assert await ${locator}.count() == 0`;
    case "text_equals": return `assert (await ${locator}.text_content()) == '${expected}'`;
    case "text_contains": return `assert '${expected}' in ((await ${locator}.text_content()) or '')`;
    case "value_equals": return `assert (await ${locator}.input_value()) == '${expected}'`;
    case "attribute_equals": return `assert (await ${locator}.get_attribute('${attribute}')) == '${expected}'`;
    case "count_equals": return `assert await ${locator}.count() == ${Math.max(0, Math.round(Number(step.expectedResult) || 0))}`;
    case "enabled": return `assert await ${locator}.is_enabled()`;
    case "disabled": return `assert await ${locator}.is_disabled()`;
    case "checked": return `assert await ${locator}.is_checked()`;
    case "unchecked": return `assert not await ${locator}.is_checked()`;
    case "url_equals": return `assert page.url == '${expected}'`;
    case "url_contains": return `assert '${expected}' in page.url`;
    case "title_equals": return `assert (await page.title()) == '${expected}'`;
    case "title_contains": return `assert '${expected}' in (await page.title())`;
    case "image": return `await visual_assert(${step.selector ? locator : "page"}, '${esc(step.id)}')`;
  }
}

export function generateScriptFromSteps(
  steps: StepItem[],
  testName: string,
  language: "typescript" | "python"
): string {
  if (language === "python") {
    const lines: string[] = [
      "import asyncio",
      "from playwright.async_api import async_playwright",
      "",
      "async def main():",
      "    async with async_playwright() as p:",
      "        browser = await p.chromium.launch()",
      "        page = await browser.new_page()",
    ];
    for (const step of steps) {
      const s = esc(step.selector);
      switch (step.action) {
        case "navigate":
          lines.push(`        await page.goto('${s}')`);
          break;
        case "click":
          lines.push(`        await page.click('${s}')`);
          break;
        case "fill":
          lines.push(`        await page.fill('${s}', '${esc(step.value)}')`);
          break;
        case "select":
          lines.push(`        await page.select_option('${s}', '${esc(step.value)}')`);
          break;
        case "hover":
          lines.push(`        await page.hover('${s}')`);
          break;
        case "check":
          lines.push(`        await page.locator('${s}').check()`);
          break;
        case "uncheck":
          lines.push(`        await page.locator('${s}').uncheck()`);
          break;
        case "assert":
          lines.push(`        ${generatePythonAssertion(step)}`);
          break;
        case "scroll":
          lines.push(`        await page.locator('${s}').scroll_into_view_if_needed()`);
          break;
        case "wait":
          lines.push(`        await page.wait_for_timeout(${toWaitMilliseconds(step.value)})`);
          break;
        default:
          lines.push(`        # ${step.action}: ${s}`);
      }
    }
    lines.push("        await browser.close()");
    lines.push("");
    lines.push("asyncio.run(main())");
    return lines.join("\n");
  }

  // TypeScript / Playwright Test
  const lines: string[] = [
    "import { test, expect } from '@playwright/test';",
    "",
    `test('${testName}', async ({ page }) => {`,
  ];
  for (const step of steps) {
    const s = esc(step.selector);
    switch (step.action) {
      case "navigate":
        lines.push(`  await page.goto('${s}');`);
        break;
      case "click":
        lines.push(`  await page.click('${s}');`);
        break;
      case "fill":
        lines.push(`  await page.fill('${s}', '${esc(step.value)}');`);
        break;
      case "select":
        lines.push(`  await page.selectOption('${s}', '${esc(step.value)}');`);
        break;
      case "hover":
        lines.push(`  await page.hover('${s}');`);
        break;
      case "check":
        lines.push(`  await page.locator('${s}').check();`);
        break;
      case "uncheck":
        lines.push(`  await page.locator('${s}').uncheck();`);
        break;
      case "assert":
        lines.push(`  ${generateTypeScriptAssertion(step)}`);
        break;
      case "scroll":
        if (step.selector === "window") {
          lines.push(`  await page.evaluate(() => window.scrollTo(0, ${step.value || 0}));`);
        } else {
          lines.push(`  await page.locator('${s}').scrollIntoView();`);
        }
        break;
      case "wait":
        lines.push(`  await page.waitForTimeout(${toWaitMilliseconds(step.value)});`);
        break;
      default:
        lines.push(`  // ${step.action}: ${s}`);
    }
  }
  lines.push("});");
  return lines.join("\n");
}

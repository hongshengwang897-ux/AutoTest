import { describe, it, expect } from "vitest";
import {
  createStep,
  createAssertionStep,
  parseScriptToSteps,
  preserveStepImages,
  extractTestName,
  generateScriptFromSteps,
  toWaitMilliseconds,
  type StepItem,
} from "../lib/scriptCodegen";

/** 提取参与往返一致性比较的核心字段（id 由 nextStepId 随机生成，单独比较） */
function pickCore(step: StepItem) {
  return {
    action: step.action,
    selector: step.selector,
    value: step.value,
    expectedResult: step.expectedResult,
    assertionType: step.assertionType,
    assertionAttribute: step.assertionAttribute,
    description: step.description,
  };
}

describe("generateScriptFromSteps（TypeScript）", () => {
  it("应生成完整的 Playwright Test 脚本", () => {
    const steps = [
      createStep("navigate", "https://example.com"),
      createStep("fill", "#user", "admin"),
      createAssertionStep("visible", ".banner"),
    ];
    const script = generateScriptFromSteps(steps, "登录流程", "typescript");
    expect(script).toContain("import { test, expect } from '@playwright/test';");
    expect(script).toContain("test('登录流程', async ({ page }) => {");
    expect(script).toContain("await page.goto('https://example.com');");
    expect(script).toContain("await page.fill('#user', 'admin');");
    expect(script).toContain("await expect(page.locator('.banner')).toBeVisible();");
    expect(script.trimEnd().endsWith("});")).toBe(true);
  });

  it("窗口滚动应走 page.evaluate，元素滚动应走 scrollIntoView", () => {
    const script = generateScriptFromSteps(
      [createStep("scroll", "window", "300"), createStep("scroll", ".list")],
      "滚动",
      "typescript"
    );
    expect(script).toContain("await page.evaluate(() => window.scrollTo(0, 300));");
    expect(script).toContain("await page.locator('.list').scrollIntoView();");
  });

  it("图片断言应生成 visualAssert 调用", () => {
    const imageStep = { ...createAssertionStep("image", ".pic"), id: "shot_1" };
    const script = generateScriptFromSteps([imageStep], "截图断言", "typescript");
    expect(script).toContain("await visualAssert(page.locator('.pic'), 'shot_1');");
  });
});

describe("generateScriptFromSteps（Python）", () => {
  it("应生成 async_playwright 风格的脚本", () => {
    const steps = [
      createStep("navigate", "https://example.com"),
      createStep("select", "#city", "上海"),
      createStep("wait", "", "1500"),
    ];
    const script = generateScriptFromSteps(steps, "接口冒烟", "python");
    expect(script).toContain("import asyncio");
    expect(script).toContain("from playwright.async_api import async_playwright");
    expect(script).toContain("async def main():");
    expect(script).toContain("await page.goto('https://example.com')");
    expect(script).toContain("await page.select_option('#city', '上海')");
    expect(script).toContain("await page.wait_for_timeout(1500)");
    expect(script).toContain("asyncio.run(main())");
  });

  it("元素断言应生成 Python assert 语句", () => {
    const script = generateScriptFromSteps(
      [createAssertionStep("text_contains", ".msg", "成功")],
      "断言",
      "python"
    );
    expect(script).toContain("assert '成功' in ((await page.locator('.msg').text_content()) or '')");
  });
});

describe("步骤 ⇄ 脚本 往返一致性", () => {
  it("TypeScript：生成脚本后重新解析，核心字段保持一致", () => {
    const steps: StepItem[] = [
      createStep("navigate", "https://example.com"),
      createStep("click", "#submit"),
      createStep("fill", "#user", "admin"),
      createStep("select", "#city", "北京"),
      createStep("hover", ".menu"),
      createStep("check", "#agree"),
      createStep("uncheck", "#newsletter"),
      createStep("scroll", ".list"),
      createStep("scroll", "window", "300"),
      createStep("wait", "", "800"),
      createAssertionStep("visible", ".banner"),
      createAssertionStep("hidden", ".spinner"),
      createAssertionStep("exists", ".footer"),
      createAssertionStep("not_exists", ".error"),
      createAssertionStep("text_equals", ".title", "首页"),
      createAssertionStep("text_contains", ".msg", "成功"),
      createAssertionStep("value_equals", "#user", "admin"),
      createAssertionStep("attribute_equals", ".btn", "btn-primary", "class"),
      createAssertionStep("count_equals", ".item", "5"),
      createAssertionStep("enabled", "#next"),
      createAssertionStep("checked", "#agree"),
      createAssertionStep("url_equals", "", "https://example.com/home"),
      createAssertionStep("url_contains", "", "login"),
      createAssertionStep("title_equals", "", "控制台"),
      createAssertionStep("title_contains", "", "管理"),
      { ...createAssertionStep("image", ".pic"), id: "shot_1" },
    ];
    const script = generateScriptFromSteps(steps, "全量往返", "typescript");
    const parsed = parseScriptToSteps(script);
    expect(parsed).toHaveLength(steps.length);
    parsed.forEach((step, i) => {
      expect(pickCore(step)).toEqual(pickCore(steps[i]));
    });
    // 图片断言的 id（截图标识）也应往返一致
    expect(parsed[parsed.length - 1].id).toBe("shot_1");
    // 测试名称同样可从脚本中还原
    expect(extractTestName(script)).toBe("全量往返");
  });

  it("Python：基础操作步骤往返一致（select_option / scroll_into_view 等解析器暂不识别，不在比较之列）", () => {
    const steps: StepItem[] = [
      createStep("navigate", "https://example.com"),
      createStep("click", "#submit"),
      createStep("fill", "#user", "admin"),
      createStep("hover", ".menu"),
      createStep("check", "#agree"),
      createStep("uncheck", "#newsletter"),
      createStep("wait", "", "800"),
    ];
    const script = generateScriptFromSteps(steps, "Python 往返", "python");
    const parsed = parseScriptToSteps(script);
    expect(parsed).toHaveLength(steps.length);
    parsed.forEach((step, i) => {
      expect(pickCore(step)).toEqual(pickCore(steps[i]));
    });
  });
});

describe("parseScriptToSteps 边界", () => {
  it("空脚本返回空数组", () => {
    expect(parseScriptToSteps("")).toEqual([]);
  });

  it("无法识别的行（注释、未知语句）会被跳过", () => {
    const script = [
      "import { test, expect } from '@playwright/test';",
      "",
      "test('x', async ({ page }) => {",
      "  // 注释行",
      "  await page.goto('https://example.com');",
      "  console.log('未知语句');",
      "  await page.waitForTimeout(2000);",
      "});",
    ].join("\n");
    const steps = parseScriptToSteps(script);
    expect(steps.map((s) => s.action)).toEqual(["navigate", "wait"]);
    expect(steps[1].value).toBe("2000");
  });
});

describe("generateScriptFromSteps 空步骤边界", () => {
  it("空步骤列表仍生成可运行骨架（TypeScript）", () => {
    const script = generateScriptFromSteps([], "空用例", "typescript");
    expect(script).toContain("test('空用例', async ({ page }) => {");
    expect(parseScriptToSteps(script)).toEqual([]);
  });

  it("空步骤列表仍生成可运行骨架（Python）", () => {
    const script = generateScriptFromSteps([], "空用例", "python");
    expect(script).toContain("async def main():");
    expect(script).toContain("asyncio.run(main())");
    expect(parseScriptToSteps(script)).toEqual([]);
  });
});

describe("preserveStepImages", () => {
  it("重新解析时保留旧步骤的基准截图与相似度阈值", () => {
    const existing: StepItem = {
      ...createAssertionStep("image", ".pic"),
      id: "shot_1",
      expectedImage: "data:image/png;base64,abc",
      imageSimilarityThreshold: 90,
    };
    const reparsed: StepItem = { ...createAssertionStep("image", ".pic"), id: "shot_1" };
    const merged = preserveStepImages([reparsed], [existing]);
    expect(merged[0].expectedImage).toBe("data:image/png;base64,abc");
    expect(merged[0].imageSimilarityThreshold).toBe(90);
  });
});

describe("toWaitMilliseconds", () => {
  it("空值与非法值回落到默认 1000", () => {
    expect(toWaitMilliseconds(undefined)).toBe(1000);
    expect(toWaitMilliseconds("")).toBe(1000);
    expect(toWaitMilliseconds("abc")).toBe(1000);
    expect(toWaitMilliseconds("-5")).toBe(1000);
  });

  it("合法值正常解析，超上限截断", () => {
    expect(toWaitMilliseconds("2500")).toBe(2500);
    expect(toWaitMilliseconds("99.9")).toBe(100);
    expect(toWaitMilliseconds("99999999999")).toBe(2_147_483_647);
  });
});

describe("extractTestName", () => {
  it("从脚本中提取 test 名称，提取不到时回落默认值", () => {
    expect(extractTestName("test('登录流程', async ({ page }) => {});")).toBe("登录流程");
    expect(extractTestName("const x = 1;")).toBe("测试用例");
  });
});

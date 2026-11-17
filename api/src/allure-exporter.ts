import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readdirSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";

/** Allure 报告结果状态 */
type AllureStatus = "passed" | "failed" | "broken" | "skipped" | "unknown";

/** Allure 测试用例 */
export interface AllureTestCase {
  uuid: string;
  historyId: string;
  name: string;
  fullName: string;
  suite: string;
  subSuites: string[];
  packages: string[];
  labels: AllureLabel[];
  links: AllureLink[];
  categories: AllureCategory[];
  steps: AllureStep[];
  fixtures: AllureFixture[];
  behaviors: AllureBehavior;
  testStage: string;
  start: number;
  stop: number;
  duration: number;
  status: AllureStatus;
  statusDetails: AllureStatusDetails;
  description: string;
  descriptionHtml: string;
  flaky: boolean;
  muted: boolean;
  parameter: AllureParameter[];
}

interface AllureLabel {
  name: string;
  value: string;
}

interface AllureLink {
  name: string;
  url: string;
  type: string;
}

interface AllureCategory {
  name: string;
  messageRegex?: string;
  matchedStatuses?: string[];
}

interface AllureStep {
  name: string;
  status: AllureStatus;
  stage: string;
  actions: { name: string; argument: string }[];
  arguments: { name: string; value: string; contentType?: string }[];
  attachments: { name: string; source: string; type: string }[];
  steps: AllureStep[];
  start: number;
  stop: number;
  duration: number;
  statusDetails: AllureStatusDetails;
}

interface AllureFixture {
  name: string;
  type: string;
  status: AllureStatus;
  stage: string;
  steps: AllureStep[];
  start: number;
  stop: number;
  duration: number;
  statusDetails: AllureStatusDetails;
}

interface AllureBehavior {
  epic?: string;
  features?: string[];
  stories?: string[];
}

interface AllureStatusDetails {
  flavor?: string;
  message?: string;
  trace?: string;
}

interface AllureParameter {
  name: string;
  value: string;
  mode: string;
}

export interface AllureSuite {
  name: string;
  children: string[];
}

export interface AllureContainer {
  uuid: string;
  name: string;
  type: string;
  cases: string[];
  children: string[];
  befores: unknown[];
  afters: unknown[];
  status: AllureStatus;
  start: number;
  stop: number;
  duration: number;
}

/**
 * 将 AutoTest 执行结果转换为 Allure 兼容格式
 * 输出标准 JSON 文件，可直接导入 Allure Dashboard 或 allure-docker
 */
export function convertToAllure(results: Array<{
  executionId?: string;
  caseId?: string;
  caseName?: string;
  caseGroupName?: string;
  status: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  steps?: Array<{ id: string; action: string; selector: string; status: string; duration: number }>;
  error?: string;
  screenshot?: string;
  environment?: string;
  browser?: string;
  tags?: string[];
}>): { testCases: AllureTestCase[]; suites: AllureSuite[]; containers: AllureContainer[] } {
  const testCases: AllureTestCase[] = [];
  const suites: AllureSuite[] = [];
  const containers: AllureContainer[] = [];
  const suiteGroups = new Map<string, string[]>();

  for (const result of results) {
    const startTs = result.startTime ? Date.parse(result.startTime) : 0;
    const stopTs = result.endTime ? Date.parse(result.endTime) : (startTs + (result.duration || 0));
    const tcUuid = result.executionId || randomUUID();
    const groupKey = result.caseGroupName || "未分组";

    if (!suiteGroups.has(groupKey)) {
      suiteGroups.set(groupKey, []);
    }
    suiteGroups.get(groupKey)!.push(tcUuid);

    const tags = result.tags || [];
    const labels: AllureLabel[] = [
      { name: "testClass", value: "AutoTest" },
      { name: "testMethod", value: result.caseName || "Unnamed" },
    ];
    if (result.environment) labels.push({ name: "environment", value: result.environment });
    if (result.browser) labels.push({ name: "browser", value: result.browser });
    for (const tag of tags) labels.push({ name: "tag", value: tag });
    if (result.caseId) labels.push({ name: "suite", value: result.caseId });

    const statusMap: Record<string, AllureStatus> = {
      pass: "passed", success: "passed",
      fail: "failed", failed: "failed", error: "failed",
      skip: "skipped", timeout: "broken",
    };
    const allureStatus = statusMap[result.status] || "unknown";

    const statusDetails: AllureStatusDetails = {};
    if (result.error) {
      statusDetails.message = result.error.slice(0, 500);
      statusDetails.flavor = "flaky";
    }

    const steps = (result.steps || []).map((step) => {
      const stepStart = startTs + (step.duration || 0) * 0;
      return {
        name: `[${step.action}] ${step.selector || "unknown"}`,
        status: statusMap[step.status] || "unknown",
        stage: "finished",
        actions: [],
        arguments: step.selector ? [{ name: "selector", value: step.selector }] : [],
        attachments: [],
        steps: [],
        start: stepStart,
        stop: stepStart + step.duration,
        duration: step.duration,
        statusDetails: {},
      };
    });

    const tc: AllureTestCase = {
      uuid: tcUuid,
      historyId: (result.caseId || "").length > 0 ? String(crc32(result.caseId || "")) : "0",
      name: result.caseName || "Unnamed Test",
      fullName: `AutoTest.${groupKey}.${result.caseName || "Unnamed"}`,
      suite: groupKey,
      subSuites: [],
      packages: ["AutoTest"],
      labels,
      links: result.executionId ? [{ name: "execution", url: `/reports/${result.executionId}`, type: "page" }] : [],
      categories: [
        { name: "auto", messageRegex: ".*" },
      ],
      steps,
      fixtures: [],
      behaviors: {
        epic: "AutoTest",
        features: [groupKey],
        stories: [result.caseName || ""],
      },
      testStage: "finished",
      start: startTs,
      stop: stopTs,
      duration: result.duration || (stopTs - startTs),
      status: allureStatus,
      statusDetails,
      description: `AutoTest execution: ${result.caseName || "unnamed"}`,
      descriptionHtml: `<p><strong>Case:</strong> ${escapeHtml(result.caseName || "unnamed")}</p>`,
      flaky: false,
      muted: false,
      parameter: [],
    };
    testCases.push(tc);

    const containerUuid = randomUUID();
    const container: AllureContainer = {
      uuid: containerUuid,
      name: `Execution: ${result.caseName || "unnamed"}`,
      type: "beforeAfter",
      cases: [tcUuid],
      children: [],
      befores: [],
      afters: [],
      status: allureStatus,
      start: startTs,
      stop: stopTs,
      duration: result.duration || (stopTs - startTs),
    };
    containers.push(container);
  }

  for (const [groupName, uuids] of suiteGroups) {
    suites.push({ name: groupName, children: uuids });
  }

  return { testCases, suites, containers };
}

function crc32(str: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 接口集合运行明细条目（api_collection_runs.items 元素） */
export interface CollectionRunItem {
  id: string;
  executionId?: string;
  caseId?: string;
  caseName: string;
  method?: string;
  url?: string;
  status: string;
  statusCode?: number | null;
  duration?: number;
  assertionTotal?: number;
  assertionPassed?: number;
  errorMessage?: string;
  sortOrder?: number;
}

/** 接口集合运行报告摘要（用于 Allure 分组） */
export interface CollectionRunReport {
  id: string;
  collectionPath?: string;
  collectionName?: string;
  triggerType?: string;
  total?: number;
  passed?: number;
  failed?: number;
  duration?: number;
  startedAt?: string;
  items: CollectionRunItem[];
}

/**
 * 将接口集合运行结果转换为 Allure result JSON 数组
 * 每个接口 → 一个 Allure 测试用例 result 文件，输出标准 Allure 2.x 格式
 */
export function convertCollectionRunToAllure(run: CollectionRunReport): AllureTestCase[] {
  const suite = run.collectionName || run.collectionPath || "接口集合";
  const startedAt = run.startedAt ? Date.parse(run.startedAt) : Date.now();
  const testCases: AllureTestCase[] = [];

  for (const item of run.items) {
    const start = startedAt;
    const stop = startedAt + (Number(item.duration) || 0);
    const statusMap: Record<string, AllureStatus> = {
      success: "passed", pass: "passed", passed: "passed",
      failed: "failed", fail: "failed", error: "broken",
    };
    const allureStatus = statusMap[item.status] || "unknown";
    const method = item.method || "GET";
    const url = item.url || "";
    const statusDetails: AllureStatusDetails = {};
    if (item.errorMessage) {
      statusDetails.message = item.errorMessage.slice(0, 500);
      statusDetails.trace = item.errorMessage.slice(0, 2000);
    }

    const labels: AllureLabel[] = [
      { name: "suite", value: suite },
      { name: "testClass", value: "ApiCollection" },
      { name: "testMethod", value: item.caseName },
      { name: "host", value: method },
      { name: "framework", value: "AutoTest" },
      { name: "language", value: "http" },
    ];
    if (run.triggerType) labels.push({ name: "trigger", value: run.triggerType });

    // 每个接口封装为一个请求步骤，含断言与响应信息
    const steps: AllureStep[] = [{
      name: `${method} ${url}`,
      status: allureStatus,
      stage: "finished",
      actions: [],
      arguments: [
        { name: "url", value: url },
        { name: "method", value: method },
        ...(item.statusCode != null ? [{ name: "statusCode", value: String(item.statusCode) }] : []),
        ...(item.assertionTotal != null ? [{ name: "assertions", value: `${item.assertionPassed ?? 0}/${item.assertionTotal}` }] : []),
      ],
      attachments: [],
      steps: [],
      start,
      stop,
      duration: Number(item.duration) || 0,
      statusDetails,
    }];

    testCases.push({
      uuid: item.executionId || item.id || randomUUID(),
      historyId: String(crc32(item.caseId || item.caseName || item.id)),
      name: item.caseName,
      fullName: `${suite}.${method} ${item.caseName}`,
      suite,
      subSuites: [],
      packages: ["ApiCollection"],
      labels,
      links: item.executionId ? [{ name: "execution", url: `/reports/${item.executionId}`, type: "page" }] : [],
      categories: [{ name: "auto", messageRegex: ".*" }],
      steps,
      fixtures: [],
      behaviors: {
        epic: suite,
        features: [method],
        stories: [item.caseName],
      },
      testStage: "finished",
      start,
      stop,
      duration: Number(item.duration) || 0,
      status: allureStatus,
      statusDetails,
      description: `${method} ${url}`,
      descriptionHtml: `<p><strong>${escapeHtml(item.caseName)}</strong></p><p><code>${escapeHtml(method)} ${escapeHtml(url)}</code></p>${
        item.statusCode != null ? `<p><strong>HTTP ${item.statusCode}</strong></p>` : ""
      }`,
      flaky: false,
      muted: false,
      parameter: [],
    });
  }

  return testCases;
}

/**
 * 将接口集合报告生成 Allure 官方 HTML 报告并打包为 ZIP 的 Buffer
 *
 * 流程：转换 → 写入临时 results 目录 → allure generate → 打包 report 目录为 ZIP
 * 依赖 allure 命令行（`allure --version`）可用；失败时抛出带说明的错误。
 */
export function buildCollectionRunAllureZip(run: CollectionRunReport): Buffer {
  const resultsDir = mkdtempSync(join(tmpdir(), "autotest-allure-results-"));
  const reportDir = mkdtempSync(join(tmpdir(), "autotest-allure-report-"));
  try {
    const testCases = convertCollectionRunToAllure(run);
    for (const tc of testCases) {
      // Allure result 文件命名：{uuid}-result.json
      writeFileSync(join(resultsDir, `${tc.uuid}-result.json`), JSON.stringify(tc));
    }
    if (testCases.length === 0) {
      // 空集合也生成一份占位 result，避免 allure generate 失败
      writeFileSync(
        join(resultsDir, `${randomUUID()}-result.json`),
        JSON.stringify({
          uuid: randomUUID(), name: "空集合", status: "skipped", stage: "finished",
          start: Date.now(), stop: Date.now(), labels: [{ name: "suite", value: run.collectionName || "接口集合" }],
        }),
      );
    }

    execFileSync("allure", ["generate", resultsDir, "-o", reportDir, "--clean"], {
      stdio: "pipe",
      timeout: 120000,
      // Windows 下 allure 是 shell 脚本（.bat/无扩展名包装），需经 shell 解析；POSIX 下同样兼容
      shell: process.platform === "win32",
    });

    const zip = new AdmZip();
    const addDir = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        const target = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) addDir(full, target);
        else zip.addFile(target, readFileSync(full));
      }
    };
    addDir(reportDir, "");

    // 因 Allure 报告是 SPA，双击 index.html 会因 file:// 下 fetch 被 CORS 拦截而无法加载数据（表现为全 500/空白）。
    // 故内置一个启动脚本：用 allure CLI 起本地 HTTP 服务并自动打开浏览器。
    const suiteName = run.collectionName || run.collectionPath || "接口集合";
    const port = 4567;
    const launcher = [
      "@echo off",
      "chcp 65001 >nul",
      "title Allure 报告 - " + suiteName,
      "echo 正在启动 Allure 报告本地服务，浏览器将自动打开...",
      "echo 关闭本窗口即停止服务。若未自动打开，请手动访问 http://127.0.0.1:" + port,
      `allure open "%~dp0." --port ${port}`,
      "pause",
    ].join("\r\n");
    zip.addFile("打开报告.bat", Buffer.from(launcher, "utf8"));
    zip.addFile(
      "使用说明.txt",
      Buffer.from(
        [
          "Allure 报告使用说明",
          "====================",
          "",
          "双击「打开报告.bat」，将自动启动本地服务并在浏览器打开报告。",
          "（需已安装 Allure 命令行：https://allurereport.org/docs/install）",
          "",
          "请不要直接双击 index.html 打开——Allure 报告依赖 fetch 加载数据，",
          "通过 file:// 方式打开时会被浏览器安全策略拦截，导致内容无法显示。",
          "",
          `报告内容：${suiteName}（${run.total ?? 0} 个接口，通过 ${run.passed ?? 0} / 失败 ${run.failed ?? 0}）`,
          `触发方式：${run.triggerType === "schedule" ? "定时任务" : "手动执行"}`,
        ].join("\r\n"),
        "utf8",
      ),
    );
    return zip.toBuffer();
  } finally {
    rmSync(resultsDir, { recursive: true, force: true });
    rmSync(reportDir, { recursive: true, force: true });
  }
}

/**
 * 内存数据层 — Phase 1 使用内存存储，Phase 2 迁移到 PostgreSQL
 */
import { v4 as uuid } from "uuid";
// ---- In-memory stores ----
export const cases = [
    {
        id: "case-1",
        name: "登录功能回归",
        description: "验证登录页面的正常登录、错误提示、密码找回功能",
        script: `import { test, expect } from '@playwright/test';
test('正常登录', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="username"]', 'admin');
  await page.fill('[name="password"]', 'pass123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard');
});`,
        language: "typescript",
        tags: ["登录", "P0", "回归"],
        group: "用户模块",
        environmentId: "env-1",
        status: "active",
        version: 3,
        createdAt: "2026-07-20T08:00:00Z",
        updatedAt: "2026-07-23T10:30:00Z",
    },
    {
        id: "case-2",
        name: "订单创建流程",
        description: "端到端测试：搜索商品 → 加购物车 → 结算 → 确认订单",
        script: `import { test, expect } from '@playwright/test';
test('创建订单', async ({ page }) => {
  await page.goto('/products');
  await page.click('[data-testid="add-cart-1"]');
  await page.click('[data-testid="checkout"]');
  await page.fill('[name="address"]', '北京市朝阳区');
  await page.click('[data-testid="confirm-order"]');
  await expect(page.locator('.success')).toBeVisible();
});`,
        language: "typescript",
        tags: ["订单", "P0", "端到端"],
        group: "交易模块",
        environmentId: "env-2",
        status: "active",
        version: 5,
        createdAt: "2026-07-18T09:00:00Z",
        updatedAt: "2026-07-23T14:00:00Z",
    },
    {
        id: "case-3",
        name: "搜索功能验证",
        description: "验证商品搜索的精确匹配、模糊匹配和空结果处理",
        script: "",
        language: "typescript",
        tags: ["搜索", "P1"],
        group: "商品模块",
        environmentId: "env-1",
        status: "draft",
        version: 1,
        createdAt: "2026-07-22T11:00:00Z",
        updatedAt: "2026-07-22T11:00:00Z",
    },
];
export const executions = [
    {
        id: "exec-1",
        caseId: "case-1",
        caseName: "登录功能回归",
        status: "success",
        startTime: "2026-07-24T09:00:00Z",
        endTime: "2026-07-24T09:02:15Z",
        duration: 135000,
        logs: [
            { timestamp: "09:00:01", level: "info", message: "开始执行：登录功能回归" },
            { timestamp: "09:00:05", level: "info", message: "✓ 页面加载完成" },
            { timestamp: "09:00:12", level: "info", message: "✓ 填写用户名" },
            { timestamp: "09:00:18", level: "info", message: "✓ 填写密码" },
            { timestamp: "09:00:25", level: "info", message: "✓ 点击登录按钮" },
            { timestamp: "09:02:10", level: "info", message: "✓ 验证跳转到 Dashboard" },
            { timestamp: "09:02:15", level: "info", message: "执行完成：通过 (6步, 135s)" },
        ],
        steps: [],
        screenshots: [],
    },
    {
        id: "exec-2",
        caseId: "case-2",
        caseName: "订单创建流程",
        status: "running",
        startTime: "2026-07-24T09:10:00Z",
        logs: [
            { timestamp: "09:10:01", level: "info", message: "开始执行：订单创建流程" },
            { timestamp: "09:10:08", level: "info", message: "✓ 商品页面加载" },
            { timestamp: "09:10:15", level: "info", message: "✓ 添加到购物车" },
            { timestamp: "09:10:22", level: "warn", message: "⚠ 结算按钮响应较慢 (3.2s)" },
        ],
        steps: [],
        screenshots: [],
    },
    {
        id: "exec-3",
        caseId: "case-1",
        caseName: "登录功能回归",
        status: "failed",
        startTime: "2026-07-23T14:00:00Z",
        endTime: "2026-07-23T14:01:42Z",
        duration: 102000,
        logs: [
            { timestamp: "14:00:01", level: "info", message: "开始执行：登录功能回归" },
            { timestamp: "14:00:08", level: "info", message: "✓ 页面加载完成" },
            { timestamp: "14:01:40", level: "error", message: "✗ 元素未找到: button[type='submit']" },
            { timestamp: "14:01:42", level: "info", message: "执行完成：失败" },
        ],
        steps: [],
        screenshots: [],
        errorMessage: "元素未找到: button[type='submit']，可能页面结构已变更",
    },
    {
        id: "exec-4",
        caseId: "case-1",
        caseName: "登录功能回归",
        status: "success",
        startTime: "2026-07-23T10:00:00Z",
        endTime: "2026-07-23T10:01:58Z",
        duration: 118000,
        logs: [{ timestamp: "10:00:01", level: "info", message: "登录测试通过 ✓" }],
        steps: [],
        screenshots: [],
    },
    {
        id: "exec-5",
        caseId: "case-2",
        caseName: "订单创建流程",
        status: "timeout",
        startTime: "2026-07-22T16:00:00Z",
        endTime: "2026-07-22T16:05:00Z",
        duration: 300000,
        logs: [{ timestamp: "16:05:00", level: "error", message: "执行超时 (5min)" }],
        steps: [],
        screenshots: [],
        errorMessage: "执行超过 5 分钟自动终止",
    },
];
export const reports = [
    {
        id: "rpt-1",
        executionId: "exec-1",
        caseId: "case-1",
        caseName: "登录功能回归",
        status: "success",
        startTime: "2026-07-24T09:00:00Z",
        endTime: "2026-07-24T09:02:15Z",
        duration: 135000,
        steps: [
            { id: "s1", action: "goto", selector: "/login", status: "success", duration: 2100 },
            { id: "s2", action: "fill", selector: '[name="username"]', status: "success", duration: 450 },
            { id: "s3", action: "fill", selector: '[name="password"]', status: "success", duration: 380 },
            { id: "s4", action: "click", selector: "button[type='submit']", status: "success", duration: 820 },
        ],
        screenshots: [],
        logs: [],
        createdAt: "2026-07-24T09:02:15Z",
    },
    {
        id: "rpt-2",
        executionId: "exec-3",
        caseId: "case-1",
        caseName: "登录功能回归",
        status: "failed",
        startTime: "2026-07-23T14:00:00Z",
        endTime: "2026-07-23T14:01:42Z",
        duration: 102000,
        steps: [
            { id: "s1", action: "goto", selector: "/login", status: "success", duration: 1800 },
            { id: "s2", action: "click", selector: "button[type='submit']", status: "failed", duration: 5000, error: "元素未找到" },
        ],
        screenshots: [],
        logs: [],
        errorMessage: "元素未找到: button[type='submit']",
        createdAt: "2026-07-23T14:01:42Z",
    },
    {
        id: "rpt-3",
        executionId: "exec-4",
        caseId: "case-1",
        caseName: "登录功能回归",
        status: "success",
        startTime: "2026-07-23T10:00:00Z",
        endTime: "2026-07-23T10:01:58Z",
        duration: 118000,
        steps: [],
        screenshots: [],
        logs: [],
        createdAt: "2026-07-23T10:01:58Z",
    },
];
export const elements = [
    {
        id: "el-1",
        name: "登录按钮",
        type: "button",
        selector: "button[type='submit']",
        selectorType: "css",
        page: "登录页",
        description: "登录表单的提交按钮",
        tags: ["登录", "P0"],
        source: "recording",
        usageCount: 12,
        lastUsed: "2026-07-24T09:00:00Z",
        createdAt: "2026-07-15T08:00:00Z",
    },
    {
        id: "el-2",
        name: "用户名输入框",
        type: "input",
        selector: 'input[name="username"]',
        selectorType: "css",
        page: "登录页",
        description: "用户名输入框",
        tags: ["登录"],
        source: "recording",
        usageCount: 18,
        lastUsed: "2026-07-24T09:00:00Z",
        createdAt: "2026-07-15T08:00:00Z",
    },
    {
        id: "el-3",
        name: "密码输入框",
        type: "input",
        selector: 'input[name="password"]',
        selectorType: "css",
        page: "登录页",
        description: "密码输入框",
        tags: ["登录"],
        source: "recording",
        usageCount: 18,
        lastUsed: "2026-07-24T09:00:00Z",
        createdAt: "2026-07-15T08:00:00Z",
    },
    {
        id: "el-4",
        name: "搜索框",
        type: "input",
        selector: '[data-testid="search-input"]',
        selectorType: "css",
        page: "首页",
        description: "全局搜索输入框",
        tags: ["导航", "P1"],
        source: "auto-import",
        usageCount: 5,
        createdAt: "2026-07-20T10:00:00Z",
    },
    {
        id: "el-5",
        name: "确认订单按钮",
        type: "button",
        selector: '[data-testid="confirm-order"]',
        selectorType: "css",
        page: "结算页",
        description: "确认订单并提交",
        tags: ["订单", "P0"],
        source: "manual",
        usageCount: 3,
        createdAt: "2026-07-22T15:00:00Z",
    },
];
export const environments = [
    {
        id: "env-1",
        name: "开发环境",
        url: "https://dev.example.com",
        type: "dev",
        variables: { API_URL: "https://api-dev.example.com" },
        accounts: [{ username: "qa01", password: "qa01pass", role: "测试账号" }],
        status: "online",
    },
    {
        id: "env-2",
        name: "预发布环境",
        url: "https://staging.example.com",
        type: "staging",
        variables: { API_URL: "https://api-staging.example.com" },
        accounts: [{ username: "stage01", password: "stagepass", role: "预发布测试" }],
        status: "online",
    },
    {
        id: "env-3",
        name: "生产环境",
        url: "https://www.example.com",
        type: "prod",
        variables: { API_URL: "https://api.example.com" },
        accounts: [],
        status: "online",
    },
];
export const schedules = [
    {
        id: "sched-1",
        name: "每日回归测试",
        cronExpression: "0 8 * * 1-5",
        caseIds: ["case-1", "case-2"],
        environmentId: "env-2",
        enabled: true,
        lastRunTime: "2026-07-24T08:00:00Z",
        nextRunTime: "2026-07-25T08:00:00Z",
    },
    {
        id: "sched-2",
        name: "登录冒烟测试",
        cronExpression: "*/30 * * * *",
        caseIds: ["case-1"],
        environmentId: "env-1",
        enabled: false,
    },
];
export const alerts = [
    {
        id: "alert-1",
        name: "失败通知-钉钉",
        channel: "dingtalk",
        webhookUrl: "https://oapi.dingtalk.com/robot/send?access_token=xxx",
        notifyLevels: ["failed", "timeout"],
        template: "【自动化告警】用例「{{caseName}}」执行失败：{{errorMessage}}",
        enabled: true,
    },
    {
        id: "alert-2",
        name: "日报-飞书",
        channel: "feishu",
        webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/xxx",
        notifyLevels: ["success", "failed"],
        template: "【日报】今日执行 {{total}} 条，通过 {{pass}} 条，失败 {{fail}} 条",
        enabled: true,
    },
];
// ---- CRUD Helpers ----
export function createId() {
    return uuid();
}
export function now() {
    return new Date().toISOString();
}
//# sourceMappingURL=store.js.map
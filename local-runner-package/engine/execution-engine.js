/**
 * 用例执行引擎 — 用 Playwright 真实运行用户编写的测试脚本
 *
 * 流程：
 * 1. 解析脚本 → 移除 import/test 包装 → 提取操作语句
 * 2. 复用已有浏览器页面（首次创建）
 * 3. 在 page 上下文执行脚本 → 逐行捕获日志
 * 4. 完成后等待一段时间截图、再关闭页面 → 返回结果
 *    （等待时长可通过 settings 表的 execution.final_delay_ms / execution.close_delay_ms 配置）
 */
import { getBrowser } from "./browser.js";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import sharp from "sharp";
import vm from "vm";
async function getExecutionPage() {
    const browser = await getBrowser(false);
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("dialog", async (dialog) => { await dialog.accept(); });
    return { page, context };
}
/** 内部标记错误：区分「被用户取消打断」与「真实执行失败」（取消竞态修复用） */
class ExecutionCancelled extends Error {
}
/** 浏览器 console/pageerror 日志收集上限：最多保留前 500 条，单条截断 2000 字符 */
const MAX_BROWSER_LOGS = 500;
const MAX_BROWSER_LOG_LENGTH = 2000;
// 默认值与历史行为保持一致
const DEFAULT_EXECUTION_DELAYS = {
    actionDelayMs: 300,
    finalDelayMs: 3000,
    closeDelayMs: 4000,
};
/** 延迟数值 clamp（0~10000ms），防止脏配置产生极端值 */
export function clampDelayMs(value, fallback) {
    if (value === null || value === undefined || value === "")
        return fallback;
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.min(10000, Math.max(0, Math.round(parsed)));
}
/**
 * 从 settings 表读取人为延迟配置（key-value，读取方式与 case-execution.ts 的 maxConcurrency 一致）。
 * 默认值 = 历史固定值，行为不变但可调优：
 * - execution.action_delay_ms = 300
 * - execution.final_delay_ms  = 3000
 * - execution.close_delay_ms  = 4000
 * 采用懒加载动态 import，避免本地执行器等无数据库场景在模块加载期强依赖 db。
 */
async function loadExecutionDelays() {
    try {
        const { query } = await import("./data/db.js");
        const read = (key, fallback) => {
            const row = query("SELECT value FROM settings WHERE key = ?", key)[0];
            if (!row)
                return fallback;
            try {
                return clampDelayMs(JSON.parse(row.value), fallback);
            }
            catch {
                return fallback;
            }
        };
        return {
            actionDelayMs: read("execution.action_delay_ms", DEFAULT_EXECUTION_DELAYS.actionDelayMs),
            finalDelayMs: read("execution.final_delay_ms", DEFAULT_EXECUTION_DELAYS.finalDelayMs),
            closeDelayMs: read("execution.close_delay_ms", DEFAULT_EXECUTION_DELAYS.closeDelayMs),
        };
    }
    catch {
        return { ...DEFAULT_EXECUTION_DELAYS };
    }
}
function waitForFinalPage(delayMs, signal) {
    if (signal?.aborted)
        return Promise.resolve(false);
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", handleAbort);
            resolve(true);
        }, delayMs);
        const handleAbort = () => {
            clearTimeout(timer);
            resolve(false);
        };
        signal?.addEventListener("abort", handleAbort, { once: true });
    });
}
async function captureFinalScreenshot(page, logs, signal, delays, skipDelay = false) {
    // 取消路径：abort 监听已关闭页面，直接跳过等待与截图，避免固定再等 3 秒
    if (signal?.aborted)
        return undefined;
    const finishedAt = Date.now();
    if (skipDelay) {
        logs.push({
            timestamp: new Date().toISOString(),
            level: "info",
            message: "执行已超时，跳过固定等待并立即截取最终页面",
        });
    }
    else {
        logs.push({
            timestamp: new Date().toISOString(),
            level: "info",
            message: `用例步骤已结束，浏览器将在 ${Math.round(delays.closeDelayMs / 1000)} 秒后关闭，并在第 ${Math.round(delays.finalDelayMs / 1000)} 秒截取最终页面`,
        });
    }
    const shouldCapture = skipDelay || (await waitForFinalPage(delays.finalDelayMs, signal));
    if (!shouldCapture)
        return undefined;
    let screenshot;
    try {
        if (page && !page.isClosed()) {
            const buffer = await page.screenshot({ type: "png", fullPage: false, timeout: 5000 });
            screenshot = buffer.toString("base64");
            logs.push({
                timestamp: new Date().toISOString(),
                level: "info",
                message: `已在用例结束后第 ${Math.round(delays.finalDelayMs / 1000)} 秒截取最终页面 (${buffer.length} bytes)`,
            });
        }
        else {
            logs.push({ timestamp: new Date().toISOString(), level: "warn", message: "无法截取执行结束截图：页面不可用" });
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logs.push({ timestamp: new Date().toISOString(), level: "warn", message: `执行结束截图失败: ${errorMessage}` });
    }
    const remainingDelay = skipDelay ? 0 : Math.max(0, delays.closeDelayMs - (Date.now() - finishedAt));
    await waitForFinalPage(remainingDelay, signal);
    return screenshot;
}
/**
 * 包装用户脚本为可执行函数体
 * 去掉 import 声明、test() 包装，只保留测试步骤
 */
export function wrapScript(script) {
    let body = script;
    // 1. 移除 import 语句
    body = body.replace(/import\s+.*?from\s+['"].*?['"]\s*;?/g, "");
    // 2. 提取 test() 函数体
    const testMatch = body.match(/test\s*\(\s*['"`].*?['"`]\s*,\s*async\s*\(\s*\{\s*page\s*\}\s*\)\s*=>\s*\{([\s\S]*)\}\s*\)\s*;?\s*$/);
    if (testMatch) {
        body = testMatch[1];
    }
    else {
        // 如果不是标准 test() 格式，尝试直接使用（移除残留的包装符号）
        body = body.replace(/^\s*test\s*\([^)]*\)\s*=>\s*\{\s*/, "").replace(/\}\s*\)\s*;?\s*$/, "");
    }
    return body;
}
/**
 * 执行用例脚本并返回结果
 */
export async function executeCase(script, scriptName = "unnamed", baseUrl = "https://example.com", signal, options = {}) {
    const startTime = Date.now();
    const timeoutMs = Math.max(1000, options.timeoutMs || 60000);
    const delays = await loadExecutionDelays();
    let timedOut = false; // 超时标记：供 catch 路径跳过固定等待使用
    const logs = [{ timestamp: new Date().toISOString(), level: "info", message: `🚀 开始执行: ${scriptName}` }];
    const steps = [];
    let executionPage = null;
    let executionContext = null;
    try {
        const { page, context } = await getExecutionPage();
        executionPage = page;
        executionContext = context;
        // 放慢操作速度，方便观察（每次动作等待 execution.action_delay_ms，默认 300ms）
        page.on("dialog", async (dialog) => { await dialog.accept(); });
        // ★ 注册中止信号
        if (signal) {
            signal.addEventListener("abort", () => {
                try {
                    page?.close();
                }
                catch { /* intentionally ignored */ }
                try {
                    context?.close();
                }
                catch { /* intentionally ignored */ }
                logs.push({ timestamp: new Date().toISOString(), level: "warn", message: "🛑 执行已被用户取消" });
            }, { once: true });
        }
        // 在 page 上挂载日志拦截（浏览器日志有上限：最多前 500 条、单条截断 2000 字符，防止长跑内存膨胀）
        let browserLogCount = 0;
        let browserLogOverflowNotified = false;
        const pushBrowserLog = (level, prefix, text) => {
            if (browserLogCount >= MAX_BROWSER_LOGS) {
                if (!browserLogOverflowNotified) {
                    browserLogOverflowNotified = true;
                    logs.push({
                        timestamp: new Date().toISOString(),
                        level: "warn",
                        message: `[Browser] 浏览器日志已达上限（${MAX_BROWSER_LOGS} 条），后续浏览器日志不再收集`,
                    });
                }
                return;
            }
            browserLogCount += 1;
            logs.push({
                timestamp: new Date().toISOString(),
                level,
                message: `${prefix}${text.slice(0, MAX_BROWSER_LOG_LENGTH)}`,
            });
        };
        page.on("console", (msg) => {
            pushBrowserLog(msg.type() === "error" ? "error" : msg.type() === "warning" ? "warn" : "info", "[Browser] ", msg.text());
        });
        page.on("pageerror", (err) => {
            pushBrowserLog("error", "[PageError] ", err.message);
        });
        logs.push({ timestamp: new Date().toISOString(), level: "info", message: "🌐 浏览器已启动" });
        // 智能导航：脚本有 page.goto 则让它自己处理；没有则用 baseUrl 预先导航
        const hasGoto = /page\.goto\s*\(/.test(script);
        if (!hasGoto && baseUrl && baseUrl !== "about:blank") {
            logs.push({ timestamp: new Date().toISOString(), level: "info", message: `🌐 自动导航至环境URL: ${baseUrl}` });
            try {
                const gotoStart = Date.now();
                await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
                steps.push({
                    id: `step-${steps.length + 1}`,
                    action: "navigate",
                    selector: baseUrl,
                    status: "pass",
                    duration: Date.now() - gotoStart,
                });
                logs.push({ timestamp: new Date().toISOString(), level: "info", message: `✅ 页面加载完成` });
            }
            catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                logs.push({ timestamp: new Date().toISOString(), level: "error", message: `❌ 页面加载失败: ${errorMessage}` });
            }
        }
        // 包装脚本
        const body = wrapScript(script);
        logs.push({
            timestamp: new Date().toISOString(),
            level: "info",
            message: `📝 脚本已解析 (${body.split("\n").filter(Boolean).length} 行有效代码)`,
        });
        // 注入代理函数，拦截 page 关键操作来记录步骤
        // 辅助：修复 CSS 选择器（处理 React \: 转义、#:r2: 非法 ID）
        function fixSelector(sel) {
            // 将 #\:xx\: 或 #:xx: 转为合法的 [id="..."] 选择器
            return sel.replace(/#((?:\\:)?[^ >+~,.\[#]+(?:\\:[^ >+~,.\[#]*)*)/g, (_, id) => {
                const rawId = id.replace(/\\:/g, ":");
                // 如果 ID 包含非法 CSS 字符（如 :），改用属性选择器
                if (/[^\w-]/.test(rawId)) {
                    return `[id="${rawId.replace(/"/g, '\\"')}"]`;
                }
                return `#${rawId}`;
            });
        }
        const origGoto = page.goto.bind(page);
        page.goto = async (url, _opts) => {
            const stepStart = Date.now();
            // 解析相对路径
            const resolved = url.startsWith("http") ? url : baseUrl.replace(/\/$/, "") + "/" + url.replace(/^\//, "");
            logs.push({ timestamp: new Date().toISOString(), level: "info", message: `🌐 导航: ${resolved}` });
            const result = await origGoto(resolved, { timeout: 15000, waitUntil: "domcontentloaded" });
            steps.push({ id: `step-${steps.length + 1}`, action: "navigate", selector: resolved, status: "pass", duration: Date.now() - stepStart });
            return result;
        };
        const origClick = page.click.bind(page);
        page.click = async (sel, opts) => {
            sel = fixSelector(sel);
            const stepStart = Date.now();
            // 先滚动到元素可见
            try {
                await page.locator(sel).scrollIntoViewIfNeeded({ timeout: 3000 });
            }
            catch { /* intentionally ignored */ }
            await new Promise(r => setTimeout(r, delays.actionDelayMs)); // 视觉延迟（execution.action_delay_ms 可配置）
            logs.push({ timestamp: new Date().toISOString(), level: "info", message: `🖱 点击: ${sel}` });
            try {
                const result = await origClick(sel, { timeout: 10000, ...opts });
                steps.push({ id: `step-${steps.length + 1}`, action: "click", selector: sel, status: "pass", duration: Date.now() - stepStart });
                return result;
            }
            catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                steps.push({ id: `step-${steps.length + 1}`, action: "click", selector: sel, status: "fail", duration: Date.now() - stepStart });
                throw errorMessage;
            }
        };
        const origFill = page.fill.bind(page);
        page.fill = async (sel, value, opts) => {
            sel = fixSelector(sel);
            const stepStart = Date.now();
            logs.push({ timestamp: new Date().toISOString(), level: "info", message: `⌨ 输入: ${sel} = "${value}"` });
            try {
                await page.locator(sel).scrollIntoViewIfNeeded({ timeout: 3000 });
            }
            catch { /* intentionally ignored */ }
            await new Promise(r => setTimeout(r, delays.actionDelayMs)); // 视觉延迟（execution.action_delay_ms 可配置）
            try {
                const result = await origFill(sel, value, { timeout: 10000, ...opts });
                steps.push({ id: `step-${steps.length + 1}`, action: "fill", selector: sel, status: "pass", duration: Date.now() - stepStart });
                return result;
            }
            catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                steps.push({ id: `step-${steps.length + 1}`, action: "fill", selector: sel, status: "fail", duration: Date.now() - stepStart });
                throw errorMessage;
            }
        };
        // 执行脚本 — 超时由 options.timeoutMs 控制（默认 60 秒）
        logs.push({ timestamp: new Date().toISOString(), level: "info", message: "▶ 开始执行测试步骤..." });
        /**
         * 安全执行：用户脚本在受限 vm 沙箱中运行，不再使用 new Function。
         * 沙箱仅注入 page / expect / console / visualAssert 及安全的定时器，
         * 脚本无法访问 process、fetch、require、Buffer 等 Node 全局。
         * （注意：vm 非强隔离，生产部署仍需配合认证与网络隔离）
         */
        const describeTarget = (target) => (target === page ? "page" : String(target));
        const matchesExpected = (actual, expected) => expected instanceof RegExp ? expected.test(actual) : actual === expected;
        // 兼容两种目标：expect(page)（整体页面断言）与 expect(locator)（元素断言）
        const pageTarget = page;
        const domTarget = (target) => (target === page ? pageTarget.locator("*") : target);
        const pageUrlOf = async (target) => target === page ? pageTarget.url() : ((await target.evaluate(() => location.href)) || "");
        const pageTitleOf = async (target) => target === page ? (await pageTarget.title().catch(() => "")) : ((await target.evaluate(() => document.title)) || "");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const createMatchers = (target, negated = false) => {
            const assertMatch = async (label, evaluate) => {
                const assertionStart = Date.now();
                const selector = describeTarget(target);
                try {
                    const matched = await evaluate();
                    if (negated ? matched : !matched) {
                        throw new Error(`断言失败: ${negated ? "不应" : "应"}${label}`);
                    }
                    steps.push({ id: `step-${steps.length + 1}`, action: "assert", selector, status: "pass", duration: Date.now() - assertionStart });
                    logs.push({ timestamp: new Date().toISOString(), level: "info", message: `✅ 断言通过: ${negated ? "不" : ""}${label}` });
                }
                catch (error) {
                    steps.push({ id: `step-${steps.length + 1}`, action: "assert", selector, status: "fail", duration: Date.now() - assertionStart });
                    throw error;
                }
            };
            const loc = () => domTarget(target);
            return {
                get not() { return createMatchers(target, !negated); },
                toBeVisible: () => assertMatch("元素可见", async () => loc().isVisible()),
                toBeHidden: () => assertMatch("元素隐藏", async () => !(await loc().isVisible())),
                toBeEnabled: () => assertMatch("元素可用", async () => loc().isEnabled()),
                toBeDisabled: () => assertMatch("元素禁用", async () => loc().isDisabled()),
                toBeChecked: () => assertMatch("元素已选中", async () => loc().isChecked()),
                toHaveText: (expected) => assertMatch(`文本等于 "${expected}"`, async () => (await loc().textContent()) === expected),
                toContainText: (expected) => assertMatch(`文本包含 "${expected}"`, async () => String(await loc().textContent() || "").includes(expected)),
                toHaveValue: (expected) => assertMatch(`输入值等于 "${expected}"`, async () => (await loc().inputValue()) === expected),
                toHaveAttribute: (name, expected) => assertMatch(`属性 ${name} 等于 "${expected}"`, async () => (await loc().getAttribute(name)) === expected),
                toHaveCount: (expected) => assertMatch(`元素数量等于 ${expected}`, async () => (await loc().count()) === expected),
                toHaveURL: (expected) => assertMatch(`URL 匹配 ${String(expected)}`, async () => matchesExpected(await pageUrlOf(target), expected)),
                toHaveTitle: (expected) => assertMatch(`标题匹配 ${String(expected)}`, async () => matchesExpected(await pageTitleOf(target), expected)),
            };
        };
        const mockExpect = (target) => createMatchers(target);
        const visualAssert = async (target, stepId) => {
            const assertionStart = Date.now();
            const selector = describeTarget(target);
            try {
                const baseline = options.visualBaselines?.[stepId];
                if (!baseline?.image)
                    throw new Error("图片断言缺少基准截图");
                const encoded = baseline.image.includes(",") ? baseline.image.slice(baseline.image.indexOf(",") + 1) : baseline.image;
                const expected = PNG.sync.read(Buffer.from(encoded, "base64"));
                const screenshotOptions = { type: "png", animations: "disabled", caret: "hide" };
                const shotBuffer = target === page
                    ? await pageTarget.screenshot(screenshotOptions)
                    : (await target.screenshot(screenshotOptions));
                let current = PNG.sync.read(shotBuffer);
                if (current.width !== expected.width || current.height !== expected.height) {
                    const originalSize = `${current.width}x${current.height}`;
                    const resizedBuffer = await sharp(shotBuffer)
                        .resize(expected.width, expected.height, { fit: "fill", kernel: "lanczos3" })
                        .png()
                        .toBuffer();
                    current = PNG.sync.read(resizedBuffer);
                    logs.push({
                        timestamp: new Date().toISOString(),
                        level: "info",
                        message: `图片尺寸已归一化: ${originalSize} → ${expected.width}x${expected.height}`,
                    });
                }
                const differentPixels = pixelmatch(expected.data, current.data, undefined, expected.width, expected.height, { threshold: 0.1, includeAA: false });
                const similarity = (1 - differentPixels / (expected.width * expected.height)) * 100;
                const required = Math.min(100, Math.max(0, Number(baseline.similarityThreshold) || 99));
                if (similarity < required) {
                    throw new Error(`图片相似度不足: 实际 ${similarity.toFixed(2)}%，要求 ${required.toFixed(2)}%`);
                }
                steps.push({ id: `step-${steps.length + 1}`, action: "assert", selector, status: "pass", duration: Date.now() - assertionStart });
                logs.push({ timestamp: new Date().toISOString(), level: "info", message: `✅ 图片断言通过: 相似度 ${similarity.toFixed(2)}%` });
            }
            catch (error) {
                steps.push({ id: `step-${steps.length + 1}`, action: "assert", selector, status: "fail", duration: Date.now() - assertionStart });
                throw error;
            }
        };
        const consoleMock = {
            log: (...args) => logs.push({ timestamp: new Date().toISOString(), level: "info", message: args.join(" ") }),
            warn: (...args) => logs.push({ timestamp: new Date().toISOString(), level: "warn", message: args.join(" ") }),
            error: (...args) => logs.push({ timestamp: new Date().toISOString(), level: "error", message: args.join(" ") }),
        };
        // 受限沙箱：禁止 process/fetch/require/Buffer 等危险全局；仅注入安全白名单
        const sandbox = Object.create(null);
        sandbox.page = page;
        sandbox.expect = mockExpect;
        sandbox.console = consoleMock;
        sandbox.visualAssert = visualAssert;
        sandbox.setTimeout = setTimeout;
        sandbox.clearTimeout = clearTimeout;
        const sandboxContext = vm.createContext(sandbox);
        const execPromise = vm.runInContext(`(async () => {\n${body}\n})()`, sandboxContext, { filename: `case:${scriptName}.js` });
        // 超时定时器句柄必须保留：竞速结束后 clearTimeout，
        // 否则定时器会 keep-alive 进程直到超时触发（每次执行泄漏一个定时器）
        let timeoutTimer;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutTimer = setTimeout(() => {
                timedOut = true; // 供 catch 路径跳过固定的截图等待
                reject(new Error(`执行超时 (${Math.round(timeoutMs / 1000)}s)`));
            }, timeoutMs);
        });
        // 取消竞态：用专门的标记错误参与竞速，catch 中依据错误类型判断「race 的胜出者是 abort」，
        // 避免「取消发生在结果已产生之后」时把真实结果误标为 cancelled
        let rejectOnAbort;
        const onAbort = () => rejectOnAbort?.(new ExecutionCancelled("执行已取消"));
        if (signal)
            signal.addEventListener("abort", onAbort, { once: true });
        const abortedPromise = signal ? new Promise((_, reject) => { rejectOnAbort = reject; }) : null;
        const racers = [execPromise, timeoutPromise];
        if (abortedPromise)
            racers.push(abortedPromise);
        try {
            await Promise.race(racers);
        }
        finally {
            // 无论胜出者是谁都要清理：clearTimeout 防定时器泄漏，移除 abort 监听防止重试时叠加
            if (timeoutTimer !== undefined)
                clearTimeout(timeoutTimer);
            if (signal)
                signal.removeEventListener("abort", onAbort);
        }
        const duration = Date.now() - startTime;
        logs.push({ timestamp: new Date().toISOString(), level: "info", message: `✅ 执行完成 (${duration}ms, ${steps.length} 个步骤)` });
        const screenshot = await captureFinalScreenshot(executionPage, logs, signal, delays);
        return { status: "pass", logs, duration, steps, screenshot };
    }
    catch (err) {
        const duration = Date.now() - startTime;
        const cancelledByAbort = err instanceof ExecutionCancelled; // Promise.race 的胜出者是 abort（用户取消）
        const errorMsg = err instanceof Error ? err?.message : String(err);
        logs.push({ timestamp: new Date().toISOString(), level: "error", message: `❌ 执行失败: ${errorMsg}` });
        // 成功或失败都保留最终页面，便于在测试结果中查看执行结束状态。
        // 超时路径（timedOut）跳过固定等待立即截图；取消路径由 captureFinalScreenshot 内部直接跳过（abort 已关页面）。
        const screenshot = await captureFinalScreenshot(executionPage, logs, signal, delays, timedOut);
        return {
            status: "fail",
            logs,
            duration,
            error: errorMsg,
            steps,
            screenshot,
            // 仅当 race 的胜出者是 abort 时标记 cancelled；之后才发生的取消不影响已产生的真实结果
            cancelled: cancelledByAbort,
        };
    }
    finally {
        try {
            if (executionPage && !executionPage.isClosed())
                await executionPage.close();
        }
        catch { /* intentionally ignored */ }
        try {
            if (executionContext)
                await executionContext.close();
        }
        catch { /* intentionally ignored */ }
    }
}
//# sourceMappingURL=execution-engine.js.map
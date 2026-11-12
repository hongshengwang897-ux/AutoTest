import { Router } from "express";
import { randomBytes } from "node:crypto";
import { exec, query } from "./data/db.js";
/**
 * 认证层：
 * - token 来源优先级：环境变量 AUTOTEST_API_TOKEN > settings 表 apiToken
 * - 若两者均未配置，启动时自动生成随机 token 并持久化（前端在设置页查看）
 * - 中间件校验 `Authorization: Bearer <token>` 或 `x-api-token: <token>`
 * - 本地执行器使用 runner_token 回传，不走本中间件（白名单）
 */
const TOKEN_SETTING_KEY = "apiToken";
/** 读取当前 API token（env > settings 表） */
export function getApiToken() {
    const fromEnv = process.env.AUTOTEST_API_TOKEN?.trim();
    if (fromEnv)
        return fromEnv;
    const row = query("SELECT value FROM settings WHERE key = ?", TOKEN_SETTING_KEY)[0];
    if (row) {
        try {
            const parsed = JSON.parse(row.value);
            if (typeof parsed === "string" && parsed)
                return parsed;
        }
        catch {
            /* ignore */
        }
    }
    return null;
}
/** 确保存在 API token：无则生成并持久化，返回是否启用认证 */
export function ensureApiToken() {
    // 显式关闭：AUTOTEST_API_TOKEN=off 时关闭认证（向后兼容）
    if (process.env.AUTOTEST_API_TOKEN?.trim().toLowerCase() === "off") {
        return { token: "", enabled: false };
    }
    const existing = getApiToken();
    if (existing)
        return { token: existing, enabled: true };
    const generated = randomBytes(24).toString("hex");
    const exists = query("SELECT key FROM settings WHERE key = ?", TOKEN_SETTING_KEY).length > 0;
    if (exists) {
        exec("UPDATE settings SET value = ? WHERE key = ?", JSON.stringify(generated), TOKEN_SETTING_KEY);
    }
    else {
        exec("INSERT INTO settings (key, value) VALUES (?, ?)", TOKEN_SETTING_KEY, JSON.stringify(generated));
    }
    console.log(`[Auth] 已生成 API Token: ${generated}`);
    console.log(`[Auth] 前端系统设置 → 安全 可查看；亦可用 AUTOTEST_API_TOKEN 环境变量指定`);
    return { token: generated, enabled: true };
}
/** 重新生成 token（需已认证） */
export function regenerateApiToken() {
    const generated = randomBytes(24).toString("hex");
    const exists = query("SELECT key FROM settings WHERE key = ?", TOKEN_SETTING_KEY).length > 0;
    if (exists) {
        exec("UPDATE settings SET value = ? WHERE key = ?", JSON.stringify(generated), TOKEN_SETTING_KEY);
    }
    else {
        exec("INSERT INTO settings (key, value) VALUES (?, ?)", TOKEN_SETTING_KEY, JSON.stringify(generated));
    }
    return generated;
}
/** 校验请求是否携带有效 token */
export function isAuthorized(req) {
    const authHeader = String(req.headers.authorization || "");
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const candidate = bearerMatch ? bearerMatch[1].trim() : String(req.headers["x-api-token"] || "");
    const token = getApiToken();
    return !!token && candidate !== "" && candidate === token;
}
/** 认证中间件：挂载在 /api 下，按白名单放行 */
export function requireAuth(req, res, next) {
    const skipPaths = [
        { exact: "/api/health" },
        { prefix: "/api/auth/" },
        // 浏览器注入页面回传元素（无 token，sessionId 为随机 uuid）
        { pattern: /^\/api\/auto-detect\/report\/[\w-]+$/ },
        // 本地执行器回传/验证（使用 runner_token，而非 API token）
        { pattern: /^\/api\/executions\/[\w-]+\/local-result$/ },
        { pattern: /^\/api\/executions\/[\w-]+\/verify$/ },
    ];
    const path = req.originalUrl.split("?")[0];
    const shouldSkip = skipPaths.some((rule) => rule.exact ? path === rule.exact : rule.pattern ? rule.pattern.test(path) : rule.prefix ? path.startsWith(rule.prefix) : false);
    if (shouldSkip) {
        next();
        return;
    }
    if (!isAuthorized(req)) {
        res.status(401).json({ error: "未授权：缺少或无效的 API Token" });
        return;
    }
    next();
}
// ---- /api/auth 路由 ----
const router = Router();
/** GET /api/auth/status — 前端判断是否需要登录 */
router.get("/status", (_req, res) => {
    const token = getApiToken();
    res.json({ authRequired: !!token, hasLocalToken: !!token });
});
/** POST /api/auth/login { token } — 校验 token 是否有效 */
router.post("/login", (req, res) => {
    const candidate = String(req.body?.token || "").trim();
    const token = getApiToken();
    if (!token) {
        res.status(400).json({ error: "认证未启用" });
        return;
    }
    if (candidate === token) {
        res.json({ ok: true, message: "认证成功" });
    }
    else {
        res.status(401).json({ error: "Token 无效" });
    }
});
export default router;
//# sourceMappingURL=auth.js.map
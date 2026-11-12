import { Router } from "express";
import { getApiToken, regenerateApiToken } from "../auth.js";
/**
 * /api/security — 安全设置（需已通过认证）
 * 允许前端展示当前 token、重新生成 token
 */
const router = Router();
// GET /api/security/token — 查看当前 token（脱敏显示 + 完整值）
router.get("/token", (_req, res) => {
    const token = getApiToken();
    if (!token) {
        res.status(400).json({ error: "认证未启用（未配置 token）" });
        return;
    }
    res.json({ token, masked: `${token.slice(0, 4)}…${token.slice(-4)}`, enabled: true });
});
// POST /api/security/token/regenerate — 重新生成 token（旧 token 立即失效）
router.post("/token/regenerate", (_req, res) => {
    if (!getApiToken()) {
        res.status(400).json({ error: "认证未启用（未配置 token）" });
        return;
    }
    const token = regenerateApiToken();
    res.json({ token, masked: `${token.slice(0, 4)}…${token.slice(-4)}`, message: "Token 已重新生成，旧 Token 立即失效" });
});
export default router;
//# sourceMappingURL=security.js.map
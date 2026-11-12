import { Router } from "express";
import { all, get, insert, update, remove, createId } from "../data/db.js";
import { parsePostmanEnvironment } from "../postman-import.js";
const router = Router();
/** 安全解析 JSON 字符串，失败时回退默认值（DB 脏数据不应导致列表 500） */
function safeJsonParse(text, fallback) {
    try {
        return JSON.parse(text);
    }
    catch {
        return fallback;
    }
}
function toApi(row) {
    const r = row;
    return {
        ...row,
        scope: r.scope === "api" ? "api" : "platform",
        variables: typeof r.variables === "string" ? safeJsonParse(r.variables, {}) : (r.variables || {}),
        accounts: typeof r.accounts === "string" ? safeJsonParse(r.accounts, []) : (r.accounts || []),
    };
}
// GET /api/environments
router.get("/", (req, res) => {
    const scope = String(req.query.scope || "");
    let items = all("environments");
    if (scope === "api" || scope === "platform")
        items = items.filter((item) => (item.scope || "platform") === scope);
    res.json({ items: items.map(toApi) });
});
// POST /api/environments
router.post("/", (req, res) => {
    const { name } = req.body;
    if (!name) {
        res.status(400).json({ error: "name is required" });
        return;
    }
    const row = {
        id: createId(),
        name,
        url: req.body.url || "",
        type: req.body.type || "dev",
        scope: req.body.scope === "api" ? "api" : "platform",
        variables: JSON.stringify(req.body.variables || {}),
        accounts: JSON.stringify(req.body.accounts || []),
        status: req.body.status || "online",
    };
    insert("environments", row);
    res.status(201).json(toApi(row));
});
// POST /api/environments/import/postman — 导入 Postman 环境导出（单环境对象或多环境数组）
router.post("/import/postman", (req, res) => {
    try {
        const body = req.body?.collection ?? req.body;
        const scope = req.body?.scope === "platform" ? "platform" : "api";
        const documents = Array.isArray(body) ? body : [body];
        if (documents.length === 0) {
            res.status(400).json({ error: "未找到可导入的环境数据" });
            return;
        }
        const imported = [];
        const warnings = [];
        let createdCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;
        documents.forEach((doc, index) => {
            const parsed = parsePostmanEnvironment(doc);
            if (!parsed || !parsed.name) {
                skippedCount++;
                warnings.push(`第 ${index + 1} 个条目不是有效的 Postman 环境，已跳过`);
                return;
            }
            const existing = all("environments").find((item) => String(item.name) === parsed.name);
            const row = {
                name: parsed.name,
                url: parsed.url,
                type: existing?.type || "dev",
                scope,
                variables: JSON.stringify(parsed.variables),
                accounts: JSON.stringify(existing?.accounts || []),
                status: existing?.status || "online",
            };
            let id;
            if (existing) {
                id = existing.id;
                update("environments", id, row);
                updatedCount++;
            }
            else {
                id = createId();
                insert("environments", { id, ...row });
                createdCount++;
            }
            if (parsed.skippedCount > 0)
                warnings.push(`${parsed.name}: ${parsed.skippedCount} 个已禁用变量未导入`);
            imported.push(toApi({ id, ...row, variables: parsed.variables, accounts: existing?.accounts || [] }));
        });
        if (imported.length === 0) {
            res.status(400).json({ error: "未找到可导入的环境数据" });
            return;
        }
        res.status(createdCount > 0 ? 201 : 200).json({
            kind: "environments",
            imported: createdCount,
            updated: updatedCount,
            skipped: skippedCount,
            environments: imported,
            warnings,
        });
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : "Postman 环境导入失败" });
    }
});
// GET /api/environments/:id
router.get("/:id", (req, res) => {
    const item = get("environments", req.params.id);
    if (!item) {
        res.status(404).json({ error: "not found" });
        return;
    }
    res.json(toApi(item));
});
// PUT /api/environments/:id
router.put("/:id", (req, res) => {
    const existing = get("environments", req.params.id);
    if (!existing) {
        res.status(404).json({ error: "not found" });
        return;
    }
    const data = {};
    if (req.body.name !== undefined)
        data.name = req.body.name;
    if (req.body.url !== undefined)
        data.url = req.body.url;
    if (req.body.type !== undefined)
        data.type = req.body.type;
    if (req.body.scope !== undefined)
        data.scope = req.body.scope === "api" ? "api" : "platform";
    if (req.body.variables !== undefined)
        data.variables = JSON.stringify(req.body.variables);
    if (req.body.accounts !== undefined)
        data.accounts = JSON.stringify(req.body.accounts);
    if (req.body.status !== undefined)
        data.status = req.body.status;
    update("environments", req.params.id, data);
    const updated = get("environments", req.params.id);
    res.json(toApi(updated || {}));
});
// DELETE /api/environments/:id
router.delete("/:id", (req, res) => {
    const ok = remove("environments", req.params.id);
    if (!ok) {
        res.status(404).json({ error: "not found" });
        return;
    }
    res.json({ ok: true });
});
export default router;
//# sourceMappingURL=environments.js.map
import { Router } from "express";
import { all, exec, get, insert, update, remove, createId, now } from "../data/db.js";
import { readPaging } from "./shared.js";

const router = Router();

function toApi(row: Record<string, unknown>) {
  return {
    ...row,
    selectorType: row.selector_type,
    usageCount: row.usage_count,
    lastUsed: row.last_used,
    createdAt: row.created_at,
    tags: typeof row.tags === "string" ? JSON.parse(row.tags || "[]") : (row.tags || []),
  };
}

function toDb(body: Record<string, unknown>, id?: string): Record<string, unknown> {
  return {
    id: id || createId(),
    name: body.name || "",
    type: body.type || "",
    selector: body.selector || "",
    selector_type: body.selectorType || body.selector_type || "css",
    page: body.page || "",
    description: body.description || "",
    tags: JSON.stringify(body.tags || []),
    source: body.source || "manual",
    usage_count: body.usageCount ?? body.usage_count ?? 0,
    last_used: body.lastUsed || body.last_used || null,
    created_at: id ? undefined : now(),
  };
}

// GET /api/elements
router.get("/", (req, res) => {
  const { search, source } = req.query;
  let list = all("elements");

  if (search) {
    const kw = (search as string).toLowerCase();
    list = list.filter((e: Record<string, unknown>) => {
      const name = typeof e.name === "string" ? e.name : "";
      const selector = typeof e.selector === "string" ? e.selector : "";
      const description = typeof e.description === "string" ? e.description : "";
      return name.toLowerCase().includes(kw) || selector.toLowerCase().includes(kw) || description.toLowerCase().includes(kw);
    });
  }
  if (source) list = list.filter((e: Record<string, unknown>) => e.source === source);

  // 尊重前端 limit 参数（默认 50，上限 500）
  const { page: pageNum, limit, offset } = readPaging(req.query, 50, 500);
  const total = list.length;
  const items = list.slice(offset, offset + limit).map(toApi);

  res.json({ items, total, page: pageNum, limit });
});

// POST /api/elements
router.post("/", (req, res) => {
  const { name } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const row = toDb(req.body);
  insert("elements", row);
  res.status(201).json(toApi(row));
});

// POST /api/elements/batch — 批量导入（事务包裹，避免中途失败留下部分导入状态）
router.post("/batch", (req, res) => {
  const { elements: batch } = req.body;
  if (!Array.isArray(batch) || batch.length === 0) {
    res.status(400).json({ error: "elements array is required" });
    return;
  }
  const created: Record<string, unknown>[] = [];
  exec("BEGIN");
  try {
    for (const el of batch) {
      const row = toDb({ ...el, name: el.name || `element-${Date.now()}` });
      insert("elements", row);
      created.push(toApi(row));
    }
    exec("COMMIT");
  } catch (error) {
    try { exec("ROLLBACK"); } catch { /* 事务未激活 */ }
    throw error;
  }
  res.status(201).json({ created: created.length, items: created });
});

// GET /api/elements/:id
router.get("/:id", (req, res) => {
  const item = get("elements", req.params.id);
  if (!item) { res.status(404).json({ error: "not found" }); return; }
  res.json(toApi(item));
});

// PUT /api/elements/:id
router.put("/:id", (req, res) => {
  const existing = get("elements", req.params.id);
  if (!existing) { res.status(404).json({ error: "not found" }); return; }
  const data: Record<string, unknown> = {};
  if (req.body.name !== undefined) data.name = req.body.name;
  if (req.body.type !== undefined) data.type = req.body.type;
  if (req.body.selector !== undefined) data.selector = req.body.selector;
  if (req.body.selectorType !== undefined) data.selector_type = req.body.selectorType;
  if (req.body.page !== undefined) data.page = req.body.page;
  if (req.body.description !== undefined) data.description = req.body.description;
  if (req.body.tags !== undefined) data.tags = JSON.stringify(req.body.tags);
  if (req.body.source !== undefined) data.source = req.body.source;
  if (req.body.usageCount !== undefined) data.usage_count = req.body.usageCount;
  update("elements", req.params.id, data);
  const updated = get("elements", req.params.id);
  res.json(toApi(updated || {}));
});

// DELETE /api/elements/:id
router.delete("/:id", (req, res) => {
  const ok = remove("elements", req.params.id);
  if (!ok) { res.status(404).json({ error: "not found" }); return; }
  res.json({ ok: true });
});

export default router;

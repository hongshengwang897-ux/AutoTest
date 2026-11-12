import { Router } from "express";
import { all, get, insert, update, remove, createId } from "../data/db.js";

const router = Router();

function toApi(row: Record<string, unknown>) {
  const r = row as Record<string, unknown>;
  return {
    ...row,
    parentId: (r.parent_id as string) || "",
    sortOrder: Number(r.sort_order) || 0,
    createdAt: (r.created_at as string) || "",
  };
}

// GET /api/modules
router.get("/", (_req, res) => {
  const items = all("modules")
    .map(toApi)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
  res.json({ items });
});

// POST /api/modules
router.post("/", (req, res) => {
  const { name, parentId = "" } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const row = {
    id: createId(),
    name,
    parent_id: parentId,
    sort_order: (all("modules").length + 1) * 10,
    created_at: new Date().toISOString(),
  };
  insert("modules", row);
  res.status(201).json(toApi(row));
});

// PUT /api/modules/:id
router.put("/:id", (req, res) => {
  const existing = get("modules", req.params.id);
  if (!existing) { res.status(404).json({ error: "not found" }); return; }
  const data: Record<string, unknown> = {};
  if (req.body.name !== undefined) data.name = req.body.name;
  if (req.body.parentId !== undefined) data.parent_id = req.body.parentId;
  update("modules", req.params.id, data);
  const updated = get("modules", req.params.id);
  res.json(toApi(updated || {}));
});

// DELETE /api/modules/:id — 同时删除子模块
router.delete("/:id", (req, res) => {
  const allMods = all("modules");
  const idsToDelete = [req.params.id];
  // 递归收集子模块
  for (let i = 0; i < idsToDelete.length; i++) {
    for (const m of allMods) {
      if (m.parent_id === idsToDelete[i] && !idsToDelete.includes(m.id)) {
        idsToDelete.push(m.id);
      }
    }
  }
  for (const id of idsToDelete) {
    remove("modules", id);
  }
  res.json({ ok: true, deleted: idsToDelete.length });
});

export default router;

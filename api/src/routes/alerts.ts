import { Router } from "express";
import { all, get, insert, update, remove, createId } from "../data/db.js";
import { sendAlert, renderTestMessage } from "../alert-delivery.js";

const router = Router();

/** 安全解析 JSON 字符串，失败时回退默认值（DB 脏数据不应导致列表 500） */
function safeJsonParse(text: string, fallback: unknown): any {
  try { return JSON.parse(text); } catch { return fallback; }
}

function toApi(row: Record<string, unknown>) {
  return {
    ...row,
    webhookUrl: row.webhook_url,
    testTemplate: row.test_template,
    notifyLevels: typeof row.notify_levels === "string" ? safeJsonParse(row.notify_levels, []) : (row.notify_levels || []),
    modules: typeof row.modules === "string" ? safeJsonParse(row.modules, ["ui"]) : (row.modules || ["ui"]),
    config: typeof row.config === "string" ? safeJsonParse(row.config, {}) : (row.config || {}),
    enabled: !!row.enabled,
  };
}

// GET /api/alerts
router.get("/", (_req, res) => {
  res.json({ items: all("alerts").map(toApi) });
});

// POST /api/alerts
router.post("/", (req, res) => {
  const { name } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const row = {
    id: createId(),
    name,
    channel: req.body.channel || "dingtalk",
    webhook_url: req.body.webhookUrl || req.body.webhook_url || "",
    notify_levels: JSON.stringify(req.body.notifyLevels || req.body.notify_levels || []),
    template: req.body.template || "",
    test_template: req.body.testTemplate || req.body.test_template || "",
    enabled: req.body.enabled ? 1 : 0,
    config: JSON.stringify(req.body.config || {}),
    modules: JSON.stringify(req.body.modules || ["ui"]),
  };
  insert("alerts", row);
  res.status(201).json(toApi(row));
});

// PUT /api/alerts/:id
router.put("/:id", (req, res) => {
  const existing = get("alerts", req.params.id);
  if (!existing) { res.status(404).json({ error: "not found" }); return; }
  const data: Record<string, unknown> = {};
  if (req.body.name !== undefined) data.name = req.body.name;
  if (req.body.channel !== undefined) data.channel = req.body.channel;
  if (req.body.webhookUrl !== undefined) data.webhook_url = req.body.webhookUrl;
  if (req.body.notifyLevels !== undefined) data.notify_levels = JSON.stringify(req.body.notifyLevels);
  if (req.body.template !== undefined) data.template = req.body.template;
  if (req.body.testTemplate !== undefined) data.test_template = req.body.testTemplate;
  if (req.body.enabled !== undefined) data.enabled = req.body.enabled ? 1 : 0;
  if (req.body.config !== undefined) data.config = JSON.stringify(req.body.config);
  if (req.body.modules !== undefined) data.modules = JSON.stringify(req.body.modules);
  update("alerts", req.params.id, data);
  const updated = get("alerts", req.params.id);
  res.json(toApi(updated || {}));
});

// POST /api/alerts/:id/test
router.post("/:id/test", async (req, res) => {
  const item = get("alerts", req.params.id);
  if (!item) { res.status(404).json({ error: "not found" }); return; }
  if (!item.enabled) { res.status(400).json({ error: "该告警通道已禁用，无法发送测试消息" }); return; }

  const text = renderTestMessage(item);
  try {
    await sendAlert(item, text);
    res.json({ message: "测试消息已发送" });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Webhook 请求失败" });
  }
});

// DELETE /api/alerts/:id
router.delete("/:id", (req, res) => {
  const ok = remove("alerts", req.params.id);
  if (!ok) { res.status(404).json({ error: "not found" }); return; }
  res.json({ ok: true });
});

export default router;

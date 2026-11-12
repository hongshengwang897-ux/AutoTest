import { Router } from "express";
import { all, compactRow, insert, query, exec } from "../data/db.js";
import { initializeScheduler } from "../scheduler.js";
import { refreshExecutionQueue } from "../case-execution.js";

const router = Router();

const defaultSettings: Record<string, any> = {
  profile: {
    name: "QA Engineer",
    email: "qa@example.com",
    title: "QA 工程师",
    department: "测试部",
  },
  notifications: {
    executionComplete: true,
    failureOnly: false,
    systemAlerts: true,
    dailyDigest: true,
  },
  maxConcurrency: 5,
  defaultTimeout: 30000,
  retryOnFailure: true,
  maxRetries: 2,
  screenshotOnFailure: true,
  videoRecording: false,
  notifyOnComplete: true,
};

const exportTables = [
  "cases",
  "elements",
  "environments",
  "executions",
  "reports",
  "schedules",
  "alerts",
  "modules",
  "api_cases",
  "api_executions",
] as const;

// GET /api/settings/export
router.get("/export", (_req, res) => {
  const data: Record<string, unknown> = {};
  for (const table of exportTables) data[table] = all(table);
  data.settings = all("settings");
  res.json({ version: 2, exportedAt: new Date().toISOString(), data });
});

// POST /api/settings/import
router.post("/import", (req, res) => {
  const payload = req.body?.data;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    res.status(400).json({ error: "invalid backup: data object is required" });
    return;
  }

  const imported: Record<string, number> = {};
  try {
    exec("BEGIN");
    for (const table of [...exportTables, "settings"] as const) {
      const rows = (payload as Record<string, unknown>)[table];
      if (rows === undefined) continue;
      if (!Array.isArray(rows)) throw new Error(`${table} must be an array`);
      exec(`DELETE FROM ${table}`);
      for (const row of rows) {
        if (!row || typeof row !== "object" || Array.isArray(row)) {
          throw new Error(`${table} contains an invalid row`);
        }
        insert(table, compactRow(table, row as Record<string, unknown>));
      }
      imported[table] = rows.length;
    }
    exec("COMMIT");
    initializeScheduler();
    refreshExecutionQueue();
    res.json({ imported });
  } catch (error) {
    try { exec("ROLLBACK"); } catch { /* transaction was not active */ }
    res.status(400).json({ error: error instanceof Error ? error.message : "import failed" });
  }
});

// GET /api/settings
router.get("/", (_req, res) => {
  const rows = query(`SELECT * FROM settings`);
  const result: Record<string, any> = { ...defaultSettings };
  for (const row of rows) {
    try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
  }
  res.json(result);
});

// PUT /api/settings
router.put("/", (req, res) => {
  for (const [key, value] of Object.entries(req.body)) {
    const exists = query(`SELECT key FROM settings WHERE key = ?`, key).length > 0;
    if (exists) {
      exec(`UPDATE settings SET value = ? WHERE key = ?`, JSON.stringify(value), key);
    } else {
      exec(`INSERT INTO settings (key, value) VALUES (?, ?)`, key, JSON.stringify(value));
    }
  }
  refreshExecutionQueue();
  res.json(req.body);
});

export default router;

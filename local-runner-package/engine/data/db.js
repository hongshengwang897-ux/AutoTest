/**
 * SQLite 数据库层 — 替代内存存储
 * 使用 Node.js 22 内置的 node:sqlite
 */
import { DatabaseSync } from "node:sqlite";
import { join, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const DB_PATH = join(DATA_DIR, "app.db");
mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
// 性能优化
db.exec("PRAGMA journal_mode=WAL");
db.exec("PRAGMA synchronous=NORMAL");
db.exec("PRAGMA foreign_keys=ON");
// ---- 建表 ----
db.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    script TEXT DEFAULT '',
    steps_json TEXT DEFAULT '[]',
    language TEXT DEFAULT 'typescript',
    tags TEXT DEFAULT '[]',
    group_name TEXT DEFAULT '',
    environment_id TEXT DEFAULT '',
    precondition_case_id TEXT DEFAULT '',
    precondition_case_ids TEXT DEFAULT '[]',
    status TEXT DEFAULT 'draft',
    version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);
// 兼容已存在的数据库：新增字段时只做幂等迁移，不改动原有用例数据。
const caseColumns = db.prepare("PRAGMA table_info(cases)").all();
if (!caseColumns.some((column) => column.name === "steps_json")) {
    db.exec("ALTER TABLE cases ADD COLUMN steps_json TEXT DEFAULT '[]'");
}
if (!caseColumns.some((column) => column.name === "precondition_case_id")) {
    db.exec("ALTER TABLE cases ADD COLUMN precondition_case_id TEXT DEFAULT ''");
}
if (!caseColumns.some((column) => column.name === "precondition_case_ids")) {
    db.exec("ALTER TABLE cases ADD COLUMN precondition_case_ids TEXT DEFAULT '[]'");
}
// 将旧版单前置用例迁移为有序列表；保留旧字段供旧版执行器兼容读取。
const legacyPreconditions = db.prepare("SELECT id, precondition_case_id, precondition_case_ids FROM cases WHERE precondition_case_id <> ''").all();
const migratePrecondition = db.prepare("UPDATE cases SET precondition_case_ids = ? WHERE id = ?");
if (legacyPreconditions.length > 0) {
    // 事务包裹逐条 UPDATE（写法与 routes/settings.ts 的 BEGIN/COMMIT/ROLLBACK 一致），避免中途失败留下半迁移状态。
    db.exec("BEGIN");
    try {
        for (const item of legacyPreconditions) {
            const existing = parseJson(item.precondition_case_ids, []);
            if (existing.length === 0)
                migratePrecondition.run(JSON.stringify([item.precondition_case_id]), item.id);
        }
        db.exec("COMMIT");
    }
    catch (error) {
        try {
            db.exec("ROLLBACK");
        }
        catch { /* 事务未激活 */ }
        throw error;
    }
}
db.exec(`
  CREATE TABLE IF NOT EXISTS elements (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT DEFAULT '',
    selector TEXT DEFAULT '',
    selector_type TEXT DEFAULT 'css',
    page TEXT DEFAULT '',
    description TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    source TEXT DEFAULT 'manual',
    usage_count INTEGER DEFAULT 0,
    last_used TEXT,
    created_at TEXT NOT NULL
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS environments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT DEFAULT '',
    type TEXT DEFAULT 'dev',
    scope TEXT DEFAULT 'platform',
    variables TEXT DEFAULT '{}',
    accounts TEXT DEFAULT '[]',
    status TEXT DEFAULT 'online'
  )
`);
const environmentColumns = db.prepare("PRAGMA table_info(environments)").all();
if (!environmentColumns.some((column) => column.name === "scope")) {
    db.exec("ALTER TABLE environments ADD COLUMN scope TEXT DEFAULT 'platform'");
}
db.exec(`
  CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    case_id TEXT DEFAULT '',
    case_name TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    start_time TEXT,
    end_time TEXT,
    duration INTEGER,
    error_message TEXT,
    logs TEXT DEFAULT '[]',
    steps TEXT DEFAULT '[]',
    screenshots TEXT DEFAULT '[]',
    runner_token TEXT DEFAULT ''
  )
`);
const executionColumns = db.prepare("PRAGMA table_info(executions)").all();
if (!executionColumns.some((column) => column.name === "runner_token")) {
    db.exec("ALTER TABLE executions ADD COLUMN runner_token TEXT DEFAULT ''");
}
db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    execution_id TEXT DEFAULT '',
    case_id TEXT DEFAULT '',
    case_name TEXT DEFAULT '',
    status TEXT DEFAULT 'success',
    start_time TEXT,
    end_time TEXT,
    duration INTEGER,
    error_message TEXT,
    steps TEXT DEFAULT '[]',
    screenshots TEXT DEFAULT '[]',
    logs TEXT DEFAULT '[]',
    created_at TEXT NOT NULL
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cron_expression TEXT DEFAULT '',
    case_ids TEXT DEFAULT '[]',
    environment_id TEXT DEFAULT '',
    enabled INTEGER DEFAULT 0,
    last_run_time TEXT,
    next_run_time TEXT
  )
`);
const scheduleColumns = db.prepare("PRAGMA table_info(schedules)").all();
if (!scheduleColumns.some((column) => column.name === "target_type")) {
    db.exec("ALTER TABLE schedules ADD COLUMN target_type TEXT DEFAULT 'platform'");
}
if (!scheduleColumns.some((column) => column.name === "collection_path")) {
    db.exec("ALTER TABLE schedules ADD COLUMN collection_path TEXT DEFAULT ''");
}
db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    channel TEXT DEFAULT 'dingtalk',
    webhook_url TEXT DEFAULT '',
    notify_levels TEXT DEFAULT '[]',
    template TEXT DEFAULT '',
    test_template TEXT DEFAULT '',
    enabled INTEGER DEFAULT 0,
    config TEXT DEFAULT '{}',
    modules TEXT DEFAULT '["ui"]'
  )
`);
// 兼容旧库：alerts 补 config 列（存通道扩展配置，如钉钉加签 secret），幂等
const alertColumns = db.prepare("PRAGMA table_info(alerts)").all();
if (!alertColumns.some((column) => column.name === "config")) {
    db.exec("ALTER TABLE alerts ADD COLUMN config TEXT DEFAULT '{}'");
}
if (!alertColumns.some((column) => column.name === "test_template")) {
    db.exec("ALTER TABLE alerts ADD COLUMN test_template TEXT DEFAULT ''");
}
if (!alertColumns.some((column) => column.name === "modules")) {
    db.exec("ALTER TABLE alerts ADD COLUMN modules TEXT DEFAULT '[\"ui\"]'");
}
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS api_cases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    method TEXT DEFAULT 'GET',
    url TEXT DEFAULT '',
    headers TEXT DEFAULT '[]',
    query_params TEXT DEFAULT '[]',
    body_type TEXT DEFAULT 'none',
    body TEXT DEFAULT '',
    assertions TEXT DEFAULT '[]',
    variables TEXT DEFAULT '{}',
    environment_id TEXT DEFAULT '',
    group_name TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);
const apiCaseColumns = db.prepare("PRAGMA table_info(api_cases)").all();
if (!apiCaseColumns.some((column) => column.name === "sort_order")) {
    db.exec("ALTER TABLE api_cases ADD COLUMN sort_order INTEGER DEFAULT 0");
}
db.exec(`
  CREATE TABLE IF NOT EXISTS api_executions (
    id TEXT PRIMARY KEY,
    case_id TEXT DEFAULT '',
    case_name TEXT DEFAULT '',
    status TEXT DEFAULT 'success',
    method TEXT DEFAULT 'GET',
    url TEXT DEFAULT '',
    status_code INTEGER,
    duration INTEGER DEFAULT 0,
    response_size INTEGER DEFAULT 0,
    request_headers TEXT DEFAULT '{}',
    request_body TEXT DEFAULT '',
    response_headers TEXT DEFAULT '{}',
    response_body TEXT DEFAULT '',
    assertion_results TEXT DEFAULT '[]',
    error_message TEXT,
    created_at TEXT NOT NULL
  )
`);
// 兼容旧库：api_executions 补 ended_at 列（幂等）
const apiExecutionColumns = db.prepare("PRAGMA table_info(api_executions)").all();
if (!apiExecutionColumns.some((column) => column.name === "ended_at")) {
    db.exec("ALTER TABLE api_executions ADD COLUMN ended_at TEXT");
}
db.exec(`
  CREATE TABLE IF NOT EXISTS api_collection_runs (
    id TEXT PRIMARY KEY,
    collection_path TEXT NOT NULL,
    collection_name TEXT NOT NULL,
    schedule_id TEXT DEFAULT '',
    trigger_type TEXT DEFAULT 'manual',
    environment_id TEXT DEFAULT '',
    status TEXT DEFAULT 'running',
    total INTEGER DEFAULT 0,
    passed INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0,
    items TEXT DEFAULT '[]',
    started_at TEXT NOT NULL,
    ended_at TEXT,
    created_at TEXT NOT NULL
  )
`);
// 兼容旧库：api_collection_runs 补 error_message 列（幂等）
const apiCollectionRunColumns = db.prepare("PRAGMA table_info(api_collection_runs)").all();
if (!apiCollectionRunColumns.some((column) => column.name === "error_message")) {
    db.exec("ALTER TABLE api_collection_runs ADD COLUMN error_message TEXT");
}
db.exec(`
  CREATE TABLE IF NOT EXISTS performance_scenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    target_type TEXT DEFAULT 'cases',
    target_ids TEXT DEFAULT '[]',
    custom_requests TEXT DEFAULT '[]',
    collection_path TEXT DEFAULT '',
    environment_id TEXT DEFAULT '',
    concurrency INTEGER DEFAULT 10,
    execution_mode TEXT DEFAULT 'samples',
    sample_count INTEGER DEFAULT 1000,
    duration_seconds INTEGER DEFAULT 60,
    ramp_up_seconds INTEGER DEFAULT 0,
    timeout_ms INTEGER DEFAULT 30000,
    think_time_ms INTEGER DEFAULT 0,
    use_proxy_pool INTEGER DEFAULT 0,
    success_rate_threshold REAL DEFAULT 95,
    p95_threshold_ms INTEGER DEFAULT 2000,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);
const performanceScenarioColumns = db.prepare("PRAGMA table_info(performance_scenarios)").all();
if (!performanceScenarioColumns.some((column) => column.name === "custom_requests")) {
    db.exec("ALTER TABLE performance_scenarios ADD COLUMN custom_requests TEXT DEFAULT '[]'");
}
if (!performanceScenarioColumns.some((column) => column.name === "execution_mode")) {
    db.exec("ALTER TABLE performance_scenarios ADD COLUMN execution_mode TEXT DEFAULT 'duration'");
}
if (!performanceScenarioColumns.some((column) => column.name === "sample_count")) {
    db.exec("ALTER TABLE performance_scenarios ADD COLUMN sample_count INTEGER DEFAULT 1000");
}
if (!performanceScenarioColumns.some((column) => column.name === "use_proxy_pool")) {
    db.exec("ALTER TABLE performance_scenarios ADD COLUMN use_proxy_pool INTEGER DEFAULT 0");
}
db.exec(`
  CREATE TABLE IF NOT EXISTS performance_runs (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    scenario_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    started_at TEXT,
    ended_at TEXT,
    duration INTEGER DEFAULT 0,
    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    bytes_received INTEGER DEFAULT 0,
    bytes_sent INTEGER DEFAULT 0,
    avg_response_time REAL DEFAULT 0,
    min_response_time REAL DEFAULT 0,
    max_response_time REAL DEFAULT 0,
    p50_response_time REAL DEFAULT 0,
    p90_response_time REAL DEFAULT 0,
    p95_response_time REAL DEFAULT 0,
    p99_response_time REAL DEFAULT 0,
    requests_per_second REAL DEFAULT 0,
    error_rate REAL DEFAULT 0,
    metrics TEXT DEFAULT '[]',
    errors TEXT DEFAULT '[]',
    status_codes TEXT DEFAULT '{}',
    transactions TEXT DEFAULT '[]',
    sla_results TEXT DEFAULT '[]',
    config TEXT DEFAULT '{}',
    error_message TEXT DEFAULT '',
    created_at TEXT NOT NULL
  )
`);
const performanceRunColumns = db.prepare("PRAGMA table_info(performance_runs)").all();
if (!performanceRunColumns.some((column) => column.name === "bytes_sent")) {
    db.exec("ALTER TABLE performance_runs ADD COLUMN bytes_sent INTEGER DEFAULT 0");
}
if (!performanceRunColumns.some((column) => column.name === "transactions")) {
    db.exec("ALTER TABLE performance_runs ADD COLUMN transactions TEXT DEFAULT '[]'");
}
if (!performanceRunColumns.some((column) => column.name === "sla_results")) {
    db.exec("ALTER TABLE performance_runs ADD COLUMN sla_results TEXT DEFAULT '[]'");
}
// ★ 模块目录表 — 支持嵌套
db.exec(`
  CREATE TABLE IF NOT EXISTS modules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT ''
  )
`);
// ★ 测试计划（Campaign）表
db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'draft',
    ui_case_ids TEXT DEFAULT '[]',
    api_case_ids TEXT DEFAULT '[]',
    performance_scenario_ids TEXT DEFAULT '[]',
    deadline TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);
// ---- 索引（幂等创建，只加速常用查询，不改变表结构与数据） ----
db.exec(`
  -- executions：按用例查询执行历史
  CREATE INDEX IF NOT EXISTS idx_executions_case_id ON executions (case_id);
  -- executions：按开始时间排序 / 时间范围筛选
  CREATE INDEX IF NOT EXISTS idx_executions_start_time ON executions (start_time);
  -- executions：按状态筛选（如进行中 / 失败）
  CREATE INDEX IF NOT EXISTS idx_executions_status ON executions (status);
  -- reports：按执行记录 ID 关联报告
  CREATE INDEX IF NOT EXISTS idx_reports_execution_id ON reports (execution_id);
  -- reports：按创建时间排序 / 分页
  CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at);
  -- api_executions：按接口用例查询执行历史
  CREATE INDEX IF NOT EXISTS idx_api_executions_case_id ON api_executions (case_id);
  -- api_executions：按创建时间排序 / 分页
  CREATE INDEX IF NOT EXISTS idx_api_executions_created_at ON api_executions (created_at);
  -- api_collection_runs：按状态筛选集合运行
  CREATE INDEX IF NOT EXISTS idx_api_collection_runs_status ON api_collection_runs (status);
  -- api_collection_runs：按开始时间排序 / 分页
  CREATE INDEX IF NOT EXISTS idx_api_collection_runs_started_at ON api_collection_runs (started_at);
  -- performance_runs：按场景查询压测运行
  CREATE INDEX IF NOT EXISTS idx_performance_runs_scenario_id ON performance_runs (scenario_id);
  -- performance_runs：按状态筛选压测运行
  CREATE INDEX IF NOT EXISTS idx_performance_runs_status ON performance_runs (status);
`);
// ---- 种子数据 ----
// 演示种子数据已移除：清空数据后重启不会自动回填任何演示用例/执行记录/模块。
function parseJson(raw, fallback) {
    if (!raw)
        return fallback;
    try {
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
// ---- 导出工具函数 ----
export function createId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
export function now() {
    return new Date().toISOString();
}
/** 获取表的所有行，自动解析 JSON 字段 */
export function all(table) {
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    return rows.map((r) => expandRow(table, r));
}
/** 根据 ID 获取一行 */
export function get(table, id) {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    return row ? expandRow(table, row) : null;
}
// ---- 列名白名单（insert / update 安全过滤） ----
// 懒加载缓存：表名 → 合法列名集合，首次访问时通过 PRAGMA table_info 构建。
// 模块顶部的 ALTER TABLE 迁移先于任何 insert/update 执行，缓存不会错过迁移新增的列。
const columnWhitelistCache = new Map();
function getTableColumns(table) {
    let columns = columnWhitelistCache.get(table);
    if (!columns) {
        columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
        columnWhitelistCache.set(table, columns);
    }
    return columns;
}
/** 过滤掉不在表结构中的未知列（如 /api/settings/import 备份行里的伪造 key），防止其被拼进 SQL 标识符 */
function filterColumns(table, data) {
    const columns = getTableColumns(table);
    const result = {};
    for (const key of Object.keys(data)) {
        if (columns.has(key)) {
            result[key] = data[key];
        }
        else {
            console.warn(`[DB] ${table}: 忽略不在表结构中的列 "${key}"`);
        }
    }
    return result;
}
/** 插入一行（自动忽略不在表结构中的未知列） */
export function insert(table, data) {
    const filtered = filterColumns(table, data);
    const cols = Object.keys(filtered);
    if (cols.length === 0)
        throw new Error(`[DB] insert ${table}: 没有可写入的合法列`);
    const placeholders = cols.map(() => "?").join(", ");
    const values = cols.map((c) => filtered[c]);
    db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`).run(...values);
}
/** 更新一行（自动忽略不在表结构中的未知列） */
export function update(table, id, data) {
    const filtered = filterColumns(table, data);
    const cols = Object.keys(filtered);
    if (cols.length === 0)
        return false;
    const sets = cols.map((c) => `${c} = ?`).join(", ");
    const values = cols.map((c) => filtered[c]);
    values.push(id);
    const result = db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...values);
    return result.changes > 0;
}
/** 删除一行 */
export function remove(table, id) {
    const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    return result.changes > 0;
}
/** 执行原始 SQL（用于复杂查询），自动展开 JSON 字段 */
export function query(sql, ...params) {
    const rows = db.prepare(sql).all(...params);
    // 尝试根据 FROM 子句推断表名来展开
    const tableMatch = sql.match(/FROM\s+(\w+)/i);
    const table = tableMatch ? tableMatch[1] : "";
    return rows.map((r) => (table ? expandRow(table, r) : r));
}
/** 执行写入 SQL */
export function exec(sql, ...params) {
    return db.prepare(sql).run(...params).changes;
}
// ---- JSON 字段展开 ----
const JSON_FIELDS = {
    cases: ["tags", "steps_json", "precondition_case_ids"],
    elements: ["tags"],
    environments: ["variables", "accounts"],
    executions: ["logs", "steps", "screenshots"],
    reports: ["steps", "screenshots", "logs"],
    schedules: ["case_ids"],
    alerts: ["notify_levels", "config", "modules"],
    api_cases: ["headers", "query_params", "assertions", "variables"],
    api_executions: ["request_headers", "response_headers", "assertion_results"],
    api_collection_runs: ["items"],
    performance_scenarios: ["target_ids", "custom_requests"],
    performance_runs: ["metrics", "errors", "status_codes", "transactions", "sla_results", "config"],
    campaigns: ["ui_case_ids", "api_case_ids", "performance_scenario_ids"],
};
const BOOLEAN_FIELDS = {
    schedules: ["enabled"],
    alerts: ["enabled"],
    performance_scenarios: ["use_proxy_pool"],
};
function expandRow(table, row) {
    const result = { ...row };
    const jsonFields = JSON_FIELDS[table] || [];
    for (const f of jsonFields) {
        result[f] = parseJson(result[f], f === "case_ids" || f === "precondition_case_ids" || f === "tags" || f === "notify_levels" || f === "screenshots" || f === "logs" || f === "steps" || f === "steps_json" || f === "headers" || f === "query_params" || f === "assertions" || f === "assertion_results" || f === "ui_case_ids" || f === "api_case_ids" || f === "performance_scenario_ids" || f === "target_ids" || f === "custom_requests" || f === "metrics" || f === "errors" || f === "status_codes" || f === "transactions" || f === "sla_results" || f === "items"
            ? []
            : {});
    }
    // 布尔字段转换
    const booleans = BOOLEAN_FIELDS[table] || [];
    for (const f of booleans) {
        result[f] = !!result[f];
    }
    return result;
}
/** 压缩 JSON 字段用于写入 */
export function compactRow(table, data) {
    const result = { ...data };
    const jsonFields = JSON_FIELDS[table] || [];
    for (const f of jsonFields) {
        if (f in result)
            result[f] = JSON.stringify(result[f]);
    }
    const booleans = BOOLEAN_FIELDS[table] || [];
    for (const f of booleans) {
        if (f in result)
            result[f] = result[f] ? 1 : 0;
    }
    return result;
}
/** 关闭数据库（进程退出时调用） */
export function closeDb() {
    db.close();
}
//# sourceMappingURL=db.js.map
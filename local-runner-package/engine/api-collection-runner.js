import { all, get, insert, update, createId, now } from "./data/db.js";
import { runApiTest } from "./api-test-runner.js";
import { deliverExecutionAlerts } from "./alert-delivery.js";
import { maskReportUrl } from "./url-utils.js";
/** 安全触发 fire-and-forget 异步任务：任何异常只记日志，避免 unhandledRejection 崩溃进程 */
function safeVoid(promise, label) {
    promise.catch((error) => {
        console.error(`[${label}]`, error instanceof Error ? (error.stack || error.message) : error);
    });
}
function normalizedGroup(value) {
    return String(value || "未分组").split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean).join(" / ") || "未分组";
}
function collectionCaseRows(collectionPath) {
    const path = normalizedGroup(collectionPath);
    return all("api_cases")
        .filter((row) => {
        const group = normalizedGroup(row.group_name);
        return group === path || group.startsWith(`${path} / `);
    })
        .sort((a, b) => {
        const groupDifference = normalizedGroup(a.group_name).localeCompare(normalizedGroup(b.group_name), "zh-CN");
        return groupDifference || (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
    });
}
export function listApiCollections() {
    const counts = new Map();
    for (const row of all("api_cases")) {
        const parts = normalizedGroup(row.group_name).split(" / ");
        for (let index = 1; index <= parts.length; index += 1) {
            const path = parts.slice(0, index).join(" / ");
            counts.set(path, (counts.get(path) || 0) + 1);
        }
    }
    return [...counts.entries()]
        .map(([path, total]) => ({ path, name: path.split(" / ").at(-1) || path, total }))
        .sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
}
function caseDefinition(row, environmentId) {
    return {
        id: String(row.id),
        name: String(row.name || "未命名接口"),
        method: String(row.method || "GET"),
        url: String(row.url || ""),
        headers: Array.isArray(row.headers) ? row.headers : [],
        queryParams: Array.isArray(row.query_params) ? row.query_params : [],
        bodyType: row.body_type || "none",
        body: String(row.body || ""),
        assertions: Array.isArray(row.assertions) ? row.assertions : [],
        variables: row.variables && typeof row.variables === "object" ? row.variables : {},
        environmentId: environmentId || String(row.environment_id || ""),
    };
}
function reportUrl(value) {
    return maskReportUrl(value);
}
const ITEM_FLUSH_COUNT = 5; // 每新完成 5 条写回一次 items
const ITEM_FLUSH_INTERVAL_MS = 3000; // 或距上次写回超过 3 秒时写回
async function executeCollectionRun(runId, rows, environmentId, collectionName) {
    const startedAt = Date.now();
    const items = [];
    // 节流写回：items 在内存累积，按“每 5 条或每 3 秒”批量落库，
    // 避免每执行完一条就把全量数组 JSON.stringify 重写回库造成 O(n²) 写放大。
    let flushedCount = 0;
    let lastFlushAt = startedAt;
    const flushItems = () => {
        if (items.length === flushedCount)
            return;
        try {
            update("api_collection_runs", runId, { items: JSON.stringify(items) });
            flushedCount = items.length;
            lastFlushAt = Date.now();
        }
        catch (error) {
            // 中途节流写回失败只记日志，不中断执行；flushedCount 不前移，下次写回会带上全部已完成条目
            console.error("[API Collection] 节流写回 items 失败:", error instanceof Error ? error.message : error);
        }
    };
    const maybeFlushItems = () => {
        if (items.length - flushedCount >= ITEM_FLUSH_COUNT || Date.now() - lastFlushAt >= ITEM_FLUSH_INTERVAL_MS)
            flushItems();
    };
    try {
        for (const [index, row] of rows.entries()) {
            const result = await runApiTest(caseDefinition(row, environmentId));
            const assertionResults = Array.isArray(result.assertion_results) ? result.assertion_results : [];
            items.push({
                id: createId(),
                executionId: result.id,
                caseId: String(row.id),
                caseName: String(row.name || "未命名接口"),
                method: String(result.method || row.method || "GET"),
                url: reportUrl(result.url),
                status: result.status,
                statusCode: result.status_code,
                duration: Number(result.duration) || 0,
                assertionTotal: assertionResults.length,
                assertionPassed: assertionResults.filter((item) => item.passed).length,
                errorMessage: String(result.error_message || ""),
                sortOrder: index,
            });
            maybeFlushItems();
        }
        const passed = items.filter((item) => item.status === "success").length;
        const endedAt = now();
        const collectionStatus = passed === items.length ? "success" : "failed";
        update("api_collection_runs", runId, {
            status: collectionStatus,
            passed,
            failed: items.length - passed,
            duration: Date.now() - startedAt,
            items: JSON.stringify(items),
            ended_at: endedAt,
        });
        // 集合整体完成后只推一条汇总，不逐条推送（每条已在 runApiTest 里 suppressNotify）
        safeVoid(deliverExecutionAlerts("api", collectionName, collectionStatus, collectionStatus === "failed" ? `接口集合存在 ${items.length - passed} 条失败` : "", { total: items.length, pass: passed, fail: items.length - passed }), "Alert");
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        update("api_collection_runs", runId, {
            status: "failed",
            passed: items.filter((item) => item.status === "success").length,
            failed: rows.length - items.filter((item) => item.status === "success").length,
            duration: Date.now() - startedAt,
            items: JSON.stringify(items),
            ended_at: now(),
        });
        safeVoid(deliverExecutionAlerts("api", collectionName, "failed", errorMessage, { total: rows.length, pass: items.filter((item) => item.status === "success").length, fail: rows.length - items.filter((item) => item.status === "success").length }), "Alert");
        console.error("[API Collection]", errorMessage);
    }
}
export function queueApiCollectionRun(options) {
    const collectionPath = normalizedGroup(options.collectionPath);
    const rows = collectionCaseRows(collectionPath);
    if (rows.length === 0)
        throw new Error("集合中没有可执行的接口用例");
    if (options.environmentId) {
        const environment = get("environments", options.environmentId);
        if (!environment)
            throw new Error("所选接口测试环境不存在");
        if ((environment.scope || "platform") !== "api")
            throw new Error("所选环境不是接口测试环境");
    }
    const id = createId();
    const timestamp = now();
    const row = {
        id,
        collection_path: collectionPath,
        collection_name: collectionPath.split(" / ").at(-1) || collectionPath,
        schedule_id: options.scheduleId || "",
        trigger_type: options.triggerType || "manual",
        environment_id: options.environmentId || "",
        status: "running",
        total: rows.length,
        passed: 0,
        failed: 0,
        duration: 0,
        items: JSON.stringify([]),
        started_at: timestamp,
        ended_at: null,
        created_at: timestamp,
    };
    insert("api_collection_runs", row);
    safeVoid(executeCollectionRun(id, rows, options.environmentId || "", row.collection_name), "API Collection");
    return { ...row, items: [] };
}
//# sourceMappingURL=api-collection-runner.js.map
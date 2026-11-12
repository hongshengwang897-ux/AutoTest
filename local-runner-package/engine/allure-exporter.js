import { randomUUID } from "node:crypto";
/**
 * 将 AutoTest 执行结果转换为 Allure 兼容格式
 * 输出标准 JSON 文件，可直接导入 Allure Dashboard 或 allure-docker
 */
export function convertToAllure(results) {
    const testCases = [];
    const suites = [];
    const containers = [];
    const suiteGroups = new Map();
    for (const result of results) {
        const startTs = result.startTime ? Date.parse(result.startTime) : 0;
        const stopTs = result.endTime ? Date.parse(result.endTime) : (startTs + (result.duration || 0));
        const tcUuid = result.executionId || randomUUID();
        const groupKey = result.caseGroupName || "未分组";
        if (!suiteGroups.has(groupKey)) {
            suiteGroups.set(groupKey, []);
        }
        suiteGroups.get(groupKey).push(tcUuid);
        const tags = result.tags || [];
        const labels = [
            { name: "testClass", value: "AutoTest" },
            { name: "testMethod", value: result.caseName || "Unnamed" },
        ];
        if (result.environment)
            labels.push({ name: "environment", value: result.environment });
        if (result.browser)
            labels.push({ name: "browser", value: result.browser });
        for (const tag of tags)
            labels.push({ name: "tag", value: tag });
        if (result.caseId)
            labels.push({ name: "suite", value: result.caseId });
        const statusMap = {
            pass: "passed", success: "passed",
            fail: "failed", failed: "failed", error: "failed",
            skip: "skipped", timeout: "broken",
        };
        const allureStatus = statusMap[result.status] || "unknown";
        const statusDetails = {};
        if (result.error) {
            statusDetails.message = result.error.slice(0, 500);
            statusDetails.flavor = "flaky";
        }
        const steps = (result.steps || []).map((step) => {
            const stepStart = startTs + (step.duration || 0) * 0;
            return {
                name: `[${step.action}] ${step.selector || "unknown"}`,
                status: statusMap[step.status] || "unknown",
                stage: "finished",
                actions: [],
                arguments: step.selector ? [{ name: "selector", value: step.selector }] : [],
                attachments: [],
                steps: [],
                start: stepStart,
                stop: stepStart + step.duration,
                duration: step.duration,
                statusDetails: {},
            };
        });
        const tc = {
            uuid: tcUuid,
            historyId: (result.caseId || "").length > 0 ? String(crc32(result.caseId || "")) : "0",
            name: result.caseName || "Unnamed Test",
            fullName: `AutoTest.${groupKey}.${result.caseName || "Unnamed"}`,
            suite: groupKey,
            subSuites: [],
            packages: ["AutoTest"],
            labels,
            links: result.executionId ? [{ name: "execution", url: `/reports/${result.executionId}`, type: "page" }] : [],
            categories: [
                { name: "auto", messageRegex: ".*" },
            ],
            steps,
            fixtures: [],
            behaviors: {
                epic: "AutoTest",
                features: [groupKey],
                stories: [result.caseName || ""],
            },
            testStage: "finished",
            start: startTs,
            stop: stopTs,
            duration: result.duration || (stopTs - startTs),
            status: allureStatus,
            statusDetails,
            description: `AutoTest execution: ${result.caseName || "unnamed"}`,
            descriptionHtml: `<p><strong>Case:</strong> ${escapeHtml(result.caseName || "unnamed")}</p>`,
            flaky: false,
            muted: false,
            parameter: [],
        };
        testCases.push(tc);
        const containerUuid = randomUUID();
        const container = {
            uuid: containerUuid,
            name: `Execution: ${result.caseName || "unnamed"}`,
            type: "beforeAfter",
            cases: [tcUuid],
            children: [],
            befores: [],
            afters: [],
            status: allureStatus,
            start: startTs,
            stop: stopTs,
            duration: result.duration || (stopTs - startTs),
        };
        containers.push(container);
    }
    for (const [groupName, uuids] of suiteGroups) {
        suites.push({ name: groupName, children: uuids });
    }
    return { testCases, suites, containers };
}
function crc32(str) {
    let crc = 0xffffffff;
    for (let i = 0; i < str.length; i++) {
        crc ^= str.charCodeAt(i);
        for (let j = 0; j < 8; j++) {
            crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
//# sourceMappingURL=allure-exporter.js.map
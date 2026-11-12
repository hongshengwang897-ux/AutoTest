import { all } from "./data/db.js";
function uid(prefix = "postman") {
    return `${prefix}_${Math.random().toString(36).slice(2, 14)}`;
}
function assertScript(assertions) {
    if (!assertions || assertions.length === 0)
        return null;
    const lines = [];
    for (const assertion of assertions) {
        const { source, operator, target, expected } = assertion;
        if (source === "status") {
            const op = operator === "equals" || operator === "eq" ? "equal" : operator;
            lines.push(`pm.test("Status code is ${expected}", () => {`);
            lines.push(`  pm.response.to.have.${op}(${expected});`);
            lines.push(`});`);
        }
        else if (source === "body") {
            const op = operator === "equals" || operator === "eq" ? "equal" : operator;
            lines.push(`pm.test("Body ${op} ${expected}", () => {`);
            if (target) {
                try {
                    const parsed = JSON.parse(expected);
                    lines.push(`  const json = pm.response.json();`);
                    lines.push(`  pm.expect(json.${target}).to.${op}(${JSON.stringify(parsed)});`);
                }
                catch {
                    lines.push(`  pm.response.to.${op}(${JSON.stringify(expected)});`);
                }
            }
            else {
                lines.push(`  pm.response.to.${op}(${JSON.stringify(expected)});`);
            }
            lines.push(`});`);
        }
        else if (source === "header") {
            const op = operator === "equals" || operator === "eq" ? "equal" : operator;
            lines.push(`pm.test("Header ${target} ${op} ${expected}", () => {`);
            lines.push(`  pm.response.to.have.header(${JSON.stringify(target)}, ${JSON.stringify(expected)});`);
            lines.push(`});`);
        }
        else if (source === "jsonPath") {
            const op = operator === "equals" || operator === "eq" ? "equal" : operator;
            lines.push(`pm.test("JSON path ${target} ${op} ${expected}", () => {`);
            lines.push(`  const json = pm.response.json();`);
            try {
                const parsed = JSON.parse(expected);
                lines.push(`  pm.expect(json.${target}).to.${op}(${JSON.stringify(parsed)});`);
            }
            catch {
                lines.push(`  pm.expect(json.${target}).to.${op}(${JSON.stringify(expected)});`);
            }
            lines.push(`});`);
        }
    }
    return lines.join("\n");
}
function exportRequest(caseItem) {
    const headers = (caseItem.headers || [])
        .filter((h) => h.enabled !== false && h.key)
        .map((h) => ({ key: h.key, value: h.value }));
    const url = { raw: caseItem.url || "" };
    if ((caseItem.queryParams || []).some((q) => q.enabled !== false && q.key)) {
        url.query = (caseItem.queryParams || [])
            .filter((q) => q.enabled !== false && q.key)
            .map((q) => ({ key: q.key, value: q.value }));
    }
    const request = {
        name: caseItem.name,
        method: caseItem.method.toUpperCase(),
        description: caseItem.description || undefined,
        header: headers,
        url,
    };
    if (caseItem.bodyType && caseItem.bodyType !== "none" && caseItem.body) {
        if (caseItem.bodyType === "json") {
            request.body = {
                mode: "raw",
                raw: caseItem.body,
                options: { raw: { language: "json" } },
            };
        }
        else if (caseItem.bodyType === "form") {
            request.body = {
                mode: "urlencoded",
                urlencoded: caseItem.body.split("&").map((pair) => {
                    const [key, value] = pair.split("=", 2);
                    return { key, value: value ?? "" };
                }),
            };
        }
        else {
            request.body = {
                mode: "raw",
                raw: caseItem.body,
                options: { raw: { language: "text" } },
            };
        }
    }
    return request;
}
function exportItem(caseItem) {
    const request = exportRequest(caseItem);
    const testScript = assertScript(caseItem.assertions);
    const item = {
        id: uid(),
        name: caseItem.name,
        request,
    };
    if (caseItem.description)
        item.description = caseItem.description;
    if (testScript) {
        item.event = [
            {
                listen: "test",
                script: { type: "text/javascript", exec: testScript.split("\n") },
            },
        ];
    }
    if (caseItem.variables && Object.keys(caseItem.variables).length > 0) {
        item.variable = Object.entries(caseItem.variables).map(([key, value]) => ({
            id: uid(),
            key,
            value,
            type: "text",
        }));
    }
    return item;
}
export function exportToPostmanCollection(cases, collectionName = "AutoTest Collection") {
    const grouped = {};
    for (const c of cases) {
        const group = c.group || "Uncategorized";
        if (!grouped[group])
            grouped[group] = [];
        grouped[group].push(c);
    }
    const items = [];
    for (const [groupName, groupCases] of Object.entries(grouped)) {
        if (groupCases.length === 1) {
            items.push(exportItem(groupCases[0]));
        }
        else {
            items.push({
                id: uid(),
                name: groupName,
                item: groupCases.map(exportItem),
            });
        }
    }
    return {
        info: {
            _postman_id: uid(),
            name: collectionName,
            schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
            description: `Exported from AutoTest on ${new Date().toISOString()}`,
        },
        item: items,
    };
}
export function getCasesForExport() {
    const rows = all("api_cases");
    return rows.map((row) => {
        const headers = Array.isArray(row.headers) ? row.headers : (Array.isArray(JSON.parse(row.headers || "[]")) ? JSON.parse(row.headers) : []);
        const queryParams = Array.isArray(row.query_params) ? row.query_params : (Array.isArray(JSON.parse(row.query_params || "[]")) ? JSON.parse(row.query_params) : []);
        const assertions = Array.isArray(row.assertions) ? row.assertions : (Array.isArray(JSON.parse(row.assertions || "[]")) ? JSON.parse(row.assertions) : []);
        const variables = row.variables && typeof row.variables === "object" ? row.variables : (typeof row.variables === "string" ? JSON.parse(row.variables || "{}") : {});
        return {
            id: row.id,
            name: row.name || "Untitled",
            description: row.description || "",
            method: (row.method || "GET").toUpperCase(),
            url: row.url || "",
            headers: headers.filter((h) => h && h.key).map((h) => ({ key: String(h.key), value: String(h.value ?? ""), enabled: h.enabled !== false })),
            queryParams: queryParams.filter((q) => q && q.key).map((q) => ({ key: String(q.key), value: String(q.value ?? ""), enabled: q.enabled !== false })),
            bodyType: row.body_type || "none",
            body: row.body || "",
            assertions,
            variables,
            group: row.group_name || "",
        };
    });
}
//# sourceMappingURL=postman-export.js.map
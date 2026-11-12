import { get, insert, createId, now } from "./data/db.js";
import { renderTemplate, normalizeRepeatedVariablePath, valueAtPath, displayValue, compare, } from "./assertion-utils.js";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
/** 将 Headers 对象转为 Record */
function responseHeaderObject(headers) {
    const result = {};
    headers.forEach((value, key) => { result[key] = value; });
    return result;
}
async function readLimitedBody(response) {
    if (!response.body)
        return { text: "", size: 0, truncated: false };
    const reader = response.body.getReader();
    const chunks = [];
    let kept = 0;
    let total = 0;
    let truncated = false;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        total += value.byteLength;
        const remaining = MAX_RESPONSE_BYTES - kept;
        if (remaining > 0) {
            const chunk = value.byteLength <= remaining ? value : value.slice(0, remaining);
            chunks.push(chunk);
            kept += chunk.byteLength;
        }
        if (total > MAX_RESPONSE_BYTES) {
            truncated = true;
            await reader.cancel();
            break;
        }
    }
    const merged = new Uint8Array(kept);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
    }
    const text = new TextDecoder().decode(merged) + (truncated ? "\n\n[响应体超过 2 MB，已截断]" : "");
    const contentLength = Number(response.headers.get("content-length"));
    return { text, size: Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : total, truncated };
}
export async function runApiTest(definition) {
    const startedAt = Date.now();
    const caseId = definition.id || "";
    const caseName = definition.name?.trim() || "未命名接口请求";
    const method = (definition.method || "GET").toUpperCase();
    const executionId = `api-exec-${createId()}`;
    let requestUrl = definition.url || "";
    const requestHeaders = {};
    let requestBody = "";
    try {
        if (!HTTP_METHODS.has(method))
            throw new Error(`不支持的请求方法: ${method}`);
        if (!requestUrl.trim())
            throw new Error("请求 URL 不能为空");
        const environment = definition.environmentId ? get("environments", definition.environmentId) : null;
        if (definition.environmentId && !environment)
            throw new Error("所选接口测试环境不存在");
        if (environment && (environment.scope || "platform") !== "api")
            throw new Error("所选环境不是接口测试环境");
        const variables = {
            ...(environment?.variables && typeof environment.variables === "object" ? environment.variables : {}),
            ...(definition.variables || {}),
        };
        requestUrl = normalizeRepeatedVariablePath(renderTemplate(requestUrl.trim(), variables), variables);
        const baseUrl = environment?.url ? renderTemplate(String(environment.url), variables) : "";
        if (!/^https?:\/\//i.test(requestUrl) && !baseUrl) {
            throw new Error("相对 URL 需要选择带有 URL 的执行环境");
        }
        const url = /^https?:\/\//i.test(requestUrl)
            ? new URL(requestUrl)
            : new URL(requestUrl, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
        if (url.protocol !== "http:" && url.protocol !== "https:")
            throw new Error("仅支持 HTTP/HTTPS 请求");
        for (const item of definition.queryParams || []) {
            if (item.enabled === false || !item.key.trim())
                continue;
            url.searchParams.append(renderTemplate(item.key, variables), renderTemplate(item.value || "", variables));
        }
        requestUrl = url.toString();
        for (const item of definition.headers || []) {
            if (item.enabled === false || !item.key.trim())
                continue;
            requestHeaders[renderTemplate(item.key.trim(), variables)] = renderTemplate(item.value || "", variables);
        }
        const bodyType = definition.bodyType || "none";
        const canSendBody = method !== "GET" && method !== "HEAD" && bodyType !== "none";
        if (canSendBody) {
            requestBody = renderTemplate(definition.body || "", variables);
            const headerNames = Object.keys(requestHeaders).map((key) => key.toLowerCase());
            if (bodyType === "json") {
                if (requestBody.trim())
                    JSON.parse(requestBody);
                if (!headerNames.includes("content-type"))
                    requestHeaders["Content-Type"] = "application/json";
            }
            else if (bodyType === "form" && !headerNames.includes("content-type")) {
                requestHeaders["Content-Type"] = "application/x-www-form-urlencoded";
            }
            else if (bodyType === "text" && !headerNames.includes("content-type")) {
                requestHeaders["Content-Type"] = "text/plain; charset=utf-8";
            }
        }
        const timeoutMs = Math.min(Math.max(Number(definition.timeoutMs) || 30000, 1000), 120000);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
            response = await fetch(requestUrl, {
                method,
                headers: requestHeaders,
                body: canSendBody ? requestBody : undefined,
                signal: controller.signal,
                redirect: "follow",
            });
        }
        finally {
            clearTimeout(timer);
        }
        const responseHeaders = responseHeaderObject(response.headers);
        const responseData = await readLimitedBody(response);
        let jsonBody;
        try {
            jsonBody = JSON.parse(responseData.text);
        }
        catch {
            jsonBody = undefined;
        }
        const assertionResults = (definition.assertions || []).map((assertion) => {
            const expected = renderTemplate(assertion.expected || "", variables);
            let actual;
            let message = "";
            if (assertion.source === "status") {
                actual = response.status;
                message = `状态码 ${response.status}`;
            }
            else if (assertion.source === "body") {
                actual = responseData.text;
                message = "响应体";
            }
            else if (assertion.source === "header") {
                actual = responseHeaders[(assertion.target || "").toLowerCase()];
                message = `响应头 ${assertion.target || ""}`;
            }
            else {
                actual = jsonBody === undefined ? undefined : valueAtPath(jsonBody, assertion.target || "");
                message = `JSON ${assertion.target || "$"}`;
            }
            const passed = compare(actual, assertion.operator, expected);
            return {
                id: assertion.id || createId(),
                source: assertion.source,
                operator: assertion.operator,
                target: assertion.target || "",
                expected,
                actual: displayValue(actual),
                passed,
                message: `${message} ${passed ? "断言通过" : "断言失败"}`,
            };
        });
        const status = assertionResults.every((item) => item.passed) ? "success" : "failed";
        const duration = Date.now() - startedAt;
        const row = {
            id: executionId,
            case_id: caseId,
            case_name: caseName,
            status,
            method,
            url: requestUrl,
            status_code: response.status,
            duration,
            response_size: responseData.size,
            request_headers: JSON.stringify(requestHeaders),
            request_body: requestBody,
            response_headers: JSON.stringify(responseHeaders),
            response_body: responseData.text,
            assertion_results: JSON.stringify(assertionResults),
            error_message: null,
            created_at: now(),
        };
        insert("api_executions", row);
        return { ...row, request_headers: requestHeaders, response_headers: responseHeaders, assertion_results: assertionResults };
    }
    catch (error) {
        const duration = Date.now() - startedAt;
        const message = error instanceof Error
            ? (error.name === "AbortError" ? "请求超时" : error.message)
            : String(error);
        const row = {
            id: executionId,
            case_id: caseId,
            case_name: caseName,
            status: "error",
            method,
            url: requestUrl,
            status_code: null,
            duration,
            response_size: 0,
            request_headers: JSON.stringify(requestHeaders),
            request_body: requestBody,
            response_headers: JSON.stringify({}),
            response_body: "",
            assertion_results: JSON.stringify([]),
            error_message: message,
            created_at: now(),
        };
        try {
            insert("api_executions", row);
        }
        catch (persistError) {
            // 落库失败不能逃逸出 catch 分支，否则会变成 unhandledRejection 崩溃进程
            console.error("[API Test] 执行失败记录落库失败:", persistError instanceof Error ? persistError.message : persistError);
        }
        return { ...row, request_headers: requestHeaders, response_headers: {}, assertion_results: [] };
    }
}
//# sourceMappingURL=api-test-runner.js.map
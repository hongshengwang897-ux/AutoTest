import { get, insert, update, createId, now } from "./data/db.js";
import {
  renderTemplate,
  normalizeRepeatedVariablePath,
  valueAtPath,
  displayValue,
  compare,
} from "./assertion-utils.js";

export interface KeyValueItem {
  id?: string;
  key: string;
  value: string;
  enabled?: boolean;
}

export interface ApiAssertion {
  id?: string;
  source: "status" | "body" | "header" | "json";
  operator: "equals" | "not_equals" | "contains" | "not_contains" | "exists" | "not_exists" | "matches" | "greater_than" | "less_than";
  target?: string;
  expected?: string;
}

/** 响应提取规则：执行成功后按 path 取响应 JSON 值，写入 scope 对应的变量 */
export interface ApiExtraction {
  id?: string;
  /** 目标变量名 */
  variable: string;
  /** 响应 JSON 路径，支持 data.token 与 $.data.token */
  path: string;
  /** 写入位置：当前用例变量 或 接口环境变量 */
  scope: "case" | "environment";
}

export interface ApiTestDefinition {
  id?: string;
  name?: string;
  method?: string;
  url?: string;
  headers?: KeyValueItem[];
  queryParams?: KeyValueItem[];
  bodyType?: "none" | "json" | "text" | "form";
  body?: string;
  assertions?: ApiAssertion[];
  variables?: Record<string, string>;
  extractions?: ApiExtraction[];
  environmentId?: string;
  timeoutMs?: number;
}

export interface ResolvedExtraction {
  variable: string;
  scope: "case" | "environment";
  value: string;
}

/**
 * 纯函数：根据响应 JSON 与提取规则，解析出要写回的值。
 * path 先经 renderTemplate 渲染 {{变量}}，再经 valueAtPath 取值；
 * undefined/null 跳过（避免覆盖已有值），对象/数组 JSON.stringify，其余 String。
 */
export function resolveExtractions(
  jsonBody: unknown,
  extractions: ApiExtraction[] | undefined,
  variables: Record<string, string>
): ResolvedExtraction[] {
  const results: ResolvedExtraction[] = [];
  for (const extraction of extractions || []) {
    if (!extraction.variable) continue;
    const path = renderTemplate(extraction.path || "", variables);
    const value = valueAtPath(jsonBody, path);
    if (value === undefined || value === null) continue;
    results.push({
      variable: extraction.variable,
      scope: extraction.scope === "environment" ? "environment" : "case",
      value: typeof value === "object" ? JSON.stringify(value) : String(value),
    });
  }
  return results;
}

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/** 将 Headers 对象转为 Record */
function responseHeaderObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => { result[key] = value; });
  return result;
}

async function readLimitedBody(response: Response): Promise<{ text: string; size: number; truncated: boolean }> {
  if (!response.body) return { text: "", size: 0, truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let kept = 0;
  let total = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
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

export async function runApiTest(definition: ApiTestDefinition) {
  const startedAt = Date.now();
  const caseId = definition.id || "";
  const caseName = definition.name?.trim() || "未命名接口请求";
  const method = (definition.method || "GET").toUpperCase();
  const executionId = `api-exec-${createId()}`;
  let requestUrl = definition.url || "";
  const requestHeaders: Record<string, string> = {};
  let requestBody = "";

  try {
    if (!HTTP_METHODS.has(method)) throw new Error(`不支持的请求方法: ${method}`);
    if (!requestUrl.trim()) throw new Error("请求 URL 不能为空");

    const environment = definition.environmentId ? get("environments", definition.environmentId) : null;
    if (definition.environmentId && !environment) throw new Error("所选接口测试环境不存在");
    if (environment && (environment.scope || "platform") !== "api") throw new Error("所选环境不是接口测试环境");
    const variables: Record<string, string> = {
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
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("仅支持 HTTP/HTTPS 请求");

    for (const item of definition.queryParams || []) {
      if (item.enabled === false || !item.key.trim()) continue;
      url.searchParams.append(renderTemplate(item.key, variables), renderTemplate(item.value || "", variables));
    }
    requestUrl = url.toString();

    for (const item of definition.headers || []) {
      if (item.enabled === false || !item.key.trim()) continue;
      requestHeaders[renderTemplate(item.key.trim(), variables)] = renderTemplate(item.value || "", variables);
    }

    const bodyType = definition.bodyType || "none";
    const canSendBody = method !== "GET" && method !== "HEAD" && bodyType !== "none";
    if (canSendBody) {
      requestBody = renderTemplate(definition.body || "", variables);
      const headerNames = Object.keys(requestHeaders).map((key) => key.toLowerCase());
      if (bodyType === "json") {
        if (requestBody.trim()) JSON.parse(requestBody);
        if (!headerNames.includes("content-type")) requestHeaders["Content-Type"] = "application/json";
      } else if (bodyType === "form" && !headerNames.includes("content-type")) {
        requestHeaders["Content-Type"] = "application/x-www-form-urlencoded";
      } else if (bodyType === "text" && !headerNames.includes("content-type")) {
        requestHeaders["Content-Type"] = "text/plain; charset=utf-8";
      }
    }

    const timeoutMs = Math.min(Math.max(Number(definition.timeoutMs) || 30000, 1000), 120000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method,
        headers: requestHeaders,
        body: canSendBody ? requestBody : undefined,
        signal: controller.signal,
        redirect: "follow",
      });
    } finally {
      clearTimeout(timer);
    }

    const responseHeaders = responseHeaderObject(response.headers);
    const responseData = await readLimitedBody(response);
    let jsonBody: unknown;
    try { jsonBody = JSON.parse(responseData.text); } catch { jsonBody = undefined; }

    const assertionResults = (definition.assertions || []).map((assertion) => {
      const expected = renderTemplate(assertion.expected || "", variables);
      let actual: unknown;
      let message = "";
      if (assertion.source === "status") {
        actual = response.status;
        message = `状态码 ${response.status}`;
      } else if (assertion.source === "body") {
        actual = responseData.text;
        message = "响应体";
      } else if (assertion.source === "header") {
        actual = responseHeaders[(assertion.target || "").toLowerCase()];
        message = `响应头 ${assertion.target || ""}`;
      } else {
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

    // 断言失败时把失败原因写入 error_message，供集合报告 items / Allure / Excel 透传展示
    const failedAssertions = assertionResults.filter((item) => !item.passed);
    const assertionErrorMessage = failedAssertions.length > 0
      ? failedAssertions.map((item) => `${item.source === "status" ? `状态码 ${response.status}` : `${item.source} ${item.target || ""}`} 期望 ${item.expected}，实际 ${item.actual}`).join("；")
      : null;
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
      error_message: assertionErrorMessage,
      created_at: now(),
    };
    insert("api_executions", row);
    // 响应提取：仅执行成功时，把响应里的值写回用例/环境变量（失败/异常不写入，避免错误值覆盖）
    if (status === "success" && jsonBody !== undefined) {
      for (const item of resolveExtractions(jsonBody, definition.extractions, variables)) {
        try {
          if (item.scope === "environment") {
            if (!definition.environmentId) continue;
            const env = get("environments", definition.environmentId);
            if (!env) continue;
            update("environments", definition.environmentId, { variables: JSON.stringify({ ...(env.variables || {}), [item.variable]: item.value }) });
          } else {
            if (!caseId) continue;
            const caseRow = get("api_cases", caseId);
            if (!caseRow) continue;
            update("api_cases", caseId, { variables: JSON.stringify({ ...(caseRow.variables || {}), [item.variable]: item.value }) });
          }
        } catch (error) {
          console.error(`[API 提取] ${item.variable} 写回失败:`, error instanceof Error ? error.message : error);
        }
      }
    }
    return { ...row, request_headers: requestHeaders, response_headers: responseHeaders, assertion_results: assertionResults };
  } catch (error) {
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
    } catch (persistError) {
      // 落库失败不能逃逸出 catch 分支，否则会变成 unhandledRejection 崩溃进程
      console.error("[API Test] 执行失败记录落库失败:", persistError instanceof Error ? persistError.message : persistError);
    }
    return { ...row, request_headers: requestHeaders, response_headers: {}, assertion_results: [] };
  }
}

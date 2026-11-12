/**
 * 断言公共模块 — api-test-runner.ts 与 performance-runner.ts 的公共断言逻辑
 * 抽离前两份 runner 中几乎完全相同的实现，消除重复代码。
 */

export type AssertionSource = "status" | "body" | "header" | "json";

export type AssertionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "exists"
  | "not_exists"
  | "matches"
  | "greater_than"
  | "less_than";

export interface ApiAssertionDefinition {
  source: AssertionSource;
  operator: AssertionOperator;
  target: string;
  expected: string;
}

const NESTED_QUANTIFIER = /(\([^)]*[+*][^)]*\)[+*])/;
const MAX_REGEX_LENGTH = 200;

/**
 * 渲染 {{key}} 模板变量
 */
export function renderTemplate(value: string, variables: Record<string, string>): string {
  return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (original, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : original
  );
}

/**
 * 折叠重复的变量路径（Postman gateway-url 带路径 + 请求重复写路径的场景）
 */
export function normalizeRepeatedVariablePath(value: string, variables: Record<string, string>): string {
  let normalized = value;
  for (const variableValue of Object.values(variables)) {
    if (!/^https?:\/\//i.test(variableValue)) continue;
    let base: URL;
    let request: URL;
    try {
      base = new URL(variableValue);
      request = new URL(normalized);
    } catch {
      continue;
    }
    const basePath = base.pathname.replace(/\/+$/, "");
    if (!basePath || basePath === "/" || request.origin !== base.origin) continue;
    const repeatedPath = `${basePath}${basePath}`;
    if (request.pathname !== repeatedPath && !request.pathname.startsWith(`${repeatedPath}/`)) continue;
    request.pathname = `${basePath}${request.pathname.slice(repeatedPath.length)}` || "/";
    normalized = request.toString();
  }
  return normalized;
}

/**
 * 按点分路径获取嵌套值，支持 $.xxx、xxx[0].yyy 语法
 */
export function valueAtPath(value: unknown, path: string): unknown {
  const normalized = path.trim().replace(/^\$\.?/, "").replace(/\[(\d+)\]/g, ".$1");
  if (!normalized) return value;
  return normalized.split(".").filter(Boolean).reduce<unknown>((current, key) => {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

/**
 * 将任意值转为可显示的字符串
 */
export function displayValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/**
 * 执行单个断言比较，含 ReDoS 防护（正则长度 + 嵌套量词预检）
 */
export function compare(actual: unknown, operator: AssertionOperator, expected: string): boolean {
  const actualText = displayValue(actual);
  switch (operator) {
    case "exists":
      return actual !== undefined && actual !== null;
    case "not_exists":
      return actual === undefined || actual === null;
    case "equals":
      return actualText === expected;
    case "not_equals":
      return actualText !== expected;
    case "contains":
      return actualText.includes(expected);
    case "not_contains":
      return !actualText.includes(expected);
    case "greater_than":
      return Number(actual) > Number(expected);
    case "less_than":
      return Number(actual) < Number(expected);
    case "matches": {
      if (typeof expected !== "string" || expected.length === 0) return false;
      if (expected.length > MAX_REGEX_LENGTH) return false;
      if (NESTED_QUANTIFIER.test(expected)) return false;
      try {
        return new RegExp(expected).test(actualText);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

/**
 * 按 source 获取断言的实际值
 */
export function getAssertionActual(
  assertion: ApiAssertionDefinition,
  responseStatus: number,
  responseBody: string,
  responseHeaders: Record<string, string>,
  jsonBody?: unknown
): unknown {
  switch (assertion.source) {
    case "status":
      return responseStatus;
    case "body":
      return responseBody;
    case "header":
      return responseHeaders[(assertion.target || "").toLowerCase()];
    case "json":
      return jsonBody === undefined ? undefined : valueAtPath(jsonBody, assertion.target || "");
    default:
      return undefined;
  }
}

/**
 * 获取断言的中文描述标签（在 evaluateAssertions 中内联使用）
 */
export function getAssertionTargetLabel(assertion: ApiAssertionDefinition, responseStatus: number): string {
  switch (assertion.source) {
    case "status":
      return `状态码 ${responseStatus}`;
    case "body":
      return "响应体";
    case "header":
      return `响应头 ${assertion.target || ""}`;
    case "json":
      return `JSON ${assertion.target || "$"}`;
    default:
      return assertion.source;
  }
}

/**
 * 评估所有断言，返回结果数组
 */
export function evaluateAssertions(
  assertions: ApiAssertionDefinition[],
  responseStatus: number,
  responseBody: string,
  responseHeaders: Record<string, string>,
  variables: Record<string, string> = {},
  jsonBody?: unknown
): Array<{
  source: AssertionSource;
  operator: AssertionOperator;
  target: string;
  expected: string;
  actual: string;
  passed: boolean;
  message: string;
}> {
  const results = assertions.map((assertion) => {
    const expected = renderTemplate(assertion.expected || "", variables);
    const actual = getAssertionActual(assertion, responseStatus, responseBody, responseHeaders, jsonBody);
    const passed = compare(actual, assertion.operator, expected);
    const targetLabel = assertion.source === "status"
      ? `状态码 ${responseStatus}`
      : assertion.source === "body"
        ? "响应体"
        : assertion.source === "header"
          ? `响应头 ${assertion.target || ""}`
          : `JSON ${assertion.target || "$"}`;
    return {
      source: assertion.source,
      operator: assertion.operator,
      target: assertion.target || "",
      expected,
      actual: displayValue(actual),
      passed,
      message: `${targetLabel} ${passed ? "断言通过" : "断言失败"}`,
    };
  });
  return results;
}

/**
 * 收集断言失败信息（仅返回失败原因），供 performance-runner 使用
 */
export function getAssertionFailures(
  requestAssertions: ApiAssertionDefinition[],
  response: {
    status: number;
    headers: Record<string, string>;
    body: string;
    jsonBody?: unknown;
  }
): string[] {
  if (requestAssertions.length === 0) return [];
  return requestAssertions.flatMap((assertion) => {
    const actual = getAssertionActual(assertion, response.status, response.body, response.headers, response.jsonBody);
    if (compare(actual, assertion.operator, assertion.expected)) return [];
    const target = assertion.source === "status"
      ? "状态码"
      : assertion.source === "body"
        ? "响应 Body"
        : assertion.source === "header"
          ? `响应 Header ${assertion.target}`
          : `JSON ${assertion.target || "$"}`;
    return [
      `${target} ${assertion.operator} ${assertion.expected || "(空)"}，实际为 ${displayValue(actual)}`
    ];
  });
}
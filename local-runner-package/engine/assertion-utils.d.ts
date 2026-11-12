/**
 * 断言公共模块 — api-test-runner.ts 与 performance-runner.ts 的公共断言逻辑
 * 抽离前两份 runner 中几乎完全相同的实现，消除重复代码。
 */
export type AssertionSource = "status" | "body" | "header" | "json";
export type AssertionOperator = "equals" | "not_equals" | "contains" | "not_contains" | "exists" | "not_exists" | "matches" | "greater_than" | "less_than";
export interface ApiAssertionDefinition {
    source: AssertionSource;
    operator: AssertionOperator;
    target: string;
    expected: string;
}
/**
 * 渲染 {{key}} 模板变量
 */
export declare function renderTemplate(value: string, variables: Record<string, string>): string;
/**
 * 折叠重复的变量路径（Postman gateway-url 带路径 + 请求重复写路径的场景）
 */
export declare function normalizeRepeatedVariablePath(value: string, variables: Record<string, string>): string;
/**
 * 按点分路径获取嵌套值，支持 $.xxx、xxx[0].yyy 语法
 */
export declare function valueAtPath(value: unknown, path: string): unknown;
/**
 * 将任意值转为可显示的字符串
 */
export declare function displayValue(value: unknown): string;
/**
 * 执行单个断言比较，含 ReDoS 防护（正则长度 + 嵌套量词预检）
 */
export declare function compare(actual: unknown, operator: AssertionOperator, expected: string): boolean;
/**
 * 按 source 获取断言的实际值
 */
export declare function getAssertionActual(assertion: ApiAssertionDefinition, responseStatus: number, responseBody: string, responseHeaders: Record<string, string>, jsonBody?: unknown): unknown;
/**
 * 获取断言的中文描述标签（在 evaluateAssertions 中内联使用）
 */
export declare function getAssertionTargetLabel(assertion: ApiAssertionDefinition, responseStatus: number): string;
/**
 * 评估所有断言，返回结果数组
 */
export declare function evaluateAssertions(assertions: ApiAssertionDefinition[], responseStatus: number, responseBody: string, responseHeaders: Record<string, string>, variables?: Record<string, string>, jsonBody?: unknown): Array<{
    source: AssertionSource;
    operator: AssertionOperator;
    target: string;
    expected: string;
    actual: string;
    passed: boolean;
    message: string;
}>;
/**
 * 收集断言失败信息（仅返回失败原因），供 performance-runner 使用
 */
export declare function getAssertionFailures(requestAssertions: ApiAssertionDefinition[], response: {
    status: number;
    headers: Record<string, string>;
    body: string;
    jsonBody?: unknown;
}): string[];

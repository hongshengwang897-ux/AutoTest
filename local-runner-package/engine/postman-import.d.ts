import type { ApiAssertion, KeyValueItem } from "./api-test-runner.js";
export interface ImportedPostmanCase {
    name: string;
    description: string;
    method: string;
    url: string;
    headers: KeyValueItem[];
    queryParams: KeyValueItem[];
    bodyType: "none" | "json" | "text" | "form";
    body: string;
    assertions: ApiAssertion[];
    variables: Record<string, string>;
    environmentId: string;
    group: string;
}
export interface PostmanImportResult {
    collectionName: string;
    cases: ImportedPostmanCase[];
    skipped: number;
    warnings: string[];
}
export declare function parsePostmanCollection(collection: any): PostmanImportResult;
export interface ParsedPostmanEnvironment {
    name: string;
    url: string;
    variables: Record<string, string>;
    /** 已启用变量数（会导入） */
    enabledCount: number;
    /** 已禁用/空 key 变量数（不导入） */
    skippedCount: number;
}
/**
 * 判断一个文档是否为 Postman 环境导出：
 * 环境必须有 values 数组，且带 _postman_variable_scope 标记或无 info（区别于 Collection）。
 */
export declare function isPostmanEnvironment(document: unknown): boolean;
/**
 * 解析单个 Postman 环境对象 → 平台环境字段。
 * 非环境对象返回 null。变量仅取已启用项，URL 从 url/host/gateway/base 开头的 https 值猜测。
 */
export declare function parsePostmanEnvironment(env: any, fallbackName?: string): ParsedPostmanEnvironment | null;

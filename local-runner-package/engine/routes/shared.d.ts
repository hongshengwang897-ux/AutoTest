/**
 * 路由层共用工具：安全 JSON 解析、分页参数解析、列表标量映射。
 * 仅收敛 routes 目录内各列表接口的重复实现，接口行为保持不变。
 */
import { safeLimit, safePage } from "../paging.js";
export { safeLimit, safePage };
/** 安全 JSON 解析：非字符串原样返回（null/undefined 回落默认值），解析失败回落默认值 */
export declare function parseJson<T>(value: unknown, fallback: T): T;
/**
 * 解析列表接口分页参数：page/limit 非法或缺省回落默认值，
 * 返回 page/limit 及对应的 SQL OFFSET，供 LIMIT ? OFFSET ? 下推使用。
 */
export declare function readPaging(query: Record<string, unknown>, defaultLimit: number, maxLimit?: number): {
    page: number;
    limit: number;
    offset: number;
};
/**
 * 列表项标量映射：按白名单列输出并附加 camelCase 别名，
 * 保证 logs/steps/screenshots 等重 JSON 字段不会进入列表响应。
 */
export declare function toListApi(row: Record<string, unknown>, columns: string[], aliases?: Record<string, string>): Record<string, unknown>;
/** 生成 IN 子句占位符串（如 "?, ?"），调用方需保证 values 非空 */
export declare function placeholders(values: unknown[]): string;

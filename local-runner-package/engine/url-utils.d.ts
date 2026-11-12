/**
 * 共享 URL 工具 — 供 api-collection-runner / performance-runner 等报告模块复用
 */
/** 报告展示用 URL 脱敏：将 token/secret/password 等敏感查询参数替换为 ******** */
export declare function maskReportUrl(value: unknown): string;

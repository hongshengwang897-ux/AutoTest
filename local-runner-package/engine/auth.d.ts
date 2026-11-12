import { type NextFunction, type Request, type Response } from "express";
/** 读取当前 API token（env > settings 表） */
export declare function getApiToken(): string | null;
/** 确保存在 API token：无则生成并持久化，返回是否启用认证 */
export declare function ensureApiToken(): {
    token: string;
    enabled: boolean;
};
/** 重新生成 token（需已认证） */
export declare function regenerateApiToken(): string;
/** 校验请求是否携带有效 token */
export declare function isAuthorized(req: Request): boolean;
/** 认证中间件：挂载在 /api 下，按白名单放行 */
export declare function requireAuth(req: Request, res: Response, next: NextFunction): void;
declare const router: import("express-serve-static-core").Router;
export default router;

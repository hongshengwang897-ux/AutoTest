import { Browser } from "playwright";
import type { AutoDetectSession, DetectedElement } from "./types.js";
/**
 * 校验目标 URL 是否允许访问（SSRF 防护，供 auto-detect 与 recorder 共用）。
 * 仅允许 http/https；阻止 file://、data:、私有/内网地址（含 IPv6 内网段、
 * ::ffff: 映射地址、十六进制/八进制/十进制 IP 变体）等目标。
 * 返回 null 表示允许访问；否则返回拒绝原因（可直接作为错误信息抛出）。
 */
export declare function isPrivateTarget(url: string): string | null;
export declare function getBrowser(headless: boolean): Promise<Browser>;
export declare function openPage(url: string, headless: boolean, apiBaseUrl: string): Promise<{
    sessionId: string;
}>;
export declare function scanPageElements(sessionId: string): Promise<{
    elements: DetectedElement[];
    totalFound: number;
    afterDedup: number;
}>;
export declare function receiveReport(sessionId: string, rawElements: DetectedElement[]): {
    elements: DetectedElement[];
    totalFound: number;
    afterDedup: number;
};
export declare function closePage(sessionId: string): Promise<void>;
export declare function getSession(sessionId: string): AutoDetectSession | undefined;
export declare function getSessionElements(sessionId: string): DetectedElement[];
/** 关闭全部 auto-detect 会话（优雅停机用），尽力清理，单个失败不影响其他 */
export declare function closeAllSessions(): Promise<void>;

import type { RecordingSession, RecordedEvent } from "./types.js";
import { BrowserContext, Page } from "playwright";
export declare const _pageRefs: Map<string, {
    page: Page;
    context: BrowserContext;
}>;
export interface EmbeddedElement {
    selector: string;
    selectorType: "css";
    target: string;
    tagName: string;
    type: string;
    value: string;
    bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
export declare function visitPage(url: string, headless: boolean, _apiBase?: string): Promise<{
    sessionId: string;
    warning?: string;
}>;
export declare function startCapture(sessionId: string, _apiBase?: string): Promise<{
    status: string;
}>;
export declare function receiveRecordingEvents(sessionId: string, events: RecordedEvent[]): {
    received: number;
    total: number;
};
export declare function getRecordingEvents(sessionId: string, since?: number): RecordedEvent[];
export declare function getRecordingSnapshot(sessionId: string): Promise<{
    image: string;
    width: number;
    height: number;
    url: string;
    title: string;
}>;
export declare function inspectRecordingPoint(sessionId: string, x: number, y: number): Promise<EmbeddedElement | null>;
export declare function performRecordingAction(sessionId: string, action: "click" | "fill" | "select" | "hover" | "check" | "uncheck" | "assert", selector: string, value?: string, target?: string, tagName?: string, x?: number, y?: number): Promise<{
    event: RecordedEvent;
    snapshot: Awaited<ReturnType<typeof getRecordingSnapshot>> | null;
}>;
export declare function stopRecording(sessionId: string): Promise<{
    events: RecordedEvent[];
}>;
export declare function pauseRecording(sessionId: string): Promise<{
    status: "paused";
}>;
export declare function resumeRecording(sessionId: string): {
    status: "recording";
};
export declare function getRecordingSession(sessionId: string): RecordingSession | undefined;
export declare function closeRecording(sessionId: string): Promise<void>;
/** 关闭全部录制会话（优雅停机用），尽力清理，单个失败不影响其他 */
export declare function closeAllSessions(): Promise<void>;

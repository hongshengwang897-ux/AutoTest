import type { Page, BrowserContext } from "playwright";
export interface DetectedElement {
    id: string;
    suggestedName: string;
    type: ElementType;
    selector: string;
    selectorType: "css" | "xpath" | "text" | "role";
    description?: string;
    tag?: string;
    checked: boolean;
}
export type ElementType = "button" | "input" | "text" | "link" | "image" | "select" | "checkbox" | "radio" | "container";
export interface AutoDetectSession {
    sessionId: string;
    url: string;
    headless: boolean;
    status: "opening" | "ready" | "scanning" | "closed";
    elements: DetectedElement[];
    createdAt: string;
    _page?: Page;
    _context?: BrowserContext;
}
export interface OpenBrowserRequest {
    url: string;
    headless: boolean;
}
export interface ScanResult {
    elements: DetectedElement[];
    totalFound: number;
    afterDedup: number;
}
export type ElementAction = "click" | "fill" | "select" | "hover" | "check" | "uncheck" | "navigate" | "assert" | "scroll" | "wait" | "keydown";
export interface RecordedEvent {
    id: string;
    timestamp: string;
    action: ElementAction;
    target: string;
    selector: string;
    selectorType?: "css" | "xpath";
    value?: string;
    tagName?: string;
    pageUrl: string;
}
export interface RecordingSession {
    sessionId: string;
    url: string;
    headless: boolean;
    status: "starting" | "browsing" | "recording" | "paused" | "stopped";
    events: RecordedEvent[];
    createdAt: string;
    warning?: string;
}

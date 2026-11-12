export interface CaseItem {
    id: string;
    name: string;
    description: string;
    script: string;
    language: "typescript" | "python";
    tags: string[];
    group: string;
    environmentId: string;
    status: "active" | "archived" | "draft";
    version: number;
    createdAt: string;
    updatedAt: string;
}
export interface ExecutionItem {
    id: string;
    caseId: string;
    caseName: string;
    status: "pending" | "running" | "success" | "failed" | "timeout";
    startTime?: string;
    endTime?: string;
    duration?: number;
    logs: LogEntry[];
    steps: ExecutionStep[];
    screenshots: string[];
    errorMessage?: string;
}
export interface LogEntry {
    timestamp: string;
    level: "info" | "warn" | "error" | "debug";
    message: string;
}
export interface ExecutionStep {
    id: string;
    action: string;
    selector: string;
    status: "pass" | "fail" | string;
    duration?: number;
    screenshot?: string;
    error?: string;
}
export interface ReportItem {
    id: string;
    executionId: string;
    caseId: string;
    caseName: string;
    status: "success" | "failed" | "timeout" | "error";
    startTime: string;
    endTime: string;
    duration: number;
    steps: ExecutionStep[];
    screenshots: string[];
    logs: LogEntry[];
    errorMessage?: string;
    createdAt: string;
}
export interface ElementItem {
    id: string;
    name: string;
    type: string;
    selector: string;
    selectorType: "css" | "xpath" | "text" | "role";
    page: string;
    description?: string;
    tags: string[];
    source: "recording" | "auto-import" | "manual";
    usageCount: number;
    lastUsed?: string;
    createdAt: string;
}
export interface EnvironmentItem {
    id: string;
    name: string;
    url: string;
    type: "dev" | "staging" | "prod";
    variables: Record<string, string>;
    accounts: {
        username: string;
        password: string;
        role: string;
    }[];
    status: "online" | "offline" | "maintenance";
}
export interface ScheduleItem {
    id: string;
    name: string;
    cronExpression: string;
    caseIds: string[];
    environmentId: string;
    enabled: boolean;
    lastRunTime?: string;
    nextRunTime?: string;
}
export interface AlertItem {
    id: string;
    name: string;
    channel: "dingtalk" | "feishu" | "email";
    webhookUrl: string;
    notifyLevels: string[];
    template: string;
    enabled: boolean;
}
export declare const cases: CaseItem[];
export declare const executions: ExecutionItem[];
export declare const reports: ReportItem[];
export declare const elements: ElementItem[];
export declare const environments: EnvironmentItem[];
export declare const schedules: ScheduleItem[];
export declare const alerts: AlertItem[];
export declare function createId(): string;
export declare function now(): string;

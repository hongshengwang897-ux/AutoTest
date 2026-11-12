export type CaseStatus = "active" | "archived" | "draft";
export type ExecutionStatus = "pending" | "running" | "success" | "failed" | "timeout";
export type LogLevel = "info" | "warn" | "error" | "debug" | string;

export interface Case {
  id: string;
  name: string;
  description: string;
  script: string;
  language: "typescript" | "python";
  tags: string[];
  group: string;
  environmentId: string;
  parameters: Record<string, string>;
  status: CaseStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LogEntry {
  id?: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface ElementDiff {
  elementName: string;
  expectedSelector: string;
  actualSelector?: string;
  expectedType?: string;
  actualType?: string;
  expectedValue?: string;
  actualValue?: string;
  changeType: "selector" | "appearance" | "value" | "missing" | "structural";
  description: string;
  suggestion: string;
  oldSnippet?: string;
  newSnippet?: string;
}

export interface StepResult {
  name: string;
  status: "pass" | "fail" | "skip";
  duration: number;
  screenshotUrl?: string;
  error?: string;
  elementDiff?: ElementDiff;
}

export interface Execution {
  id: string;
  caseId: string;
  caseName: string;
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  duration?: number;
  logs: LogEntry[];
  screenshots: { id: string; stepName: string; url: string }[];
  videoUrl?: string;
  errorMessage?: string;
  steps: StepResult[];
}

export interface Environment {
  id: string;
  name: string;
  baseUrl: string;
  variables: Record<string, string>;
  accounts: { username: string; password: string; description?: string }[];
  status: "active" | "inactive";
}

export interface Schedule {
  id: string;
  name: string;
  cronExpression: string;
  caseIds: string[];
  environmentId: string;
  enabled: boolean;
  lastRunTime?: string;
  nextRunTime?: string;
}

export interface AlertChannel {
  id: string;
  name: string;
  type: "dingtalk" | "feishu" | "email" | "webhook";
  webhookUrl: string;
  enabled: boolean;
  mentionAll?: boolean;
}

export interface WorkerNode {
  id: string;
  name: string;
  status: "online" | "offline" | "busy";
  runningTasks: number;
  maxTasks: number;
  uptime: number;
}

export type ElementType = "button" | "input" | "text" | "link" | "image" | "select" | "checkbox" | "radio" | "container" | string;
export type ElementAction = "click" | "fill" | "select" | "hover" | "check" | "uncheck" | "navigate" | "assert" | "scroll" | "wait";
export type ElementSource = "recorder" | "auto-import" | "manual" | "recording" | string;

export interface ElementItem {
  id: string;
  name: string;
  type: ElementType;
  selector: string;
  selectorType: "css" | "xpath" | "text" | "role";
  page: string;
  description?: string;
  sampleValue?: string;
  tags: string[];
  createdAt: string;
  usageCount: number;
  source: ElementSource;
}

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

export interface RecordedStep {
  id: string;
  timestamp: string;
  action: ElementAction;
  target: string;
  selector: string;
  value?: string;
  assertion?: string;
  description: string;
  generatedCode: string;
}

export interface RecordingSession {
  id: string;
  name: string;
  url: string;
  status: "recording" | "paused" | "completed";
  startTime: string;
  endTime?: string;
  steps: RecordedStep[];
  generatedScript?: string;
}

export interface TemplateStep {
  id: string;
  action: ElementAction;
  elementId?: string;
  elementName?: string;
  selector?: string;
  value?: string;
  assertion?: string;
  description: string;
}

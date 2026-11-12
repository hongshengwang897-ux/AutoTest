export declare function sendAlert(item: Record<string, any>, text: string): Promise<void>;
/** 模板变量替换：把 {{token}} 全部替换为对应值 */
export declare function renderTemplate(template: string, replacements: Record<string, string>): string;
/** 测试消息渲染：仅用「测试消息模板」，只在手动发送测试消息时使用，不用于执行结果推送 */
export declare function renderTestMessage(item: Record<string, any>): string;
export declare function deliverExecutionAlerts(module: string, caseName: string, status: string, errorMessage?: string, counts?: {
    total: number;
    pass: number;
    fail: number;
}): Promise<void>;

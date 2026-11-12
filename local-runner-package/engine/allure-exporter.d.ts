/** Allure 报告结果状态 */
type AllureStatus = "passed" | "failed" | "broken" | "skipped" | "unknown";
/** Allure 测试用例 */
export interface AllureTestCase {
    uuid: string;
    historyId: string;
    name: string;
    fullName: string;
    suite: string;
    subSuites: string[];
    packages: string[];
    labels: AllureLabel[];
    links: AllureLink[];
    categories: AllureCategory[];
    steps: AllureStep[];
    fixtures: AllureFixture[];
    behaviors: AllureBehavior;
    testStage: string;
    start: number;
    stop: number;
    duration: number;
    status: AllureStatus;
    statusDetails: AllureStatusDetails;
    description: string;
    descriptionHtml: string;
    flaky: boolean;
    muted: boolean;
    parameter: AllureParameter[];
}
interface AllureLabel {
    name: string;
    value: string;
}
interface AllureLink {
    name: string;
    url: string;
    type: string;
}
interface AllureCategory {
    name: string;
    messageRegex?: string;
    matchedStatuses?: string[];
}
interface AllureStep {
    name: string;
    status: AllureStatus;
    stage: string;
    actions: {
        name: string;
        argument: string;
    }[];
    arguments: {
        name: string;
        value: string;
        contentType?: string;
    }[];
    attachments: {
        name: string;
        source: string;
        type: string;
    }[];
    steps: AllureStep[];
    start: number;
    stop: number;
    duration: number;
    statusDetails: AllureStatusDetails;
}
interface AllureFixture {
    name: string;
    type: string;
    status: AllureStatus;
    stage: string;
    steps: AllureStep[];
    start: number;
    stop: number;
    duration: number;
    statusDetails: AllureStatusDetails;
}
interface AllureBehavior {
    epic?: string;
    features?: string[];
    stories?: string[];
}
interface AllureStatusDetails {
    flavor?: string;
    message?: string;
    trace?: string;
}
interface AllureParameter {
    name: string;
    value: string;
    mode: string;
}
export interface AllureSuite {
    name: string;
    children: string[];
}
export interface AllureContainer {
    uuid: string;
    name: string;
    type: string;
    cases: string[];
    children: string[];
    befores: unknown[];
    afters: unknown[];
    status: AllureStatus;
    start: number;
    stop: number;
    duration: number;
}
/**
 * 将 AutoTest 执行结果转换为 Allure 兼容格式
 * 输出标准 JSON 文件，可直接导入 Allure Dashboard 或 allure-docker
 */
export declare function convertToAllure(results: Array<{
    executionId?: string;
    caseId?: string;
    caseName?: string;
    caseGroupName?: string;
    status: string;
    startTime?: string;
    endTime?: string;
    duration?: number;
    steps?: Array<{
        id: string;
        action: string;
        selector: string;
        status: string;
        duration: number;
    }>;
    error?: string;
    screenshot?: string;
    environment?: string;
    browser?: string;
    tags?: string[];
}>): {
    testCases: AllureTestCase[];
    suites: AllureSuite[];
    containers: AllureContainer[];
};
export {};

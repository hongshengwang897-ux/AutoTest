/**
 * API 路由常量 — 统一管理所有后端端点
 */
const BASE = "/api";

export const API = {
  // Dashboard
  stats: `${BASE}/stats`,

  // Cases / 用例
  cases: `${BASE}/cases`,
  case: (id: string) => `${BASE}/cases/${id}`,
  caseExecute: (id: string) => `${BASE}/cases/${id}/execute`,
  caseExecuteLocal: (id: string) => `${BASE}/cases/${id}/execute-local`,
  caseCancel: (id: string) => `${BASE}/cases/${id}/cancel`,
  caseBatchNotify: `${BASE}/cases/batch-notify`,

  // Executions / 执行
  executions: `${BASE}/executions`,
  execution: (id: string) => `${BASE}/executions/${id}`,
  executionLogs: (id: string) => `${BASE}/executions/${id}/logs`,
  executionLocalResult: (id: string) => `${BASE}/executions/${id}/local-result`,

  // Reports / 报告
  reports: `${BASE}/reports`,
  report: (id: string) => `${BASE}/reports/${id}`,

  // Elements / 元素库
  elements: `${BASE}/elements`,
  element: (id: string) => `${BASE}/elements/${id}`,
  elementsBatch: `${BASE}/elements/batch`,

  // Auto-detect / 自动识别
  autoDetect: {
    open: `${BASE}/auto-detect/open`,
    scan: (id: string) => `${BASE}/auto-detect/scan/${id}`,
    status: (id: string) => `${BASE}/auto-detect/status/${id}`,
    elements: (id: string) => `${BASE}/auto-detect/elements/${id}`,
    close: (id: string) => `${BASE}/auto-detect/close/${id}`,
  },

  // Recorder / 录制
  recorder: {
    visit: `${BASE}/recorder/visit`,
    start: (id: string) => `${BASE}/recorder/start/${id}`,
    pause: (id: string) => `${BASE}/recorder/pause/${id}`,
    resume: (id: string) => `${BASE}/recorder/resume/${id}`,
    events: (id: string) => `${BASE}/recorder/events/${id}`,
    snapshot: (id: string) => `${BASE}/recorder/snapshot/${id}`,
    inspect: (id: string) => `${BASE}/recorder/inspect/${id}`,
    action: (id: string) => `${BASE}/recorder/action/${id}`,
    stop: (id: string) => `${BASE}/recorder/stop/${id}`,
    close: (id: string) => `${BASE}/recorder/close/${id}`,
  },

  // Environments / 环境
  environments: `${BASE}/environments`,
  environment: (id: string) => `${BASE}/environments/${id}`,
  environmentsImportPostman: `${BASE}/environments/import/postman`,

  // Schedules / 定时调度
  schedules: `${BASE}/schedules`,
  schedule: (id: string) => `${BASE}/schedules/${id}`,
  scheduleToggle: (id: string) => `${BASE}/schedules/${id}/toggle`,
  scheduleRun: (id: string) => `${BASE}/schedules/${id}/run`,

  // Alerts / 告警
  alerts: `${BASE}/alerts`,
  alert: (id: string) => `${BASE}/alerts/${id}`,
  alertTest: (id: string) => `${BASE}/alerts/${id}/test`,

  // Settings / 系统设置
  settings: `${BASE}/settings`,
  settingsExport: `${BASE}/settings/export`,
  settingsImport: `${BASE}/settings/import`,
  modules: `${BASE}/modules`,
  module: (id: string) => `${BASE}/modules/${id}`,

  // API Testing / 接口测试
  apiTests: {
    cases: `${BASE}/api-tests/cases`,
    case: (id: string) => `${BASE}/api-tests/cases/${id}`,
    run: `${BASE}/api-tests/run`,
    executions: `${BASE}/api-tests/executions`,
    execution: (id: string) => `${BASE}/api-tests/executions/${id}`,
    importPostman: `${BASE}/api-tests/import/postman`,
    collections: `${BASE}/api-tests/collections`,
    collectionRun: `${BASE}/api-tests/collections/run`,
    collectionRuns: `${BASE}/api-tests/collection-runs`,
    collectionRunDetail: (id: string) => `${BASE}/api-tests/collection-runs/${id}`,
    collectionRunAllure: (id: string) => `${BASE}/api-tests/collection-runs/${id}/allure-report`,
  },

  performanceTests: {
    proxyPoolStatus: `${BASE}/performance-tests/proxy-pool/status`,
    scenarios: `${BASE}/performance-tests/scenarios`,
    scenario: (id: string) => `${BASE}/performance-tests/scenarios/${id}`,
    runScenario: (id: string) => `${BASE}/performance-tests/scenarios/${id}/run`,
    runs: `${BASE}/performance-tests/runs`,
    run: (id: string) => `${BASE}/performance-tests/runs/${id}`,
    progress: (id: string) => `${BASE}/performance-tests/runs/${id}/progress`,
    cancel: (id: string) => `${BASE}/performance-tests/runs/${id}/cancel`,
  },
} as const;

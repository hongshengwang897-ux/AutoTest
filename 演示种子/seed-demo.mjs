// 通过平台 API 创建「响应提取」演示种子数据（幂等：已存在则更新，不会碰其它数据）
// 前置：后端已启动（127.0.0.1:3001），mock 服务已启动（node mock-server.mjs）
const BASE = "http://127.0.0.1:3001/api";

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${options.method || "GET"} ${path} -> ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

const ENV_NAME = "[演示] 提取示例环境";
const CASE_NAME = "[演示] 响应提取示例";
const MOCK_URL = "http://127.0.0.1:9300";

// 1. 演示环境（scope=api，URL 指向 mock 服务）
const envList = await api("/environments");
let env = envList.items?.find((item) => item.name === ENV_NAME);
if (!env) {
  env = await api("/environments", {
    method: "POST",
    body: JSON.stringify({
      name: ENV_NAME,
      url: MOCK_URL,
      type: "dev",
      scope: "api",
      variables: { token: "", userName: "" },
      accounts: [],
      status: "online",
    }),
  });
  console.log("已创建演示环境:", env.name, "id=", env.id);
} else {
  console.log("演示环境已存在:", env.name, "id=", env.id);
}

// 2. 演示用例（相对 URL /login 使用环境 URL 作为 base；配置 3 条提取规则）
const caseList = await api("/api-tests/cases");
const existing = caseList.items?.find((item) => item.name === CASE_NAME);
const casePayload = {
  name: CASE_NAME,
  description: "演示：执行成功后自动提取 data.token / data.user.name → 接口环境；data.userId → 当前用例变量",
  method: "GET",
  url: "/login",
  headers: [],
  queryParams: [],
  bodyType: "none",
  body: "",
  assertions: [{ id: "demo-assert-1", source: "status", operator: "equals", target: "", expected: "200" }],
  variables: {},
  extractions: [
    { id: "demo-ext-1", variable: "token", path: "data.token", scope: "environment" },
    { id: "demo-ext-2", variable: "userName", path: "data.user.name", scope: "environment" },
    { id: "demo-ext-3", variable: "userId", path: "data.userId", scope: "case" },
  ],
  environmentId: env.id,
  group: "[演示]",
};
let demoCase;
if (existing) {
  demoCase = await api(`/api-tests/cases/${existing.id}`, {
    method: "PUT",
    body: JSON.stringify(casePayload),
  });
  console.log("已更新演示用例:", demoCase.name, "id=", demoCase.id);
} else {
  demoCase = await api("/api-tests/cases", { method: "POST", body: JSON.stringify(casePayload) });
  console.log("已创建演示用例:", demoCase.name, "id=", demoCase.id);
}

console.log("\n种子数据就绪：");
console.log("  mock 接口 :", `${MOCK_URL}/login`);
console.log("  演示环境  :", ENV_NAME);
console.log("  演示用例  :", CASE_NAME);
console.log("\n接下来：接口测试页 → 左侧分组 [演示] → 「响应提取示例」→ 点「发送」");
console.log("成功后会看到：环境变量 token=demo-token-abc123、userName=张三；用例变量 userId=42");

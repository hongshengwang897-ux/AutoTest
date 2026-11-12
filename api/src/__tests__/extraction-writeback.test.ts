import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// db.ts 在模块加载期就会打开真实 SQLite，单测中 mock 掉；get 返回固定行，update 记录调用
const updateCalls: Array<{ table: string; id: string; data: Record<string, unknown> }> = [];
vi.mock("../data/db.js", () => ({
  all: () => [],
  get: (_table: string, id: string) => {
    if (id === "env1") return { id: "env1", scope: "api", url: "http://127.0.0.1:9999", variables: { existing: "old" } };
    if (id === "case1") return { id: "case1", variables: {} };
    return null;
  },
  insert: () => {},
  update: (table: string, id: string, data: Record<string, unknown>) => { updateCalls.push({ table, id, data }); return true; },
  remove: () => false,
  query: () => [],
  exec: () => 0,
  createId: () => "fixed-id",
  now: () => "2026-01-01T00:00:00.000Z",
}));
import { runApiTest } from "../api-test-runner.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("runApiTest 响应提取写回", () => {
  beforeEach(() => { updateCalls.length = 0; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("执行成功后把提取值合并写入环境与用例变量", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ data: { token: "abc", user: { id: 7 } } }));
    const result = await runApiTest({
      id: "case1",
      name: "登录",
      method: "GET",
      url: "/login",
      environmentId: "env1",
      extractions: [
        { variable: "token", path: "data.token", scope: "environment" },
        { variable: "userId", path: "data.user.id", scope: "case" },
      ],
    });
    expect(result.status).toBe("success");
    // 环境变量：保留已有 existing，合并新增 token
    const envUpdate = updateCalls.find((c) => c.table === "environments");
    expect(envUpdate).toBeTruthy();
    expect(envUpdate!.id).toBe("env1");
    expect(JSON.parse(String(envUpdate!.data.variables))).toEqual({ existing: "old", token: "abc" });
    // 用例变量：写入 userId
    const caseUpdate = updateCalls.find((c) => c.table === "api_cases");
    expect(caseUpdate).toBeTruthy();
    expect(caseUpdate!.id).toBe("case1");
    expect(JSON.parse(String(caseUpdate!.data.variables))).toEqual({ userId: "7" });
  });

  it("断言失败时不写回环境变量", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ data: { token: "abc" } }, 500));
    const result = await runApiTest({
      id: "case1",
      name: "登录",
      method: "GET",
      url: "/login",
      environmentId: "env1",
      assertions: [{ source: "status", operator: "equals", expected: "200" }],
      extractions: [{ variable: "token", path: "data.token", scope: "environment" }],
    });
    expect(result.status).toBe("failed");
    expect(updateCalls.filter((c) => c.table === "environments")).toHaveLength(0);
  });

  it("未选择环境时 environment 作用域提取被跳过（不抛错）", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ data: { token: "abc" } }));
    const result = await runApiTest({
      id: "case1",
      name: "登录",
      method: "GET",
      url: "http://127.0.0.1:9999/login",
      extractions: [{ variable: "token", path: "data.token", scope: "environment" }],
    });
    expect(result.status).toBe("success");
    expect(updateCalls.filter((c) => c.table === "environments")).toHaveLength(0);
  });
});

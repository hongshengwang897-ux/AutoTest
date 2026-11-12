import { describe, it, expect, vi } from "vitest";
// db.ts 在模块加载期就会打开真实 SQLite（建表 + 迁移），单测中 mock 掉，避免测试触碰真实数据库
vi.mock("../data/db.js", () => ({
  all: () => [],
  get: () => null,
  insert: () => {},
  update: () => true,
  remove: () => false,
  query: () => [],
  exec: () => 0,
  createId: () => "test-id",
  now: () => "2026-01-01T00:00:00.000Z",
}));
import { resolveExtractions } from "../api-test-runner.js";

describe("resolveExtractions", () => {
  const body = { data: { token: "abc", code: 200, empty: "", user: { id: 1, name: "x" }, list: [1, 2, 3], nil: null } };

  it("按点分路径提取标量值（data.token 与 $.data.token 均可）", () => {
    expect(resolveExtractions(body, [{ variable: "token", path: "data.token", scope: "case" }], {}))
      .toEqual([{ variable: "token", scope: "case", value: "abc" }]);
    expect(resolveExtractions(body, [{ variable: "token", path: "$.data.token", scope: "environment" }], {}))
      .toEqual([{ variable: "token", scope: "environment", value: "abc" }]);
  });

  it("path 中的 {{变量}} 先经 renderTemplate 渲染", () => {
    expect(resolveExtractions(body, [{ variable: "t", path: "data.{{field}}", scope: "case" }], { field: "token" }))
      .toEqual([{ variable: "t", scope: "case", value: "abc" }]);
  });

  it("数字转为字符串，空字符串保留", () => {
    expect(resolveExtractions(body, [{ variable: "code", path: "data.code", scope: "case" }], {}))
      .toEqual([{ variable: "code", scope: "case", value: "200" }]);
    expect(resolveExtractions(body, [{ variable: "empty", path: "data.empty", scope: "case" }], {}))
      .toEqual([{ variable: "empty", scope: "case", value: "" }]);
  });

  it("对象/数组序列化为 JSON 字符串", () => {
    expect(resolveExtractions(body, [{ variable: "user", path: "data.user", scope: "case" }], {}))
      .toEqual([{ variable: "user", scope: "case", value: '{"id":1,"name":"x"}' }]);
    expect(resolveExtractions(body, [{ variable: "list", path: "data.list", scope: "case" }], {}))
      .toEqual([{ variable: "list", scope: "case", value: "[1,2,3]" }]);
  });

  it("undefined/null 跳过，避免覆盖已有值", () => {
    expect(resolveExtractions(body, [{ variable: "missing", path: "data.missing", scope: "case" }], {})).toEqual([]);
    expect(resolveExtractions(body, [{ variable: "nil", path: "data.nil", scope: "case" }], {})).toEqual([]);
  });

  it("空变量名跳过", () => {
    expect(resolveExtractions(body, [{ variable: "", path: "data.token", scope: "case" }], {})).toEqual([]);
  });

  it("scope 缺失/非法回退为 case", () => {
    expect(resolveExtractions(body, [{ variable: "t", path: "data.token" } as any, { variable: "t2", path: "data.token", scope: "invalid" as any }], {}))
      .toEqual([
        { variable: "t", scope: "case", value: "abc" },
        { variable: "t2", scope: "case", value: "abc" },
      ]);
  });

  it("无提取规则或 undefined 时返回空数组", () => {
    expect(resolveExtractions(body, undefined, {})).toEqual([]);
    expect(resolveExtractions(body, [], {})).toEqual([]);
  });

  it("jsonBody 为 undefined 时全部跳过", () => {
    expect(resolveExtractions(undefined, [{ variable: "t", path: "data.token", scope: "case" }], {})).toEqual([]);
  });
});

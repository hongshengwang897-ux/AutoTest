import { describe, it, expect } from "vitest";
import { isPostmanEnvironment, parsePostmanEnvironment } from "../postman-import.js";

describe("parsePostmanEnvironment", () => {
  it("解析单个环境，仅取已启用变量并猜测 URL", () => {
    const env = {
      id: "env_1",
      name: "开发环境",
      values: [
        { key: "baseUrl", value: "https://dev.example.com", enabled: true },
        { key: "token", value: "abc", enabled: true },
        { key: "secret", value: "hidden", enabled: false },
        { key: "", value: "empty-key", enabled: true },
      ],
      _postman_variable_scope: "environment",
    };
    const parsed = parsePostmanEnvironment(env);
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe("开发环境");
    expect(parsed!.url).toBe("https://dev.example.com");
    expect(parsed!.variables).toEqual({ baseUrl: "https://dev.example.com", token: "abc" });
    expect(parsed!.enabledCount).toBe(2);
    expect(parsed!.skippedCount).toBe(1); // 仅禁用变量计入；空 key 项在过滤时被忽略
  });

  it("无匹配 url/host/gateway/base 键时 url 为空", () => {
    const parsed = parsePostmanEnvironment({ name: "x", values: [{ key: "host", value: "example.com" }] });
    expect(parsed!.url).toBe("");
  });

  it("非环境对象返回 null", () => {
    expect(parsePostmanEnvironment(null)).toBeNull();
    expect(parsePostmanEnvironment({ info: { name: "col" }, item: [] })).toBeNull();
    expect(parsePostmanEnvironment([])).toBeNull();
  });
});

describe("isPostmanEnvironment", () => {
  it("识别带 values 的环境对象（带标记或无 info）", () => {
    expect(isPostmanEnvironment({ name: "e", values: [], _postman_variable_scope: "environment" })).toBe(true);
    expect(isPostmanEnvironment({ name: "e", values: [] })).toBe(true);
  });

  it("不识别 Collection 与数组/空值", () => {
    expect(isPostmanEnvironment({ info: { name: "c" }, item: [], values: [] })).toBe(false);
    expect(isPostmanEnvironment([])).toBe(false);
    expect(isPostmanEnvironment(null)).toBe(false);
  });
});

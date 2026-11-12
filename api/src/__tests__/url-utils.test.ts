import { describe, it, expect } from "vitest";
import { maskReportUrl } from "../url-utils.js";

describe("maskReportUrl", () => {
  it("将 token/secret/password 等敏感查询参数替换为 ********", () => {
    expect(maskReportUrl("https://a.com/path?token=abc&page=2&password=x"))
      .toBe("https://a.com/path?token=********&page=2&password=********");
  });

  it("非敏感参数保持原样", () => {
    expect(maskReportUrl("https://a.com/?page=2")).toBe("https://a.com/?page=2");
  });

  it("非法 URL 与空值原样返回", () => {
    expect(maskReportUrl("not a url")).toBe("not a url");
    expect(maskReportUrl("")).toBe("");
  });
});

import { describe, it, expect } from "vitest";
import { clampDelayMs } from "../execution-engine.js";

describe("clampDelayMs（execution.*_delay_ms 设置读取的防脏配置 clamp）", () => {
  it("空值/非法值回退默认值", () => {
    expect(clampDelayMs(undefined, 300)).toBe(300);
    expect(clampDelayMs(null, 3000)).toBe(3000);
    expect(clampDelayMs("", 4000)).toBe(4000);
    expect(clampDelayMs("abc", 300)).toBe(300);
  });

  it("数值 clamp 到 0~10000 并四舍五入", () => {
    expect(clampDelayMs(-5, 300)).toBe(0);
    expect(clampDelayMs(20000, 300)).toBe(10000);
    expect(clampDelayMs(42.6, 300)).toBe(43);
    expect(clampDelayMs(500, 300)).toBe(500);
    expect(clampDelayMs("750", 300)).toBe(750);
  });
});

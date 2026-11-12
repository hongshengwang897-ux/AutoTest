/**
 * 分页参数安全解析：非法/缺失值回落到默认值，避免 parseInt(NaN) 导致 slice(NaN) 返回空列表
 */
export function safePage(value: unknown, fallback = 1): number {
  const n = typeof value === "string" ? parseInt(value, 10) : Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

export function safeLimit(value: unknown, fallback = 20, max = 200): number {
  const n = typeof value === "string" ? parseInt(value, 10) : Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

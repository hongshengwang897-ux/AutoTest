import { createHmac } from "node:crypto";
import { all, query } from "./data/db.js";

/**
 * 钉钉「加签」安全模式：把 timestamp + sign 追加到 webhook URL 查询串。
 * 签名算法（经钉钉真实 API 验证，勿改成常见博客的「key=stringToSign」变体）：
 *   stringToSign = `${timestamp}\n${secret}`（timestamp 为毫秒）
 *   sign = urlencode(base64(HMAC-SHA256(key=secret, message=stringToSign)))
 */
function dingtalkSignedUrl(target: string, secret?: string): string {
  if (!secret) return target;
  const timestamp = Date.now().toString();
  const stringToSign = `${timestamp}\n${secret}`;
  const sign = encodeURIComponent(createHmac("sha256", secret).update(stringToSign).digest("base64"));
  const sep = target.includes("?") ? "&" : "?";
  return `${target}${sep}timestamp=${timestamp}&sign=${sign}`;
}

/** 校验 webhook 响应：钉钉/飞书业务失败仍返回 HTTP 200，错误码在 body 里（errcode/code），必须显式检查否则拒收被当成成功 */
function assertDeliveryOk(channel: string, response: Response, body: string): void {
  if (channel === "dingtalk" || channel === "feishu") {
    let payload: Record<string, any> | null = null;
    try { payload = JSON.parse(body); } catch { /* 非 JSON，走 HTTP 状态判断 */ }
    if (payload && typeof payload === "object") {
      if (channel === "dingtalk" && payload.errcode !== undefined && Number(payload.errcode) !== 0) {
        throw new Error(`钉钉返回业务错误 errcode=${payload.errcode}: ${String(payload.errmsg || "").slice(0, 200)}`);
      }
      if (channel === "feishu" && payload.code !== undefined && Number(payload.code) !== 0) {
        throw new Error(`飞书返回业务错误 code=${payload.code}: ${String(payload.msg || "").slice(0, 200)}`);
      }
    }
  }
  if (!response.ok) throw new Error(`Webhook 返回 HTTP ${response.status}: ${body.slice(0, 200)}`);
}

export async function sendAlert(item: Record<string, any>, text: string): Promise<void> {
  const channel = String(item.channel || "");
  const target = String(item.webhook_url || item.webhookUrl || "").trim();
  if (channel === "email") throw new Error("邮件通道尚未配置 SMTP 服务");
  if (!/^https?:\/\//i.test(target)) throw new Error("Webhook URL 无效");

  // config 可能来自 DB 展开后的对象，也可能来自路由 POST 的原始字符串，防御性解析
  const rawConfig = item.config;
  const config = typeof rawConfig === "string"
    ? (() => { try { return JSON.parse(rawConfig); } catch { return {}; } })()
    : (rawConfig || {});
  const url = channel === "dingtalk" ? dingtalkSignedUrl(target, config.secret) : target;

  const body = channel === "dingtalk"
    ? { msgtype: "text", text: { content: text } }
    : channel === "feishu"
      ? { msg_type: "text", content: { text } }
      : { text, event: "execution" };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const responseText = await response.text();
  assertDeliveryOk(channel, response, responseText);
}

function readNotifications(): Record<string, boolean> {
  const row = query("SELECT value FROM settings WHERE key = ?", "notifications")[0];
  if (!row) return { executionComplete: true, failureOnly: false, systemAlerts: true };
  try { return JSON.parse(row.value); } catch { return { executionComplete: true, failureOnly: false, systemAlerts: true }; }
}

/** 模板变量替换：把 {{token}} 全部替换为对应值 */
export function renderTemplate(template: string, replacements: Record<string, string>): string {
  let message = template;
  for (const [token, value] of Object.entries(replacements)) message = message.split(token).join(value);
  return message;
}

/** 测试消息渲染：仅用「测试消息模板」，只在手动发送测试消息时使用，不用于执行结果推送 */
export function renderTestMessage(item: Record<string, any>): string {
  const template = String(item.test_template || item.testTemplate || "【AutoTest 测试消息】告警通道「{{name}}」连接成功");
  return renderTemplate(template, {
    "{{name}}": String(item.name || ""),
    "{{channel}}": String(item.channel || ""),
    "{{time}}": new Date().toLocaleString("zh-CN"),
  });
}

const MODULE_LABELS: Record<string, string> = { ui: "UI", api: "接口", performance: "性能" };

export async function deliverExecutionAlerts(
  module: string,
  caseName: string,
  status: string,
  errorMessage?: string,
  counts?: { total: number; pass: number; fail: number },
): Promise<void> {
  const preferences = readNotifications();
  const level = status === "success" ? "success" : status === "timeout" ? "timeout" : "failed";

  const channels = all("alerts").filter((item) => {
    if (!item.enabled) return false;
    // 模块过滤：勾选了哪个模块，只有该模块执行完成才用此通道；未配置 modules 时按历史行为视为 UI
    const modules = Array.isArray(item.modules) && item.modules.length > 0 ? item.modules : ["ui"];
    if (!modules.includes(module)) return false;
    const levels = Array.isArray(item.notify_levels) ? item.notify_levels : [];
    // 「执行完毕」级别：通道无条件通知（无论成败，执行结束即发），不受全局开关限制
    if (levels.includes("completed")) return true;
    if (status === "success" && (!preferences.executionComplete || preferences.failureOnly)) return false;
    if (status !== "success" && preferences.systemAlerts === false) return false;
    return levels.includes(level);
  });

  await Promise.allSettled(channels.map(async (item) => {
    const template = String(item.template || "【自动化通知】用例「{{caseName}}」执行状态：{{status}} {{errorMessage}}");
    const message = renderTemplate(template, {
      "{{module}}": MODULE_LABELS[module] || module,
      "{{caseName}}": caseName,
      "{{status}}": status,
      "{{errorMessage}}": errorMessage || "",
      "{{total}}": counts ? String(counts.total) : "1",
      "{{pass}}": counts ? String(counts.pass) : (status === "success" ? "1" : "0"),
      "{{fail}}": counts ? String(counts.fail) : (status === "success" ? "0" : "1"),
    });
    try {
      await sendAlert(item, message);
    } catch (error) {
      console.error(`[Alert] ${item.name}:`, error instanceof Error ? error.message : error);
    }
  }));
}

import type { ApiAssertion, KeyValueItem } from "./api-test-runner.js";

export interface ImportedPostmanCase {
  name: string;
  description: string;
  method: string;
  url: string;
  headers: KeyValueItem[];
  queryParams: KeyValueItem[];
  bodyType: "none" | "json" | "text" | "form";
  body: string;
  assertions: ApiAssertion[];
  variables: Record<string, string>;
  environmentId: string;
  group: string;
}

export interface PostmanImportResult {
  collectionName: string;
  cases: ImportedPostmanCase[];
  skipped: number;
  warnings: string[];
}

let itemCounter = 0;
const id = (prefix: string) => `${prefix}_${Date.now()}_${++itemCounter}`;

function descriptionText(description: unknown): string {
  if (typeof description === "string") return description;
  if (description && typeof description === "object" && "content" in description) {
    return String((description as { content?: unknown }).content || "");
  }
  return "";
}

function variableMap(items: any): Record<string, string> {
  if (!Array.isArray(items)) return {};
  return Object.fromEntries(
    items
      .filter((item) => item && item.disabled !== true && String(item.key || item.id || "").trim())
      .map((item) => [String(item.key || item.id), String(item.value ?? "")])
  );
}

function keyValues(items: any): KeyValueItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    id: id("postman-kv"),
    key: String(item?.key || ""),
    value: String(item?.value ?? ""),
    enabled: item?.disabled !== true,
  }));
}

function requestUrl(url: any): { url: string; queryParams: KeyValueItem[] } {
  if (typeof url === "string") return { url, queryParams: [] };
  if (!url || typeof url !== "object") return { url: "", queryParams: [] };
  const queryParams = keyValues(url.query);
  let raw = String(url.raw || "");
  if (!raw) {
    const protocol = url.protocol ? `${url.protocol}://` : "";
    const host = Array.isArray(url.host) ? url.host.join(".") : String(url.host || "");
    const path = Array.isArray(url.path)
      ? url.path.map((part: any) => typeof part === "string" ? part : String(part?.value || "")).join("/")
      : String(url.path || "");
    raw = `${protocol}${host}${path ? `/${path.replace(/^\//, "")}` : ""}`;
  }
  if (queryParams.length > 0 && raw.includes("?")) raw = raw.slice(0, raw.indexOf("?"));
  return { url: raw, queryParams };
}

function authValue(auth: any, type: string, key: string): string {
  const entries = Array.isArray(auth?.[type]) ? auth[type] : [];
  return String(entries.find((entry: any) => entry?.key === key)?.value ?? "");
}

function applyAuth(auth: any, headers: KeyValueItem[], queryParams: KeyValueItem[], warnings: string[], name: string) {
  if (!auth || auth.type === "noauth") return;
  if (auth.type === "bearer" || auth.type === "oauth2") {
    const token = authValue(auth, auth.type, "token") || authValue(auth, auth.type, "accessToken");
    if (token && !headers.some((item) => item.key.toLowerCase() === "authorization")) {
      headers.push({ id: id("postman-auth"), key: "Authorization", value: `Bearer ${token}`, enabled: true });
    }
    return;
  }
  if (auth.type === "apikey") {
    const key = authValue(auth, "apikey", "key");
    const value = authValue(auth, "apikey", "value");
    const location = authValue(auth, "apikey", "in");
    if (key) (location === "query" ? queryParams : headers).push({ id: id("postman-auth"), key, value, enabled: true });
    return;
  }
  if (auth.type === "basic") {
    const username = authValue(auth, "basic", "username");
    const password = authValue(auth, "basic", "password");
    if (username.includes("{{") || password.includes("{{")) {
      warnings.push(`${name}: Basic Auth 使用变量，已跳过认证头，请在导入后配置`);
    } else {
      headers.push({ id: id("postman-auth"), key: "Authorization", value: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`, enabled: true });
    }
    return;
  }
  warnings.push(`${name}: 暂不支持 Postman 认证类型 ${auth.type}`);
}

function bodyDefinition(body: any, warnings: string[], name: string): Pick<ImportedPostmanCase, "bodyType" | "body"> {
  if (!body || body.mode === "none") return { bodyType: "none", body: "" };
  if (body.mode === "raw") {
    const language = String(body.options?.raw?.language || "").toLowerCase();
    return { bodyType: language === "json" ? "json" : "text", body: String(body.raw || "") };
  }
  if (body.mode === "urlencoded") {
    const values = keyValues(body.urlencoded).filter((item) => item.enabled && item.key);
    return { bodyType: "form", body: new URLSearchParams(values.map((item) => [item.key, item.value])).toString() };
  }
  if (body.mode === "formdata") {
    const textFields = (Array.isArray(body.formdata) ? body.formdata : []).filter((item: any) => item?.disabled !== true && item?.type !== "file" && item?.key);
    const fileFields = (Array.isArray(body.formdata) ? body.formdata : []).filter((item: any) => item?.disabled !== true && item?.type === "file");
    if (fileFields.length) warnings.push(`${name}: ${fileFields.length} 个文件字段无法从 Collection JSON 还原，已跳过`);
    return { bodyType: "form", body: new URLSearchParams(textFields.map((item: any) => [String(item.key), String(item.value ?? "")])).toString() };
  }
  if (body.mode === "graphql") {
    return { bodyType: "json", body: JSON.stringify({ query: body.graphql?.query || "", variables: body.graphql?.variables || "" }, null, 2) };
  }
  warnings.push(`${name}: 暂不支持 Body 模式 ${body.mode}`);
  return { bodyType: "none", body: "" };
}

function assertionsFromEvents(events: any[]): ApiAssertion[] {
  const source = events
    .filter((event) => event?.listen === "test")
    .flatMap((event) => Array.isArray(event?.script?.exec) ? event.script.exec : [])
    .join("\n");
  const assertions: ApiAssertion[] = [];
  const statuses = new Set<string>();
  for (const pattern of [
    /pm\.response\.to\.have\.status\s*\(\s*(\d+)\s*\)/g,
    /pm\.expect\s*\(\s*pm\.response\.code\s*\)\.to\.(?:eql|equal)\s*\(\s*(\d+)\s*\)/g,
  ]) {
    for (const match of source.matchAll(pattern)) statuses.add(match[1]);
  }
  for (const status of statuses) assertions.push({ id: id("postman-assert"), source: "status", operator: "equals", target: "", expected: status });

  const contains = /pm\.expect\s*\(\s*pm\.response\.text\s*\(\s*\)\s*\)\.to\.(?:include|contain)\s*\(\s*(['"])(.*?)\1\s*\)/g;
  for (const match of source.matchAll(contains)) {
    assertions.push({ id: id("postman-assert"), source: "body", operator: "contains", target: "", expected: match[2] });
  }
  return assertions;
}

export function parsePostmanCollection(collection: any): PostmanImportResult {
  if (!collection || typeof collection !== "object" || !collection.info || !Array.isArray(collection.item)) {
    throw new Error("不是有效的 Postman Collection JSON");
  }
  const schema = String(collection.info.schema || "");
  if (schema && !schema.includes("collection/v2.")) throw new Error("仅支持 Postman Collection v2.0/v2.1");

  itemCounter = 0;
  const collectionName = String(collection.info.name || "Postman Collection");
  const collectionVariables = variableMap(collection.variable);
  const collectionEvents = Array.isArray(collection.event) ? collection.event : [];
  const warnings: string[] = [];
  const cases: ImportedPostmanCase[] = [];
  let skipped = 0;

  function visit(items: any[], folders: string[], inheritedAuth: any, inheritedEvents: any[], inheritedVariables: Record<string, string>) {
    for (const item of items) {
      if (Array.isArray(item?.item)) {
        visit(
          item.item,
          [...folders, String(item.name || "未命名文件夹")],
          item.auth === undefined ? inheritedAuth : item.auth,
          [...inheritedEvents, ...(Array.isArray(item.event) ? item.event : [])],
          { ...inheritedVariables, ...variableMap(item.variable) }
        );
        continue;
      }
      if (!item?.request) { skipped++; continue; }
      const request = typeof item.request === "string" ? { url: item.request, method: "GET" } : item.request;
      const name = String(item.name || request.name || "未命名接口");
      const parsedUrl = requestUrl(request.url);
      if (!parsedUrl.url.trim()) { warnings.push(`${name}: URL 为空，已跳过`); skipped++; continue; }
      const headers = keyValues(request.header);
      const queryParams = parsedUrl.queryParams;
      const auth = request.auth === undefined ? inheritedAuth : request.auth;
      applyAuth(auth, headers, queryParams, warnings, name);
      const body = bodyDefinition(request.body, warnings, name);
      const events = [...inheritedEvents, ...(Array.isArray(item.event) ? item.event : [])];
      const assertions = assertionsFromEvents(events);
      cases.push({
        name,
        description: descriptionText(request.description || item.description),
        method: String(request.method || "GET").toUpperCase(),
        url: parsedUrl.url,
        headers,
        queryParams,
        ...body,
        assertions: assertions.length ? assertions : [{ id: id("postman-assert"), source: "status", operator: "equals", target: "", expected: "200" }],
        variables: { ...collectionVariables, ...inheritedVariables, ...variableMap(item.variable) },
        environmentId: "",
        group: folders.length ? folders.join(" / ") : collectionName,
      });
    }
  }

  visit(collection.item, [], collection.auth, collectionEvents, {});
  return { collectionName, cases, skipped, warnings };
}

// ---- Postman 环境导出解析（单环境对象 / 多环境数组共用） ----

export interface ParsedPostmanEnvironment {
  name: string;
  url: string;
  variables: Record<string, string>;
  /** 已启用变量数（会导入） */
  enabledCount: number;
  /** 已禁用/空 key 变量数（不导入） */
  skippedCount: number;
}

/**
 * 判断一个文档是否为 Postman 环境导出：
 * 环境必须有 values 数组，且带 _postman_variable_scope 标记或无 info（区别于 Collection）。
 */
export function isPostmanEnvironment(document: unknown): boolean {
  return Boolean(
    document
    && typeof document === "object"
    && !Array.isArray(document)
    && Array.isArray((document as any).values)
    && ((document as any)._postman_variable_scope === "environment" || !(document as any).info)
  );
}

/**
 * 解析单个 Postman 环境对象 → 平台环境字段。
 * 非环境对象返回 null。变量仅取已启用项，URL 从 url/host/gateway/base 开头的 https 值猜测。
 */
export function parsePostmanEnvironment(env: any, fallbackName = "Postman 环境"): ParsedPostmanEnvironment | null {
  if (!env || typeof env !== "object" || !Array.isArray(env.values)) return null;
  const values = env.values.filter((item: any) => item && String(item.key || "").trim());
  const enabledValues = values.filter((item: any) => item.enabled !== false);
  const variables = Object.fromEntries(enabledValues.map((item: any) => [String(item.key), String(item.value ?? "")]));
  const urlCandidate = enabledValues.find((item: any) =>
    /^https?:\/\//i.test(String(item.value || ""))
    && /(?:url|host|gateway|base)/i.test(String(item.key || ""))
  );
  const name = String(env.name || fallbackName).trim();
  return {
    name,
    url: String(urlCandidate?.value || ""),
    variables,
    enabledCount: enabledValues.length,
    skippedCount: values.length - enabledValues.length,
  };
}

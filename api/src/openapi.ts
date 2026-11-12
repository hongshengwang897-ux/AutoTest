import type { Request, Response } from "express";

interface OpenApiOperation {
  summary?: string;
  tags?: string[];
  responses: Record<string, { description: string }>;
}

interface OpenApiPathItem {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  delete?: OpenApiOperation;
  patch?: OpenApiOperation;
}

interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: { url: string }[];
  paths: Record<string, OpenApiPathItem>;
}

export function registerOpenApiDocs(app: any): void {
  const spec = buildSpec(app);
  app.get("/api/docs/openapi.json", (_req: Request, res: Response) => {
    res.json(spec);
  });
  app.get("/api/openapi.json", (_req: Request, res: Response) => {
    res.json(spec);
  });
  app.get("/api/docs", (_req: Request, res: Response) => {
    res.type("text/html").send(renderSwaggerUI(spec));
  });
}

function buildSpec(app: any): OpenApiSpec {
  const spec: OpenApiSpec = {
    openapi: "3.0.3",
    info: { title: "AutoTest API", version: "1.0.0", description: "自动化测试管理平台 API 文档" },
    servers: [{ url: "" }],
    paths: {},
  };

  const stack = app._router?.stack || [];

  function isRouter(obj: any): boolean {
    return obj && (obj.stack || obj._router?.stack);
  }

  function getRouterStack(obj: any): any[] {
    return obj.stack || obj._router?.stack || [];
  }

  function getMountPath(layer: any): string {
    if (layer.path) return layer.path;
    const src = layer.regexp?.source;
    if (!src) return "";
    // src = "^\\/api\\/auth\\/(?=\\/$)" — strip anchors, lookahead, unescape slashes
    let path = src
      .replace(/^\^/, "")
      .replace(/\$$/, "")
      .replace(/\(\?=.+$/, "")
      .replace(/\\\//g, "/");
    path = path.replace(/\/\?$/, ""); // strip optional trailing slash marker
    return path;
  }

  function normalizePath(path: string): string {
    return path.length > 1 ? path.replace(/\/+$/, "") : "/";
  }

  function addRoute(path: string, methods: Record<string, unknown>, extraResponses: boolean): void {
    if (!path) return;
    const p = normalizePath(path);
    Object.keys(methods).forEach((method) => {
      const key = method.toLowerCase();
      if (!["get", "post", "put", "delete", "patch"].includes(key)) return;
      if (!spec.paths[p]) spec.paths[p] = {};
      const responses: Record<string, { description: string }> = {
        "200": { description: "成功" },
        "401": { description: "未认证" },
        "500": { description: "服务器错误" },
      };
      if (!extraResponses) {
        delete responses["401"];
      }
      (spec.paths[p] as Record<string, OpenApiOperation>)[key] = {
        summary: inferSummary(key, p),
        tags: extractTags(p),
        responses,
      };
    });
  }

  for (const layer of stack) {
    if (!layer.route && layer.handle && isRouter(layer.handle)) {
      const prefix = getMountPath(layer);
      const subStack = getRouterStack(layer.handle);
      for (const subLayer of subStack) {
        if (isRouter(subLayer.handle)) {
          const nestedStack = getRouterStack(subLayer.handle);
          const nestedPrefix = prefix + getMountPath(subLayer);
          for (const nLayer of nestedStack) {
            if (nLayer.route) {
              addRoute(nestedPrefix + (nLayer.route.path || ""), nLayer.route.methods || {}, true);
            }
          }
        } else if (subLayer.route) {
          addRoute(prefix + (subLayer.route.path || ""), subLayer.route.methods || {}, true);
        }
      }
    } else if (layer.route) {
      addRoute(layer.route.path || getMountPath(layer), layer.route.methods || {}, false);
    }
  }
  return spec;
}

function inferSummary(method: string, path: string): string {
  const cleanPath = path.replace(/:\w+/g, "{id}");
  if (method === "get") return `获取${cleanPath}列表`;
  if (method === "post") return `创建${cleanPath}`;
  if (method === "put") return `更新${cleanPath}`;
  if (method === "patch") return `部分更新${cleanPath}`;
  if (method === "delete") return `删除${cleanPath}`;
  return `${method.toUpperCase()} ${cleanPath}`;
}

function extractTags(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  const resource = segments[1] || "其他";
  const tagMap: Record<string, string> = {
    cases: "UI 用例", executions: "执行记录", reports: "报告", elements: "元素库",
    environments: "环境管理", schedules: "定时调度", alerts: "告警", stats: "统计",
    settings: "系统设置", recorder: "录制", modules: "模块", "api-tests": "接口测试",
    "performance-tests": "性能测试", security: "安全", auth: "认证", "auto-detect": "自动检测",
    campaigns: "测试计划",
  };
  return [tagMap[resource] || resource];
}

function renderSwaggerUI(spec: OpenApiSpec): string {
  const specJson = JSON.stringify(spec);
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>AutoTest API 文档</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
<style>body{margin:0;padding:16px;background:#f5f5f5}#swagger{max-width:1200px;margin:0 auto}</style>
</head><body><div id="swagger"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
const spec=${specJson};
SwaggerUIBundle({dom_id:'#swagger',spec,presets:[SwaggerUIBundle.presets.apis,SwaggerUIBundle.SwaggerUIStandalonePreset],layout:'BaseLayout',persistAuthorization:true});
</script></body></html>`;
}
/**
 * 统一 HTTP 请求封装
 *
 * - 统一错误处理和响应格式
 * - 支持 GET/POST/PUT/DELETE + 文件上传
 */

// ---- 基础请求 ----

interface RequestOptions {
  /** 自定义超时 (ms)，默认 15000 */
  timeout?: number;
  /** 响应类型 */
  responseType?: "json" | "text" | "blob";
  /** 额外的 headers */
  headers?: Record<string, string>;
  /** URL 查询参数 */
  params?: Record<string, string | number | undefined>;
}

export interface ApiResponse<T = any> {
  ok: boolean;
  data: T;
  error?: string;
  status: number;
}

async function request<T = any>(
  method: string,
  url: string,
  body?: any,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const {
    timeout = 15000,
    responseType = "json",
    headers: extraHeaders = {},
    params,
  } = options;

  // Build URL with query params
  let fullUrl = url;
  if (params) {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") search.set(k, String(v));
    }
    const qs = search.toString();
    if (qs) fullUrl += (url.includes("?") ? "&" : "?") + qs;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const reqHeaders: Record<string, string> = { ...extraHeaders };

  if (body && !(body instanceof FormData)) {
    reqHeaders["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(fullUrl, {
      method,
      headers: reqHeaders,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);

    let data: any = null;
    if (responseType === "json") {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } else if (responseType === "text") {
      data = await res.text();
    } else if (responseType === "blob") {
      data = await res.blob();
    }

    if (!res.ok) {
      return {
        ok: false,
        data: null as T,
        error: data?.error || data?.message || `HTTP ${res.status}`,
        status: res.status,
      };
    }

    return { ok: true, data: data as T, status: res.status };
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      return { ok: false, data: null as T, error: "请求超时", status: 0 };
    }
    return { ok: false, data: null as T, error: err.message || "网络错误", status: 0 };
  }
}

// ---- 便捷方法 ----

export function get<T = any>(url: string, options?: RequestOptions): Promise<ApiResponse<T>> {
  return request<T>("GET", url, undefined, options);
}

export function post<T = any>(
  url: string,
  body?: any,
  options?: RequestOptions
): Promise<ApiResponse<T>> {
  return request<T>("POST", url, body, options);
}

export function put<T = any>(
  url: string,
  body?: any,
  options?: RequestOptions
): Promise<ApiResponse<T>> {
  return request<T>("PUT", url, body, options);
}

export function del<T = any>(url: string, options?: RequestOptions): Promise<ApiResponse<T>> {
  return request<T>("DELETE", url, undefined, options);
}

export function upload<T = any>(
  url: string,
  formData: FormData,
  options?: RequestOptions
): Promise<ApiResponse<T>> {
  return request<T>("POST", url, formData, { ...options, timeout: 60000 });
}

export default { get, post, put, del, upload };

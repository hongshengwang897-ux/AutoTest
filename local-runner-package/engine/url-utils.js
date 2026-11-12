/**
 * 共享 URL 工具 — 供 api-collection-runner / performance-runner 等报告模块复用
 */
/** 报告展示用 URL 脱敏：将 token/secret/password 等敏感查询参数替换为 ******** */
export function maskReportUrl(value) {
    const text = String(value || "");
    try {
        const url = new URL(text);
        for (const name of [...url.searchParams.keys()]) {
            if (/(?:token|secret|password|pass|key|auth|credential)/i.test(name))
                url.searchParams.set(name, "********");
        }
        return url.toString();
    }
    catch {
        return text;
    }
}
//# sourceMappingURL=url-utils.js.map
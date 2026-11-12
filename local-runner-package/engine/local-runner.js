import express from "express";
import cors from "cors";
import { hostname } from "node:os";
import { executeCase } from "./execution-engine.js";
process.env.AUTOTEST_LOCAL_RUNNER = "1";
const PORT = Number(process.env.AUTOTEST_RUNNER_PORT || 3210);
const RUNNER_NAME = process.env.AUTOTEST_RUNNER_NAME || hostname();
const allowedOrigins = new Set((process.env.AUTOTEST_ALLOWED_ORIGINS || "http://172.16.18.100:5173,http://127.0.0.1:5173,http://localhost:5173")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean));
const activeJobs = new Map();
const app = express();
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin))
            callback(null, true);
        else
            callback(new Error("该平台地址未获本地执行器授权"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
}));
app.use(express.json({ limit: "25mb" }));
app.get("/health", (_req, res) => {
    res.json({ status: "ready", runnerName: RUNNER_NAME, busy: activeJobs.size > 0, version: "1.0.0" });
});
app.post("/execute", async (req, res) => {
    const job = req.body;
    if (!job?.executionId || !job.token || !job.script || !job.reportUrl) {
        res.status(400).json({ error: "本地执行任务格式无效" });
        return;
    }
    if (activeJobs.has(job.executionId)) {
        res.status(409).json({ error: "该任务正在本机执行" });
        return;
    }
    try {
        const origin = req.get("origin");
        const reportUrl = new URL(job.reportUrl);
        if (!["http:", "https:"].includes(reportUrl.protocol) || !reportUrl.pathname.endsWith(`/api/executions/${job.executionId}/local-result`)) {
            res.status(400).json({ error: "报告回传地址无效" });
            return;
        }
        if (origin && new URL(origin).hostname !== reportUrl.hostname) {
            res.status(400).json({ error: "报告回传地址与平台主机不一致" });
            return;
        }
        const controller = new AbortController();
        activeJobs.set(job.executionId, { caseId: job.caseId, controller });
        // 执行前向平台回验任务令牌，防止本机被注入任意脚本
        try {
            const verifyUrl = new URL(job.reportUrl);
            verifyUrl.pathname = verifyUrl.pathname.replace(/\/local-result$/, "/verify");
            const verifyRes = await fetch(verifyUrl.toString(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: job.token }),
                signal: AbortSignal.timeout(10000),
            });
            if (!verifyRes.ok) {
                res.status(403).json({ error: "平台拒绝了该任务（令牌无效或已过期）" });
                return;
            }
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            res.status(502).json({ error: `无法连接平台验证任务: ${msg}` });
            return;
        }
        let result = await executeCase(job.script, job.caseName, job.baseUrl, controller.signal, {
            timeoutMs: job.options?.timeoutMs,
            screenshotOnFailure: job.options?.screenshotOnFailure,
            visualBaselines: job.options?.visualBaselines || {},
        });
        const retryLimit = job.options?.retryOnFailure ? Math.max(0, Number(job.options.maxRetries) || 0) : 0;
        for (let attempt = 1; result.status === "fail" && !controller.signal.aborted && attempt <= retryLimit; attempt++) {
            result = await executeCase(job.script, `${job.caseName}（重试 ${attempt}/${retryLimit}）`, job.baseUrl, controller.signal, {
                timeoutMs: job.options?.timeoutMs,
                screenshotOnFailure: job.options?.screenshotOnFailure,
                visualBaselines: job.options?.visualBaselines || {},
            });
            result.logs.unshift({ timestamp: new Date().toISOString(), level: "warn", message: `失败后第 ${attempt} 次重试` });
        }
        let reported = false;
        let reportError = "";
        try {
            const reportResponse = await fetch(job.reportUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: job.token, result, runnerName: RUNNER_NAME }),
            });
            reported = reportResponse.ok;
            if (!reported)
                reportError = await reportResponse.text();
        }
        catch (error) {
            reportError = error instanceof Error ? error.message : String(error);
        }
        res.json({ executionId: job.executionId, result, reported, reportError, runnerName: RUNNER_NAME });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const result = {
            status: "fail",
            logs: [{ timestamp: new Date().toISOString(), level: "error", message }],
            duration: 0,
            error: message,
            steps: [],
        };
        res.status(500).json({ executionId: job.executionId, result, reported: false, error: message, runnerName: RUNNER_NAME });
    }
    finally {
        activeJobs.delete(job.executionId);
    }
});
app.post("/cancel/:caseId", (req, res) => {
    const jobs = Array.from(activeJobs.values()).filter((job) => job.caseId === req.params.caseId);
    jobs.forEach((job) => job.controller.abort());
    res.json({ ok: jobs.length > 0, cancelled: jobs.length });
});
app.listen(PORT, "127.0.0.1", () => {
    console.log(`[AutoTest Local Runner] ${RUNNER_NAME}`);
    console.log(`[AutoTest Local Runner] listening on http://127.0.0.1:${PORT}`);
    console.log(`[AutoTest Local Runner] allowed origins: ${Array.from(allowedOrigins).join(", ")}`);
});
//# sourceMappingURL=local-runner.js.map
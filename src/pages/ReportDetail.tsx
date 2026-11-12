import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, ImageIcon, Clock, FileText, AlertCircle, CheckCircle, ChevronLeft } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import LogTerminal from "@/components/LogTerminal";
import { executionsService } from "@/api/services";

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exec, setExec] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const res = await executionsService.getById(id);
      if (res.ok) setExec(res.data);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-64 text-text-tertiary">加载中...</div>;
  if (!exec) return <div className="flex flex-col items-center justify-center h-64">
    <p className="text-text-tertiary">报告不存在</p>
    <button className="btn-secondary mt-3" onClick={() => navigate("/reports")}>返回列表</button>
  </div>;

  const steps = Array.isArray(exec.steps) ? exec.steps : [];
  const passCount = steps.filter((s: any) => s.status === "pass").length;
  const downloadReport = () => {
    const blob = new Blob([JSON.stringify(exec, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exec.caseName || "report"}-${exec.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/reports")} className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-secondary hover:text-text transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold">{exec.caseName}</h1>
              <StatusBadge status={exec.status} size="md" />
            </div>
            <p className="text-sm text-text-tertiary">执行ID: {exec.id} · {exec.startTime ? new Date(exec.startTime).toLocaleString("zh-CN") : "-"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={downloadReport}><Download className="w-4 h-4" /> 下载报告</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 text-sm text-text-tertiary mb-2"><Clock className="w-4 h-4" /> 开始时间</div>
          <div className="font-medium">{exec.startTime ? new Date(exec.startTime).toLocaleString("zh-CN") : "-"}</div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 text-sm text-text-tertiary mb-2"><Clock className="w-4 h-4" /> 持续时间</div>
          <div className="font-medium">{exec.duration ? `${(exec.duration / 1000).toFixed(1)} 秒` : "-"}</div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 text-sm text-text-tertiary mb-2"><CheckCircle className="w-4 h-4" /> 通过率</div>
          <div className="font-medium text-success">{steps.length > 0 ? `${((passCount / steps.length) * 100).toFixed(0)}%` : "-"}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="card p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-accent" /> 步骤详情</h3>
            <div className="space-y-2">
              {steps.map((step: any, i: number) => (
                <div key={step.id || i} className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    step.status === "pass" ? "bg-success/20 text-success" : step.status === "fail" ? "bg-danger/20 text-danger" : "bg-muted/20 text-muted"
                  }`}>
                    {step.status === "pass" ? <CheckCircle className="w-4 h-4" /> : step.status === "fail" ? <AlertCircle className="w-4 h-4" /> : i + 1}
                  </div>
                  <div className="flex-1 p-3 bg-bg-elevated/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{step.action === 'navigate' ? `🌐 ${step.selector}` : step.action === 'click' ? `🖱 ${step.selector}` : step.action === 'fill' ? `⌨ ${step.selector}` : `${step.action}: ${step.selector}`}</span>
                      <div className="flex items-center gap-2">
                        {step.duration > 0 && <span className="text-xs text-text-tertiary">{(step.duration / 1000).toFixed(1)}s</span>}
                        <StatusBadge status={step.status} size="sm" />
                      </div>
                    </div>
                    {step.error && <div className="mt-2 text-xs text-danger bg-danger/10 px-2 py-1.5 rounded">{step.error}</div>}
                  </div>
                </div>
              ))}
              {steps.length === 0 && <div className="text-center py-8 text-text-tertiary text-sm">暂无步骤数据</div>}
            </div>
          </div>
          <LogTerminal logs={Array.isArray(exec.logs) ? exec.logs : []} title="执行日志" />
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><ImageIcon className="w-4 h-4 text-accent" /> 截图预览</h3>
            {Array.isArray(exec.screenshots) && exec.screenshots.length > 0 ? (
              <div className="space-y-2">{exec.screenshots.map((src: string, index: number) => <img key={index} src={src.startsWith("data:") ? src : `data:image/png;base64,${src}`} alt={`执行截图 ${index + 1}`} className="w-full rounded border border-border" />)}</div>
            ) : <div className="text-center py-8 text-text-tertiary text-sm">暂无截图</div>}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => navigate("/reports")} className="btn-secondary"><ChevronLeft className="w-4 h-4" /> 返回列表</button>
      </div>
    </div>
  );
}

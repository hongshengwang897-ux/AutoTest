import { useEffect, useRef, useState } from "react";
import { Terminal, Download, Filter } from "lucide-react";
import type { LogEntry, LogLevel } from "@/types";

interface LogTerminalProps {
  logs: LogEntry[];
  isStreaming?: boolean;
  title?: string;
}

const levelColors: Record<LogLevel, string> = {
  info: "text-accent",
  warn: "text-warning",
  error: "text-danger",
  debug: "text-slate-400",
};

export default function LogTerminal({ logs, isStreaming = false, title = "执行日志" }: LogTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<"all" | LogLevel>("all");
  const [autoScroll, setAutoScroll] = useState(true);

  const filteredLogs = filter === "all" ? logs : logs.filter((l) => l.level === filter);

  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("zh-CN", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
  };

  const downloadLogs = () => {
    const content = filteredLogs.map((log) => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`).join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `execution-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-bg-elevated/50">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium">{title}</span>
          {isStreaming && (
            <span className="flex items-center gap-1.5 text-xs text-accent">
              <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
              实时
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-bg rounded-lg border border-border/60 p-0.5">
            {(["all", "info", "warn", "error", "debug"] as const).map((level) => (
              <button
                key={level}
                onClick={() => setFilter(level)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  filter === level
                    ? "bg-accent text-white"
                    : "text-text-tertiary hover:text-text"
                }`}
              >
                {level === "all" ? "全部" : level.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded-lg transition-colors ${
              autoScroll ? "bg-accent/15 text-accent" : "text-text-tertiary hover:text-text"
            }`}
            title="自动滚动"
          >
            <Filter className="w-4 h-4" />
          </button>
          <button onClick={downloadLogs} disabled={filteredLogs.length === 0} className="p-1.5 rounded-lg text-text-tertiary hover:text-text hover:bg-bg transition-colors disabled:opacity-40" title="下载日志">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={terminalRef}
        className="h-80 overflow-y-auto bg-[#152033] p-4 font-mono text-xs leading-relaxed text-slate-100"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            暂无日志
          </div>
        ) : (
          filteredLogs.map((log, index) => (
            <div key={`${log.id || log.timestamp}-${index}`} className="flex gap-2 py-0.5 hover:bg-white/5 rounded px-1">
              <span className="text-slate-400 shrink-0">{formatTime(log.timestamp)}</span>
              <span className={`shrink-0 uppercase text-[10px] font-bold ${levelColors[log.level]}`}>
                {log.level}
              </span>
              <span className="text-slate-100 break-all">{log.message.replace(/^\[(INFO|WARN|ERROR|DEBUG)\]\s/, "")}</span>
            </div>
          ))
        )}
        {isStreaming && (
          <span className="inline-block w-2 h-3.5 bg-accent/80 animate-blink" />
        )}
      </div>
    </div>
  );
}

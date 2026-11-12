import type { ExecutionStatus } from "@/types";

interface StatusBadgeProps {
  status: ExecutionStatus | "pass" | "fail" | "skip" | "active" | "draft" | "archived" | "online" | "offline" | "busy" | "inactive" | string;
  size?: "sm" | "md";
}

const statusConfig: Record<string, { color: string; bg: string; label: string; dot?: string }> = {
  success: { color: "text-success", bg: "bg-success/15", label: "成功", dot: "bg-success" },
  pass: { color: "text-success", bg: "bg-success/15", label: "通过", dot: "bg-success" },
  running: { color: "text-accent", bg: "bg-accent/15", label: "执行中", dot: "bg-accent" },
  pending: { color: "text-warning", bg: "bg-warning/15", label: "等待中", dot: "bg-warning" },
  failed: { color: "text-danger", bg: "bg-danger/15", label: "失败", dot: "bg-danger" },
  fail: { color: "text-danger", bg: "bg-danger/15", label: "失败", dot: "bg-danger" },
  timeout: { color: "text-warning", bg: "bg-warning/15", label: "超时", dot: "bg-warning" },
  skip: { color: "text-muted", bg: "bg-muted/15", label: "跳过", dot: "bg-muted" },
  active: { color: "text-success", bg: "bg-success/15", label: "启用" },
  draft: { color: "text-warning", bg: "bg-warning/15", label: "草稿" },
  archived: { color: "text-muted", bg: "bg-muted/15", label: "已归档" },
  online: { color: "text-success", bg: "bg-success/15", label: "在线", dot: "bg-success" },
  offline: { color: "text-danger", bg: "bg-danger/15", label: "离线", dot: "bg-danger" },
  busy: { color: "text-accent", bg: "bg-accent/15", label: "忙碌", dot: "bg-accent" },
  inactive: { color: "text-muted", bg: "bg-muted/15", label: "停用" },
};

export default function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending;
  const sizeClasses = size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1";
  const dotSize = size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sizeClasses} ${config.bg} ${config.color}`}
    >
      {config.dot && (
        <span className={`${dotSize} rounded-full ${config.dot} ${status === "running" || status === "busy" ? "animate-pulse" : ""}`} />
      )}
      {config.label}
    </span>
  );
}

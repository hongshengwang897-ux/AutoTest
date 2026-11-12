import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; isPositive: boolean };
  accentColor?: "accent" | "success" | "warning" | "danger";
}

const colorMap = {
  accent: "bg-accent/15 text-accent",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
};

export default function StatCard({ title, value, icon: Icon, trend, accentColor = "accent" }: StatCardProps) {
  return (
    <div className="card p-5 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5 transition-all duration-300 group">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[accentColor]}`}>
          <Icon className="w-5 h-5" strokeWidth={1.5} />
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 text-xs font-medium ${
              trend.isPositive ? "text-success" : "text-danger"
            }`}
          >
            {trend.isPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            <span>{trend.isPositive ? "+" : ""}{trend.value}%</span>
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-text mb-1">{value}</div>
      <div className="text-sm text-text-tertiary">{title}</div>
    </div>
  );
}

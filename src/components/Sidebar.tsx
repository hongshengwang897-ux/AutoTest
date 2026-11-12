import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FileCode,
  PlayCircle,
  FileBarChart,
  Server,
  Clock,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
  Circle,
  Library,
  Braces,
  Gauge,
  Moon,
  Sun,
} from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const THEME_STORAGE_KEY = "autotest-theme";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/cases", icon: FileCode, label: "UI自动化测试" },
  { path: "/recorder", icon: Circle, label: "录制功能" },
  { path: "/elements", icon: Library, label: "元素库" },
  { path: "/interface-testing", icon: Braces, label: "接口测试" },
  { path: "/performance-testing", icon: Gauge, label: "性能测试" },
  { path: "/execution", icon: PlayCircle, label: "执行中心" },
  { path: "/reports", icon: FileBarChart, label: "报告中心" },
  { path: "/environments", icon: Server, label: "环境管理" },
  { path: "/schedules", icon: Clock, label: "定时调度" },
  { path: "/alerts", icon: Bell, label: "告警通知" },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light");

  useEffect(() => {
    const isDark = theme === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((current) => current === "light" ? "dark" : "light");
  const themeActionLabel = theme === "light" ? "切换为暗色主题" : "切换为明亮主题";

  return (
    <>
    <aside
      className={`${
        collapsed ? "w-16" : "w-56"
      } transition-all duration-300 bg-bg-card border-r border-border/60 hidden lg:flex flex-col h-screen sticky top-0`}
    >
      <div className="h-16 flex items-center justify-center border-b border-border/60 px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-white font-bold text-sm shrink-0">
            AT
          </div>
          {!collapsed && (
            <div className="animate-fade-in">
              <div className="font-semibold text-sm">AutoTest</div>
              <div className="text-xs text-text-tertiary">自动化管理平台</div>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group ${
                isActive
                  ? "bg-accent/15 text-accent font-medium"
                  : "text-text-secondary hover:bg-bg-elevated hover:text-text"
              } ${collapsed ? "justify-center" : ""}`
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="w-5 h-5 shrink-0" strokeWidth={1.5} />
            {!collapsed && <span className="animate-fade-in">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border/60 px-2 py-2 space-y-1">
        <button
          type="button"
          onClick={toggleTheme}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-secondary hover:bg-bg-elevated hover:text-text text-sm transition-colors ${collapsed ? "justify-center" : ""}`}
          title={themeActionLabel}
          aria-label={themeActionLabel}
        >
          {theme === "light" ? <Moon className="w-5 h-5 shrink-0" strokeWidth={1.5} /> : <Sun className="w-5 h-5 shrink-0" strokeWidth={1.5} />}
          {!collapsed && <span>{theme === "light" ? "暗色主题" : "明亮主题"}</span>}
        </button>

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
              isActive
                ? "bg-accent/15 text-accent"
                : "text-text-secondary hover:bg-bg-elevated hover:text-text"
            } ${collapsed ? "justify-center" : ""}`
          }
        >
          <Settings className="w-5 h-5 shrink-0" strokeWidth={1.5} />
          {!collapsed && <span>系统设置</span>}
        </NavLink>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-tertiary hover:bg-bg-elevated hover:text-text text-sm transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5 shrink-0" strokeWidth={1.5} />
          ) : (
            <ChevronLeft className="w-5 h-5 shrink-0" strokeWidth={1.5} />
          )}
          {!collapsed && <span>收起侧栏</span>}
        </button>
      </div>

      {!collapsed && (
        <div className="px-4 py-3 border-t border-border/60">
          <div className="text-xs text-text-tertiary">v0.1.0 · Prototype</div>
        </div>
      )}
    </aside>
    <nav className="fixed bottom-0 inset-x-0 z-40 lg:hidden h-16 bg-bg-card border-t border-border/60 flex items-center overflow-x-auto px-1">
      {[...navItems, { path: "/settings", icon: Settings, label: "设置" }].map((item) => (
        <NavLink key={item.path} to={item.path} end={item.path === "/"} className={({ isActive }) => `min-w-16 h-full px-2 flex flex-col items-center justify-center gap-1 text-[10px] ${isActive ? "text-accent" : "text-text-tertiary"}`}>
          <item.icon className="w-4 h-4" strokeWidth={1.5} />
          <span className="whitespace-nowrap">{item.label}</span>
        </NavLink>
      ))}
      <button type="button" onClick={toggleTheme} className="min-w-16 h-full px-2 flex flex-col items-center justify-center gap-1 text-[10px] text-text-tertiary" title={themeActionLabel} aria-label={themeActionLabel}>
        {theme === "light" ? <Moon className="w-4 h-4" strokeWidth={1.5} /> : <Sun className="w-4 h-4" strokeWidth={1.5} />}
        <span className="whitespace-nowrap">{theme === "light" ? "暗色" : "明亮"}</span>
      </button>
    </nav>
    </>
  );
}

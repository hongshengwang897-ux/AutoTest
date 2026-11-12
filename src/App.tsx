import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import ErrorBoundary from "@/components/ErrorBoundary";
import ConfirmDialogHost from "@/components/ConfirmDialog";
import PromptDialogHost from "@/components/PromptDialog";

// 页面组件全部懒加载，配合 vite manualChunks 做代码分割，避免单 bundle 过大
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Cases = lazy(() => import("@/pages/Cases"));
const CaseEditor = lazy(() => import("@/pages/CaseEditor"));
const Recorder = lazy(() => import("@/pages/Recorder"));
const ElementLibrary = lazy(() => import("@/pages/ElementLibrary"));
const Execution = lazy(() => import("@/pages/Execution"));
const Reports = lazy(() => import("@/pages/Reports"));
const ReportDetail = lazy(() => import("@/pages/ReportDetail"));
const Environments = lazy(() => import("@/pages/Environments"));
const Schedules = lazy(() => import("@/pages/Schedules"));
const Alerts = lazy(() => import("@/pages/Alerts"));
const Settings = lazy(() => import("@/pages/Settings"));
const ApiTesting = lazy(() => import("@/pages/ApiTesting"));
const PerformanceTesting = lazy(() => import("@/pages/PerformanceTesting"));

// 路由切换时的居中加载态，与各页面加载态视觉一致
function PageFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-accent animate-spin" />
    </div>
  );
}

const pageTitles: Record<string, string[]> = {
  "/": ["首页", "Dashboard"],
  "/cases": ["首页", "UI自动化测试"],
  "/recorder": ["首页", "录制功能"],
  "/elements": ["首页", "元素库"],
  "/interface-testing": ["首页", "接口测试"],
  "/performance-testing": ["首页", "性能测试"],
  "/execution": ["首页", "执行中心"],
  "/reports": ["首页", "报告中心"],
  "/environments": ["首页", "环境管理"],
  "/schedules": ["首页", "定时调度"],
  "/alerts": ["首页", "告警通知"],
  "/settings": ["首页", "系统设置"],
};

function Layout() {
  const location = useLocation();
  const breadcrumbs =
    pageTitles[location.pathname] ||
    (location.pathname.startsWith("/cases/")
      ? ["首页", "UI自动化测试", "编辑用例"]
      : location.pathname.startsWith("/reports/")
      ? ["首页", "报告中心", "报告详情"]
      : location.pathname.startsWith("/recorder")
      ? ["首页", "录制功能"]
      : location.pathname.startsWith("/elements")
      ? ["首页", "元素库"]
      : ["首页"]);

  const isFullscreen =
    location.pathname.startsWith("/cases") ||
    location.pathname.startsWith("/recorder") ||
    location.pathname.startsWith("/elements") ||
    location.pathname.startsWith("/interface-testing") ||
    location.pathname.startsWith("/performance-testing");

  return (
    <div className="flex min-h-screen">
      <ConfirmDialogHost />
      <PromptDialogHost />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {!isFullscreen && <TopBar breadcrumbs={breadcrumbs} />}
        <main className={`flex-1 overflow-hidden pb-16 lg:pb-0 ${isFullscreen ? "" : "p-3 lg:p-6"}`}>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/cases" element={<Cases />} />
              <Route path="/cases/new" element={<CaseEditor />} />
              <Route path="/cases/:id" element={<CaseEditor />} />
              <Route path="/recorder" element={<Recorder />} />
              <Route path="/elements" element={<ElementLibrary />} />
              <Route path="/interface-testing" element={<ApiTesting />} />
              <Route path="/performance-testing" element={<PerformanceTesting />} />
              <Route path="/execution" element={<Execution />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/reports/:id" element={<ReportDetail />} />
              <Route path="/environments" element={<Environments />} />
              <Route path="/schedules" element={<Schedules />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <ErrorBoundary>
        <Layout />
      </ErrorBoundary>
    </Router>
  );
}

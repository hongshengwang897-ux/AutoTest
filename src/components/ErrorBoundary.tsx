import React, { useEffect, useState, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[ErrorBoundary] 应用错误:", error, info);
  }

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          reset: () => this.setState({ error: null }),
        });
      }
      return <GlobalErrorFallback error={this.state.error} reset={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

interface GlobalErrorFallbackProps {
  error: Error;
  reset: () => void;
}

function GlobalErrorFallback({ error, reset }: GlobalErrorFallbackProps) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== "undefined" && window.navigator.sendBeacon) {
        window.navigator.sendBeacon("/api/errors", JSON.stringify({
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
          pathname: window.location.pathname,
        }));
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-lg">
        <div className="card rounded-xl p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger/10">
            <svg className="h-8 w-8 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-bold text-text">页面出现异常</h2>
          <p className="mb-6 text-sm text-text-tertiary">
            抱歉，页面发生了意外错误。你可以尝试刷新页面，或稍后再试。
          </p>
          <div className="mb-6 flex gap-3 justify-center">
            <button
              onClick={reset}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
            >
              重新加载
            </button>
            <button
              onClick={() => { if (typeof window !== "undefined") window.location.reload(); }}
              className="rounded-lg border border-border/60 px-5 py-2.5 text-sm font-medium text-text transition-colors hover:bg-bg-elevated"
            >
              刷新页面
            </button>
          </div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-text-tertiary hover:text-text transition-colors underline underline-offset-2"
          >
            {showDetails ? "收起错误详情" : "查看错误详情"}
          </button>
          {showDetails && (
            <div className="mt-4 rounded-lg bg-bg-elevated/60 p-4 text-left">
              <pre className="text-xs text-text-secondary whitespace-pre-wrap break-all">
                {error.message}
                {error.stack ? `\n\n${error.stack.split("\n").slice(0, 10).join("\n")}` : ""}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

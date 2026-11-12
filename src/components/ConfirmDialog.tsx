import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

export interface ConfirmDialogOptions {
  title?: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmRequest extends ConfirmDialogOptions {
  id: number;
  resolve: (confirmed: boolean) => void;
}

let requestId = 0;
let activeRequest: ConfirmRequest | null = null;
const queue: ConfirmRequest[] = [];
const listeners = new Set<(request: ConfirmRequest | null) => void>();

function emit() {
  listeners.forEach((listener) => listener(activeRequest));
}

function showNext() {
  if (activeRequest || queue.length === 0) return;
  activeRequest = queue.shift() || null;
  emit();
}

export function confirmAction(options: string | ConfirmDialogOptions): Promise<boolean> {
  const normalized = typeof options === "string" ? { message: options } : options;
  return new Promise((resolve) => {
    queue.push({ id: ++requestId, danger: true, confirmLabel: "确认", cancelLabel: "取消", ...normalized, resolve });
    showNext();
  });
}

function finish(request: ConfirmRequest, confirmed: boolean) {
  if (activeRequest?.id !== request.id) return;
  activeRequest = null;
  request.resolve(confirmed);
  emit();
  showNext();
}

export default function ConfirmDialogHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(activeRequest);

  useEffect(() => {
    listeners.add(setRequest);
    setRequest(activeRequest);
    return () => { listeners.delete(setRequest); };
  }, []);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(request, false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [request]);

  if (!request) return null;

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-labelledby="global-confirm-title" onMouseDown={(event) => { if (event.target === event.currentTarget) finish(request, false); }}>
    <div className="w-full max-w-md rounded-2xl border border-border bg-bg-card p-5 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${request.danger ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}><AlertTriangle className="h-5 w-5" /></div>
        <div className="min-w-0"><h3 id="global-confirm-title" className="font-semibold">{request.title || "请确认操作"}</h3><p className="mt-2 break-words text-sm text-text-secondary">{request.message}</p>{request.detail && <p className={`mt-2 text-xs ${request.danger ? "text-danger" : "text-text-tertiary"}`}>{request.detail}</p>}</div>
      </div>
      <div className="mt-6 flex justify-end gap-2"><button className="btn-secondary" autoFocus onClick={() => finish(request, false)}>{request.cancelLabel}</button><button className={`btn-primary ${request.danger ? "!border-danger !bg-danger hover:!bg-danger/90" : ""}`} onClick={() => finish(request, true)}>{request.confirmLabel}</button></div>
    </div>
  </div>;
}

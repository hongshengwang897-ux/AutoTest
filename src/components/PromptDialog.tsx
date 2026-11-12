import { useEffect, useState } from "react";
import { FolderPlus } from "lucide-react";

interface PromptOptions {
  title: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
}

interface PromptRequest extends PromptOptions {
  id: number;
  resolve: (value: string | null) => void;
}

let requestId = 0;
let activeRequest: PromptRequest | null = null;
const listeners = new Set<(request: PromptRequest | null) => void>();

export function promptAction(options: PromptOptions): Promise<string | null> {
  if (activeRequest) activeRequest.resolve(null);
  return new Promise((resolve) => {
    activeRequest = { id: ++requestId, confirmLabel: "确认", ...options, resolve };
    listeners.forEach((listener) => listener(activeRequest));
  });
}

function finish(request: PromptRequest, value: string | null) {
  if (activeRequest?.id !== request.id) return;
  activeRequest = null;
  request.resolve(value);
  listeners.forEach((listener) => listener(null));
}

export default function PromptDialogHost() {
  const [request, setRequest] = useState<PromptRequest | null>(activeRequest);
  const [value, setValue] = useState("");

  useEffect(() => {
    listeners.add(setRequest);
    return () => { listeners.delete(setRequest); };
  }, []);

  useEffect(() => { setValue(request?.initialValue || ""); }, [request?.id]);

  if (!request) return null;
  const submit = () => {
    const normalized = value.trim();
    if (normalized) finish(request, normalized);
  };

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-labelledby="global-prompt-title" onMouseDown={(event) => { if (event.target === event.currentTarget) finish(request, null); }}>
    <div className="w-full max-w-md rounded-2xl border border-border bg-bg-card p-5 shadow-2xl">
      <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent"><FolderPlus className="h-5 w-5" /></div><h3 id="global-prompt-title" className="font-semibold">{request.title}</h3></div>
      <label className="mt-5 block text-sm"><span className="mb-2 block text-text-secondary">{request.label || "名称"}</span><input className="input w-full" autoFocus value={value} placeholder={request.placeholder} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); if (event.key === "Escape") finish(request, null); }} /></label>
      <div className="mt-6 flex justify-end gap-2"><button className="btn-secondary" onClick={() => finish(request, null)}>取消</button><button className="btn-primary" disabled={!value.trim()} onClick={submit}>{request.confirmLabel}</button></div>
    </div>
  </div>;
}

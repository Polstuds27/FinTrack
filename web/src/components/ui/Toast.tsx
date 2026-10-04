import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";

export type ToastTone = "info" | "success" | "warning" | "error";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  action?: { label: string; onSelect: () => void };
}

interface ToastContextValue {
  push: (toast: Omit<Toast, "id" | "tone"> & { tone?: ToastTone; durationMs?: number }) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_ICON: Record<ToastTone, ReactNode> = {
  info: <Info className="h-4 w-4" />,
  success: <CircleCheck className="h-4 w-4" />,
  warning: <TriangleAlert className="h-4 w-4" />,
  error: <CircleAlert className="h-4 w-4" />,
};

const TONE_CLASS: Record<ToastTone, string> = {
  info: "text-info",
  success: "text-income",
  warning: "text-warning",
  error: "text-expense",
};

const DEFAULT_DURATION = 4_000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback<ToastContextValue["push"]>(
    ({ tone = "info", durationMs = DEFAULT_DURATION, ...rest }) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev.slice(-2), { ...rest, id, tone }]);
      if (durationMs > 0) {
        timers.current.set(id, window.setTimeout(() => dismiss(id), durationMs));
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          aria-atomic="false"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-3 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:bottom-4 sm:right-4 sm:left-auto sm:items-end sm:px-0 sm:pb-0"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className="pointer-events-auto flex w-full max-w-sm animate-rise items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-overlay"
            >
              <span aria-hidden="true" className={`mt-0.5 shrink-0 ${TONE_CLASS[toast.tone]}`}>
                {TONE_ICON[toast.tone]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{toast.title}</p>
                {toast.description && (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{toast.description}</p>
                )}
                {toast.action && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action?.onSelect();
                      dismiss(toast.id);
                    }}
                    className="mt-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismiss(toast.id)}
                className="-mr-1 -mt-1 rounded p-1 text-faint transition-colors hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
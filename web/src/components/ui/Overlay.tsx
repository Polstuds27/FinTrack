import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./Button";

type OverlaySize = "sm" | "md" | "lg" | "xl";

const SIZES: Record<OverlaySize, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

const TITLES: Record<OverlaySize, string> = {
  sm: "w-full max-w-md",
  md: "w-full max-w-xl",
  lg: "w-full max-w-3xl",
  xl: "w-full max-w-5xl",
};

export interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: OverlaySize;
  /** `sheet` slides up on mobile, `drawer` slides in from the right, `center` is a plain modal. */
  variant?: "center" | "sheet" | "drawer";
  /** Disables backdrop/Escape dismissal while a destructive action runs. */
  busy?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Overlay({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  variant = "center",
  busy,
}: OverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      // Keep focus inside the dialog: money entry must not wander into the page behind.
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null,
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    },
    [busy, onClose],
  );

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown, true);

    const timer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      (target ?? panelRef.current)?.focus();
    }, 20);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
      restoreFocus.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const shell =
    variant === "sheet"
      ? "fixed inset-x-0 bottom-0 z-50 animate-slide-up rounded-t-2xl sm:inset-x-auto sm:right-0 sm:top-0 sm:animate-slide-left sm:rounded-none sm:rounded-l-2xl"
      : variant === "drawer"
        ? "fixed inset-y-0 right-0 z-50 w-full max-w-md animate-slide-left rounded-l-2xl"
        : "fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6";

  const panel = variant === "center" ? SIZES[size] : TITLES[size];

  return createPortal(
    <div className={shell}>
      {variant === "center" && (
        <div
          className="absolute inset-0 animate-fade-in bg-overlay/40 backdrop-blur-[2px]"
          onClick={() => !busy && onClose()}
          aria-hidden="true"
        />
      )}
      {variant !== "center" && (
        <div
          className="absolute inset-0 animate-fade-in bg-overlay/40 backdrop-blur-[2px]"
          onClick={() => !busy && onClose()}
          aria-hidden="true"
        />
      )}

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={`relative flex max-h-[92vh] flex-col overflow-hidden border border-line bg-surface shadow-overlay outline-none ${
          variant === "sheet"
            ? "rounded-t-2xl sm:rounded-l-2xl sm:rounded-tr-none"
            : variant === "drawer"
              ? "rounded-l-2xl"
              : "animate-rise rounded-2xl sm:rounded-2xl"
        } ${panel}`}
      >
        {variant === "sheet" && (
          <div aria-hidden="true" className="flex justify-center pt-2 sm:hidden">
            <span className="h-1 w-10 rounded-full bg-line-strong" />
          </div>
        )}

        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-title text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} disabled={busy} className="-mr-1.5 -mt-1">
            <X className="h-5 w-5" />
          </IconButton>
        </header>

        <div className="scroll-area flex-1 px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmation dialog for destructive actions. */
export function ConfirmOverlay({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
  busy,
  tone = "danger",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  tone?: "danger" | "primary";
}) {
  return (
    <Overlay
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      variant="center"
      busy={busy}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            data-autofocus
            className={tone === "danger" ? "btn-danger" : "btn-primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-ink-soft">{message}</p>
    </Overlay>
  );
}
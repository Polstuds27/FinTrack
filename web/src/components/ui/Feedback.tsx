import type { ReactNode } from "react";
import { CircleAlert, CircleHelp, CloudSync, Lock, TriangleAlert, WifiOff } from "lucide-react";
import { Button } from "./Button";

/* ------------------------------------------------------------------- empty state */

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className = "",
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? "gap-2 py-8" : "gap-3 py-14"} ${className}`}
    >
      {icon && (
        <span
          aria-hidden="true"
          className="flex items-center justify-center rounded-2xl bg-primary-soft-bg text-primary"
          style={{ width: compact ? 44 : 60, height: compact ? 44 : 60 }}
        >
          {icon}
        </span>
      )}
      <div className="max-w-sm space-y-1">
        <p className={`${compact ? "text-sm" : "text-base"} font-semibold text-ink`}>{title}</p>
        {description && <p className="text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ error state */

export type ErrorKind = "offline" | "auth" | "server" | "sync" | "conflict" | "validation" | "unknown";

const ERROR_PRESETS: Record<ErrorKind, { icon: ReactNode; title: string; body: string }> = {
  offline: {
    icon: <WifiOff className="h-6 w-6" />,
    title: "You're offline",
    body: "Your changes are saved on this device and will sync automatically when you're back online.",
  },
  auth: {
    icon: <Lock className="h-6 w-6" />,
    title: "Session expired",
    body: "Sign in again to continue syncing your data across devices.",
  },
  server: {
    icon: <CircleAlert className="h-6 w-6" />,
    title: "Couldn't reach the server",
    body: "Your local data is still available. Try again in a moment.",
  },
  sync: {
    icon: <CloudSync className="h-6 w-6" />,
    title: "Sync needs attention",
    body: "Some changes couldn't be uploaded. Review the queued items to keep your data safe.",
  },
  conflict: {
    icon: <TriangleAlert className="h-6 w-6" />,
    title: "Conflicting edits",
    body: "This record changed on another device. Choose which version to keep.",
  },
  validation: {
    icon: <CircleAlert className="h-6 w-6" />,
    title: "Check the highlighted fields",
    body: "Some values need fixing before this can be saved.",
  },
  unknown: {
    icon: <CircleHelp className="h-6 w-6" />,
    title: "Something went wrong",
    body: "We couldn't complete that action. Your data hasn't been changed.",
  },
};

export function ErrorState({
  kind = "unknown",
  title,
  description,
  onRetry,
  retryLabel = "Retry",
  action,
  className = "",
  compact = false,
}: {
  kind?: ErrorKind;
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const preset = ERROR_PRESETS[kind];
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-3 text-center ${compact ? "py-6" : "py-12"} ${className}`}
    >
      <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-warning-soft text-warning">
        {preset.icon}
      </span>
      <div className="max-w-sm space-y-1">
        <p className="text-base font-semibold text-ink">{title ?? preset.title}</p>
        <p className="text-sm leading-relaxed text-muted">{description ?? preset.body}</p>
      </div>
      {(onRetry || action) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

/** Inline alert for forms and page-level notices. */
export function Alert({
  tone = "info",
  title,
  children,
  icon,
  action,
  className = "",
}: {
  tone?: "info" | "warning" | "expense" | "income";
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const cls = {
    info: "bg-info-soft text-info",
    warning: "bg-warning-soft text-warning",
    expense: "bg-expense-soft text-expense",
    income: "bg-income-soft text-income",
  }[tone];
  const defaultIcon = {
    info: <CircleHelp className="h-4 w-4" />,
    warning: <TriangleAlert className="h-4 w-4" />,
    expense: <CircleAlert className="h-4 w-4" />,
    income: <CloudSync className="h-4 w-4" />,
  }[tone];

  return (
    <div className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 ${cls} ${className}`}>
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {icon ?? defaultIcon}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5 opacity-90" : "opacity-90"}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/* --------------------------------------------------------------------- skeletons */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={`h-3 ${index === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 5, height = 56 }: { rows?: number; height?: number }) {
  return (
    <div aria-hidden="true" className="divide-y divide-line">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4" style={{ height }}>
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonStats({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="card space-y-2 p-4">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Screen-reader-only live region text for loading states. */
export function LoadingLabel({ children }: { children: ReactNode }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {children}
    </span>
  );
}
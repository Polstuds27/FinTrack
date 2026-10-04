import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight } from "lucide-react";

/* ----------------------------------------------------------------------- surfaces */

export function Card({
  children,
  className = "",
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 border-b border-line px-4 py-3 ${className}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="text-primary">{icon}</span>}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Small labelled figure. `tone` colours the value, `emphasis` promotes it. */
export function Stat({
  label,
  value,
  caption,
  tone = "default",
  emphasis = "normal",
  icon,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  tone?: "default" | "income" | "expense" | "transfer" | "primary" | "muted";
  emphasis?: "normal" | "large" | "hero";
  icon?: ReactNode;
  className?: string;
}) {
  const toneClass = {
    default: "text-ink",
    income: "text-income",
    expense: "text-expense",
    transfer: "text-transfer",
    primary: "text-primary",
    muted: "text-muted",
  }[tone];

  const valueSize =
    emphasis === "hero" ? "text-display-lg" : emphasis === "large" ? "text-display-sm" : "text-title";

  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase">
        {icon}
        {label}
      </span>
      <span className={`${valueSize} tabular truncate ${toneClass}`}>{value}</span>
      {caption && <span className="text-xs text-muted">{caption}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------------ badges */

export type BadgeTone =
  | "neutral"
  | "primary"
  | "income"
  | "expense"
  | "warning"
  | "info";

export function Badge({
  children,
  tone = "neutral",
  className = "",
  icon,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  icon?: ReactNode;
}) {
  const cls = {
    neutral: "badge-neutral",
    primary: "badge-primary",
    income: "badge-synced",
    expense: "badge-failed",
    warning: "badge-pending",
    info: "bg-info-soft text-info",
  }[tone];
  return (
    <span className={`${cls} ${className}`}>
      {icon}
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------- progress */

export function ProgressBar({
  value,
  tone = "primary",
  size = "md",
  label,
  showOverflow = true,
  className = "",
}: {
  /** 0-100+. Values above 100 are clamped for the bar but flagged. */
  value: number;
  tone?: "primary" | "income" | "expense" | "warning" | "info";
  size?: "xs" | "sm" | "md";
  label?: string;
  showOverflow?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const over = value > 100;
  const height = { xs: "h-1", sm: "h-1.5", md: "h-2.5" }[size];
  const fill = over
    ? "bg-expense"
    : {
        primary: "bg-primary",
        income: "bg-income",
        expense: "bg-expense",
        warning: "bg-warning",
        info: "bg-info",
      }[tone];

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={`w-full overflow-hidden rounded-full bg-surface-sunken ${height} ${className}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-smooth ${fill} ${showOverflow && over ? "" : ""}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/* --------------------------------------------------------------------------- misc */

export function Divider({ className = "", label }: { className?: string; label?: string }) {
  if (label) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    );
  }
  return <hr className={`border-t border-line ${className}`} />;
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-primary-soft-bg font-semibold text-primary"
    >
      {initials || "?"}
    </span>
  );
}

/** Signed amount with a semantic arrow. Used in every transaction surface. */
export function AmountDelta({
  amount,
  type,
  className = "",
  size = "md",
}: {
  amount: ReactNode;
  type: "income" | "expense" | "transfer";
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const Icon = type === "income" ? ArrowUpRight : type === "expense" ? ArrowDownRight : ArrowLeftRight;
  const tone = type === "income" ? "text-income" : type === "expense" ? "text-expense" : "text-transfer";
  const iconSize = { sm: "h-3.5 w-3.5", md: "h-4 w-4", lg: "h-5 w-5" }[size];
  const textSize = { sm: "text-sm", md: "text-base", lg: "text-title" }[size];
  return (
    <span className={`tabular inline-flex items-center gap-0.5 font-semibold ${tone} ${textSize} ${className}`}>
      <Icon aria-hidden="true" className={iconSize} />
      {amount}
    </span>
  );
}

export function LinkButton({
  to,
  children,
  className = "",
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline ${className}`}
    >
      {children}
    </Link>
  );
}
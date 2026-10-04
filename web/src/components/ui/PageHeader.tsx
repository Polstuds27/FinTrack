import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "./Button";

/**
 * Page header: establishes *what page am I on*, the period/filters in force, and
 * the primary actions available here (§48 of the redesign brief).
 */
export function PageHeader({
  title,
  subtitle,
  period,
  actions,
  leading,
  tabs,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** The date range / filter in force, shown next to the title. */
  period?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
  tabs?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex flex-col gap-3 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-start gap-2.5">
          {leading}
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <h1 className="truncate text-title text-ink sm:text-display-sm">{title}</h1>
              {period}
            </div>
            {subtitle && <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs}
    </header>
  );
}

/** Back button used by detail screens (mobile-first). */
export function BackLink({
  onBack,
  children = "Back",
  className = "",
}: {
  onBack: () => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onBack}
      className={`inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink ${className}`}
    >
      <ChevronLeft aria-hidden="true" className="h-4 w-4" />
      {children}
    </button>
  );
}

/** Compact ‹ month › stepper for period pickers. */
export function PeriodStepper({
  label,
  onPrevious,
  onNext,
  onToday,
  nextDisabled,
  children,
}: {
  label: ReactNode;
  onPrevious: () => void;
  onNext: () => void;
  onToday?: () => void;
  nextDisabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <IconButton label="Previous period" onClick={onPrevious} size="sm">
        <ChevronLeft className="h-4 w-4" />
      </IconButton>
      <div className="min-w-[7.5rem] text-center text-sm font-medium text-ink">{label}</div>
      <IconButton label="Next period" onClick={onNext} size="sm" disabled={nextDisabled}>
        <ChevronRight className="h-4 w-4" />
      </IconButton>
      {onToday && (
        <button
          type="button"
          onClick={onToday}
          className="ml-1 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary-soft-bg"
        >
          Today
        </button>
      )}
      {children}
    </div>
  );
}

/** Label/value pair used in detail panels. */
export function DetailRow({
  label,
  children,
  className = "",
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${className}`}>
      <dt className="shrink-0 text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm text-ink">{children}</dd>
    </div>
  );
}

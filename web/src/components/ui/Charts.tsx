/**
 * Hand-rolled SVG charts.
 *
 * Purpose-built rather than a charting library: the app only needs a handful of
 * shapes, they must render identically offline, stay accessible, and inherit the
 * design tokens. Every chart has a text alternative (`aria-label`) plus a table.
 */
import { useId, useMemo, type ReactNode } from "react";

export interface SeriesPoint {
  label: string;
  value: number;
  /** Optional secondary series (income on expense charts). */
  secondary?: number;
  meta?: string;
}

const TOKEN = {
  primary: "rgb(var(--color-primary))",
  accent: "rgb(var(--color-accent))",
  income: "rgb(var(--color-income))",
  expense: "rgb(var(--color-expense))",
  transfer: "rgb(var(--color-transfer))",
  warning: "rgb(var(--color-warning))",
  muted: "rgb(var(--color-muted))",
  grid: "rgb(var(--color-line))",
} as const;

export function ChartFrame({
  title,
  subtitle,
  action,
  legend,
  children,
  empty,
  className = "",
  bodyClassName = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  legend?: ReactNode;
  children: ReactNode;
  empty?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`card flex flex-col overflow-hidden ${className}`}>
      <header className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      {legend && <div className="flex flex-wrap items-center gap-3 px-4 pb-2">{legend}</div>}
      <div className={`min-w-0 flex-1 px-2 pb-3 ${bodyClassName}`}>
        {empty ? <div className="flex h-40 items-center justify-center text-sm text-muted">{empty === true ? "No data yet" : empty}</div> : children}
      </div>
    </section>
  );
}

export function ChartLegend({
  items,
}: {
  items: { label: string; color: string; shape?: "line" | "square" }[];
}) {
  return (
    <>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-xs text-muted">
          <span
            aria-hidden="true"
            className={item.shape === "line" ? "h-0.5 w-3 rounded-full" : "h-2.5 w-2.5 rounded-sm"}
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------- bar chart */

export function BarChart({
  data,
  height = 180,
  format = (value: number) => value.toFixed(0),
  ariaLabel,
  showSecondary = true,
}: {
  data: SeriesPoint[];
  height?: number;
  format?: (value: number) => string;
  ariaLabel: string;
  showSecondary?: boolean;
}) {
  const max = useMemo(() => {
    const values = data.flatMap((point) => (showSecondary && point.secondary !== undefined ? [point.value, point.secondary] : [point.value]));
    return Math.max(1, ...values.map((value) => Math.abs(value)));
  }, [data, showSecondary]);

  if (data.length === 0) return null;

  return (
    <figure className="w-full">
      <figcaption className="sr-only">{ariaLabel}</figcaption>
      <div className="flex items-end gap-1.5" style={{ height }} role="img" aria-label={ariaLabel}>
        {data.map((point) => {
          const expenseHeight = (Math.abs(point.value) / max) * (height - 24);
          const incomeHeight =
            point.secondary !== undefined ? (Math.abs(point.secondary) / max) * (height - 24) : 0;
          return (
            <div key={point.label} className="group flex h-full flex-1 flex-col justify-end gap-0.5">
              <div className="flex flex-1 items-end justify-center gap-0.5">
                {point.secondary !== undefined && (
                  <div
                    className="w-2.5 rounded-t-[3px] bg-income/80 transition-opacity group-hover:opacity-100 sm:w-3.5"
                    style={{ height: `${Math.max(2, incomeHeight)}px` }}
                    title={`${point.label} in: ${format(point.secondary)}`}
                  />
                )}
                <div
                  className="w-2.5 rounded-t-[3px] bg-primary/85 transition-opacity group-hover:opacity-100 sm:w-3.5"
                  style={{ height: `${Math.max(2, expenseHeight)}px` }}
                  title={`${point.label} out: ${format(point.value)}`}
                />
              </div>
              <span className="truncate text-center text-[10px] text-muted">{point.label}</span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

/* ----------------------------------------------------------------- line / area */

export function LineChart({
  data,
  height = 180,
  format = (value: number) => value.toFixed(0),
  ariaLabel,
  tone = "primary",
  fill = true,
  formatLabel,
}: {
  data: SeriesPoint[];
  height?: number;
  format?: (value: number) => string;
  ariaLabel: string;
  tone?: keyof typeof TOKEN;
  fill?: boolean;
  formatLabel?: (point: SeriesPoint) => string;
}) {
  const gradientId = useId();
  const values = data.map((point) => point.value);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const step = data.length > 1 ? 100 / (data.length - 1) : 100;

  const coords = data.map((point, index) => ({
    x: index * step,
    y: 100 - ((point.value - min) / span) * 100,
    point,
  }));

  const line = coords.map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const area = `${line} L100,100 L0,100 Z`;

  if (data.length === 0) return null;

  return (
    <figure className="w-full">
      <figcaption className="sr-only">{ariaLabel}</figcaption>
      <div role="img" aria-label={ariaLabel} className="relative w-full" style={{ height }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
          {fill && (
            <>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={TOKEN[tone]} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={TOKEN[tone]} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#${gradientId})`} />
            </>
          )}
          <path d={line} fill="none" stroke={TOKEN[tone]} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          {coords.map(({ x, y, point }) => (
            <circle key={point.label} cx={x} cy={y} r="1.6" fill={TOKEN[tone]}>
              <title>{formatLabel ? formatLabel(point) : `${point.label}: ${format(point.value)}`}</title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </figure>
  );
}

/* ---------------------------------------------------------------------- donut */

export interface Slice {
  label: string;
  value: number;
  color?: string;
}

export function DonutChart({
  slices,
  size = 168,
  thickness = 22,
  centerLabel,
  centerValue,
  ariaLabel,
  colors,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  ariaLabel: string;
  colors?: readonly string[];
}) {
  const palette = colors ?? [
    TOKEN.primary,
    TOKEN.accent,
    TOKEN.transfer,
    TOKEN.warning,
    TOKEN.expense,
    TOKEN.income,
    TOKEN.muted,
  ];
  const total = slices.reduce((sum, slice) => sum + Math.abs(slice.value), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const segments = slices
    .filter((slice) => Math.abs(slice.value) > 0)
    .map((slice, index) => {
      const fraction = Math.abs(slice.value) / (total || 1);
      const dash = fraction * circumference;
      const segment = {
        ...slice,
        color: slice.color ?? palette[index % palette.length],
        dash,
        offset,
        percent: fraction * 100,
      };
      offset += dash;
      return segment;
    });

  return (
    <figure className="flex items-center gap-4">
      <figcaption className="sr-only">{ariaLabel}</figcaption>
      <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={ariaLabel}>
        <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={TOKEN.grid} strokeWidth={thickness} opacity={0.55} />
          {segments.map((segment) => (
            <circle
              key={segment.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={thickness}
              strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
              strokeDashoffset={-segment.offset}
              strokeLinecap="butt"
            >
              <title>{`${segment.label}: ${segment.percent.toFixed(1)}%`}</title>
            </circle>
          ))}
        </svg>
        {(centerValue || centerLabel) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {centerValue && <span className="tabular text-title font-semibold text-ink">{centerValue}</span>}
            {centerLabel && <span className="mt-0.5 text-[11px] text-muted">{centerLabel}</span>}
          </div>
        )}
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {segments.slice(0, 7).map((segment) => (
          <li key={segment.label} className="flex items-center gap-2 text-xs">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }} />
            <span className="min-w-0 flex-1 truncate text-ink-soft">{segment.label}</span>
            <span className="tabular shrink-0 text-muted">{segment.percent.toFixed(0)}%</span>
          </li>
        ))}
        {segments.length > 7 && <li className="text-xs text-muted">+{segments.length - 7} more</li>}
      </ul>
    </figure>
  );
}

/* --------------------------------------------------------------- horizontal bars */

export function RankedBars({
  items,
  format,
  ariaLabel,
  tone = "primary",
  limit = 6,
}: {
  items: { label: string; value: number; caption?: string }[];
  format: (value: number) => string;
  ariaLabel: string;
  tone?: keyof typeof TOKEN;
  limit?: number;
}) {
  const rows = items.slice(0, limit);
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)));
  if (rows.length === 0) return null;

  return (
    <figure className="w-full">
      <figcaption className="sr-only">{ariaLabel}</figcaption>
      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="min-w-0 truncate font-medium text-ink">{row.label}</span>
              <span className="tabular shrink-0 text-muted">
                {format(row.value)}
                {row.caption && <span className="ml-1 text-faint">{row.caption}</span>}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-smooth"
                style={{ width: `${(Math.abs(row.value) / max) * 100}%`, backgroundColor: TOKEN[tone] }}
              />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Tiny inline trend line for stat cards. */
export function Sparkline({ values, className = "", tone = "primary" }: { values: number[]; className?: string; tone?: keyof typeof TOKEN }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => `${(index / (values.length - 1)) * 100},${22 - ((value - min) / span) * 22}`)
    .join(" ");

  return (
    <svg viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true" className={`h-6 w-20 ${className}`}>
      <polyline points={points} fill="none" stroke={TOKEN[tone]} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
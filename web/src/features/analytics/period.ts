/**
 * Period arithmetic.
 *
 * Everything here is local-time and honours a configurable financial-month start
 * day, so budgets and reports line up with how the user thinks about "a month".
 */
import {
  addDays,
  addMonths,
  daysBetween,
  daysInMonth,
  nextMonthStart,
  startOfMonth,
  toDate,
  toDateKey,
} from "../../design/format";

export type PeriodKind =
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year"
  | "custom"
  | "all"
  | "mtd"
  | "ytd";

export interface DateRange {
  start: Date;
  end: Date;
}

export interface Period {
  kind: PeriodKind;
  /** Anchor date; the range is derived from it plus the month-start day. */
  anchor: Date;
  monthStartDay: number;
  /** Only used when `kind` is `custom`. */
  custom?: DateRange;
}

/**
 * The financial year begins on `monthStartDay` of January in the anchor's calendar
 * year (or the previous one, if the anchor falls before that date). Backs the
 * `ytd` and `quarter` periods so both respect the user's fiscal calendar.
 */
export function financialYearStart(date: Date, monthStartDay: number): Date {
  const year = toDate(date).getFullYear();
  const candidate = new Date(year, 0, monthStartDay);
  return toDate(date) >= candidate ? candidate : new Date(year - 1, 0, monthStartDay);
}

/** Inclusive start, exclusive end. Half-open ranges avoid end-of-day drift. */
export function periodRange(period: Period): DateRange | null {
  const { kind, anchor, monthStartDay } = period;
  if (kind === "all") return null;

  if (kind === "custom") {
    if (!period.custom) return null;
    const start = new Date(period.custom.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(period.custom.end);
    end.setHours(0, 0, 0, 0);
    return { start, end: addDays(end, 1) };
  }

  if (kind === "day") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    return { start, end: addDays(start, 1) };
  }

  if (kind === "week") {
    // Weeks start on Monday.
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    const offset = (start.getDay() + 6) % 7;
    const monday = addDays(start, -offset);
    return { start: monday, end: addDays(monday, 7) };
  }

  if (kind === "month" || kind === "mtd") {
    const start = startOfMonth(anchor, monthStartDay);
    return { start, end: nextMonthStart(start) };
  }

  if (kind === "quarter") {
    const fyStart = financialYearStart(anchor, monthStartDay);
    const elapsed = monthsBetween(fyStart, startOfMonth(anchor, monthStartDay));
    const quarterStart = addMonths(fyStart, Math.floor(elapsed / 3) * 3);
    return { start: quarterStart, end: addMonths(quarterStart, 3) };
  }

  if (kind === "year") {
    const start = startOfMonth(anchor, monthStartDay);
    return { start, end: addMonths(start, 12) };
  }

  // ytd - from the start of the current financial year to the end of the month.
  const fyStart = financialYearStart(anchor, monthStartDay);
  return { start: fyStart, end: nextMonthStart(addMonths(fyStart, 12)) };
}

/** `1 Jan – 31 Jan` style label used in headers. */
export function rangeLabel(range: DateRange | null, kind: PeriodKind): string {
  if (!range) return "All time";
  const sameDay = toDateKey(range.start) === toDateKey(addDays(range.end, -1));
  if (kind === "day") {
    return range.start.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  }
  if (sameDay) {
    return range.start.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  }
  const start = range.start.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const end = addDays(range.end, -1).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${start} – ${end}`;
}

export function inRange(date: Date | string, range: DateRange | null): boolean {
  if (!range) return true;
  const value = typeof date === "string" ? new Date(date) : date;
  return value >= range.start && value < range.end;
}

/** Steps the anchor by one period, in the given direction. */
export function shiftPeriod(period: Period, direction: -1 | 1): Period {
  const anchor = period.anchor;
  switch (period.kind) {
    case "day":
      return { ...period, anchor: addDays(anchor, direction) };
    case "week":
      return { ...period, anchor: addDays(anchor, direction * 7) };
    case "month":
    case "mtd":
    case "quarter":
      return { ...period, anchor: addMonths(anchor, direction) };
    case "year":
    case "ytd":
      return { ...period, anchor: addMonths(anchor, direction * 12) };
    case "custom":
    case "all":
      return period;
  }
}

/** Ordered buckets, each with its own label and bounds. */
export interface Bucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
}

export function buildBuckets(period: Period, count = 12): Bucket[] {
  const range = periodRange(period);
  const buckets: Bucket[] = [];
  if (!range) return buckets;

  switch (period.kind) {
    case "day":
    case "week": {
      const day = daysBetween(range.start, addDays(range.end, -1)) + 1;
      const step = Math.max(1, Math.ceil(day / count));
      for (let cursor = range.start; cursor < range.end; cursor = addDays(cursor, step)) {
        const end = addDays(cursor, step);
        buckets.push({
          key: toDateKey(cursor),
          label:
            step === 1
              ? cursor.toLocaleDateString(undefined, { day: "numeric", month: "short" })
              : `${cursor.toLocaleDateString(undefined, { day: "numeric" })}–${addDays(end, -1).toLocaleDateString(undefined, { day: "numeric" })}`,
          start: new Date(cursor),
          end,
        });
      }
      break;
    }
    case "year":
    case "ytd": {
      const start = startOfMonth(range.start, period.monthStartDay);
      for (let i = 0; i < count; i += 1) {
        const cursor = addMonths(start, i);
        buckets.push({
          key: `${cursor.getFullYear()}`,
          label: cursor.toLocaleDateString(undefined, { month: "short" }),
          start: cursor,
          end: addMonths(cursor, 1),
        });
      }
      break;
    }
    default: {
      const start = startOfMonth(range.start, period.monthStartDay);
      const total = monthsBetween(range.start, range.end);
      const step = Math.max(1, Math.ceil(total / count));
      for (let cursor = start; cursor < range.end; cursor = addMonths(cursor, step)) {
        const next = addMonths(cursor, step);
        buckets.push({
          key: `${cursor.getFullYear()}-${`${cursor.getMonth() + 1}`.padStart(2, "0")}`,
          label:
            step === 1
              ? cursor.toLocaleDateString(undefined, { month: "short" })
              : `${cursor.toLocaleDateString(undefined, { month: "short" })} ${
                  addMonths(cursor, step - 1).toLocaleDateString(undefined, { month: "short" })
                }`,
          start: new Date(cursor),
          end: next,
        });
      }
    }
  }
  return buckets;
}

export function monthsBetween(start: Date, end: Date): number {
  const from = startOfMonth(toDate(start)).getTime();
  const to = startOfMonth(toDate(end)).getTime();
  return Math.round((to - from) / (30.44 * 86_400_000));
}

/** Calendar grid for a month, Monday-first, padded to whole weeks. */
export function calendarGrid(month: Date, monthStartDay = 1): Date[] {
  const first = startOfMonth(month, monthStartDay);
  const offset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -offset);
  const cells = daysInMonth(first.getFullYear(), first.getMonth()) + offset;
  const total = Math.ceil(cells / 7) * 7;
  return Array.from({ length: total }, (_, index) => addDays(gridStart, index));
}

/** Advances `nextRunAt` by one cadence step. Mirrors `next_occurrence` on the server. */
export function advanceOccurrence(nextRunAt: Date, frequency: string): Date {
  switch (frequency) {
    case "daily":
      return addDays(nextRunAt, 1);
    case "weekly":
      return addDays(nextRunAt, 7);
    case "monthly":
      return addMonths(nextRunAt, 1);
    case "quarterly":
      return addMonths(nextRunAt, 3);
    case "yearly":
      return addMonths(nextRunAt, 12);
    default:
      return addMonths(nextRunAt, 1);
  }
}

/** Due date for installment part `index` (0-based) of a plan. */
export function installmentDueDate(startDate: Date, frequency: string, index: number): Date {
  const step = frequency === "weekly" ? 0 : frequency === "quarterly" ? 3 : 1;
  return step === 0 ? addDays(startDate, index * 7) : addMonths(startDate, index * step);
}

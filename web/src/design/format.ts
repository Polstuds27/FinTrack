/**
 * Presentation helpers for money and dates.
 *
 * All amounts in the app are plain numbers (Decimal on the wire). Formatting lives
 * here so sign, currency symbol, precision and compactness stay consistent.
 */

export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "PHP",
  "JPY",
  "AUD",
  "CAD",
  "CHF",
  "SGD",
  "MYR",
  "IDR",
  "THB",
  "VND",
  "INR",
  "CNY",
  "HKD",
  "NZD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "AED",
  "SAR",
  "ZAR",
  "BRL",
  "MXN",
  "TRY",
] as const;

const SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  PHP: "₱",
  JPY: "¥",
  CNY: "¥",
  KRW: "₩",
  INR: "₹",
  VND: "₫",
  THB: "฿",
  IDR: "Rp",
  MYR: "RM",
  SGD: "S$",
  HKD: "HK$",
  AUD: "A$",
  CAD: "C$",
  NZD: "NZ$",
  CHF: "CHF",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  PLN: "zł",
  CZK: "Kč",
  AED: "د.إ",
  SAR: "﷼",
  ZAR: "R",
  BRL: "R$",
  MXN: "MX$",
  TRY: "₺",
  RUB: "₽",
};

export function currencySymbol(currency: string): string {
  return SYMBOLS[currency?.toUpperCase()] ?? `${currency.toUpperCase()} `;
}

function groupDigits(value: string, fractionDigits: number): string {
  const [whole = "0", fraction] = value.split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = sign ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const tail = fraction ? `.${fraction.slice(0, fractionDigits)}` : "";
  return `${sign}${grouped}${tail}`;
}

/** `1234.5, USD` -> `$1,234.50`. Zero-decimal currencies drop the cents. */
export function formatMoney(
  amount: number | string | null | undefined,
  currency = "USD",
  options: { showSymbol?: boolean; signed?: boolean; compact?: boolean; decimals?: number } = {},
): string {
  const { showSymbol = true, signed = false, compact = false, decimals } = options;
  const value = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  if (!Number.isFinite(value)) return showSymbol ? `${currencySymbol(currency)}0.00` : "0.00";

  const code = currency.toUpperCase();
  const fractionDigits = decimals ?? (code === "JPY" || code === "VND" || code === "KRW" ? 0 : 2);

  if (compact && Math.abs(value) >= 1000) {
    const units: [number, string][] = [
      [1e12, "T"],
      [1e9, "B"],
      [1e6, "M"],
      [1e3, "K"],
    ];
    for (const [size, suffix] of units) {
      if (Math.abs(value) >= size) {
        const scaled = value / size;
        const text = Math.abs(scaled) >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
        const sign = scaled < 0 ? "-" : signed && value > 0 ? "+" : "";
        return `${sign}${showSymbol ? currencySymbol(code) : ""}${text}${suffix}`;
      }
    }
  }

  const sign = value < 0 ? "-" : signed && value > 0 ? "+" : "";
  const body = groupDigits(Math.abs(value).toFixed(fractionDigits), fractionDigits);
  return `${sign}${showSymbol ? currencySymbol(code) : ""}${body}`;
}

/** Splits a formatted amount so the currency can be de-emphasised visually. */
export function splitMoney(
  amount: number | string,
  currency = "USD",
): { symbol: string; value: string } {
  const text = formatMoney(amount, currency, { showSymbol: false });
  return { symbol: currencySymbol(currency), value: text };
}

export function formatPercent(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(fractionDigits)}%`;
}

/** Signed cash-flow string used in summaries: `+$1,234.50`. */
export function formatFlow(amount: number, currency = "USD"): string {
  return formatMoney(amount, currency, { signed: true });
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/* ------------------------------------------------------------------------ dates */
export type DateLike = Date | string | number;

export function toDate(value: DateLike): Date {
  return value instanceof Date ? value : new Date(value);
}

/** `YYYY-MM-DD` in local time (never UTC - that shifts the day). */
export function toDateKey(value: DateLike): string {
  const date = toDate(value);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`. */
export function toDateTimeInput(value: DateLike): string {
  const date = toDate(value);
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${toDateKey(date)}T${hours}:${minutes}`;
}

export function fromDateTimeInput(value: string): string {
  return new Date(value).toISOString();
}

export function todayKey(): string {
  return toDateKey(new Date());
}

/** `Today`, `Yesterday`, `Mon 12 Oct` - the list density users expect. */
export function formatRelativeDay(value: DateLike, reference: DateLike = new Date()): string {
  const date = toDate(value);
  const ref = toDate(reference);
  const days = daysBetween(toDateKey(ref), toDateKey(date));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days === -1) return "Tomorrow";
  const sameYear = date.getFullYear() === ref.getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function formatDate(value: DateLike, style: "short" | "medium" | "long" = "medium"): string {
  const date = toDate(value);
  if (style === "short") return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (style === "long") {
    return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  }
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * User-facing clock times render in Asia/Manila (UTC+08:00, Philippine Time).
 * The server stores timezone-aware UTC; the IANA name — never a hardcoded +8
 * offset — converts correctly across DST-free Manila and travelling devices.
 * Date-only values intentionally stay device-local: they are calendar days,
 * not instants, and a timezone shift could move them to the wrong date.
 */
export const DISPLAY_TIME_ZONE = "Asia/Manila";

export function formatDateTime(value: DateLike): string {
  return toDate(value).toLocaleString(undefined, {
    timeZone: DISPLAY_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(value: DateLike): string {
  return toDate(value).toLocaleTimeString(undefined, {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: DateLike, b: DateLike): number {
  const start = toDateKey(a);
  const end = toDateKey(b);
  const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
  return Math.round(ms / 86_400_000);
}

export function addDays(value: DateLike, days: number): Date {
  const date = toDate(value);
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(value: DateLike, months: number): Date {
  const date = toDate(value);
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  return new Date(
    target.getFullYear(),
    target.getMonth(),
    Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())),
  );
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function startOfMonth(value: DateLike, monthStartDay = 1): Date {
  const date = toDate(value);
  const day = date.getDate();
  if (day >= monthStartDay) {
    return new Date(date.getFullYear(), date.getMonth(), monthStartDay);
  }
  const previous = new Date(date.getFullYear(), date.getMonth(), 1);
  previous.setMonth(previous.getMonth() - 1);
  return new Date(previous.getFullYear(), previous.getMonth(), monthStartDay);
}

export function endOfMonth(value: DateLike, monthStartDay = 1): Date {
  return addDays(nextMonthStart(startOfMonth(value, monthStartDay)), -1);
}

/** First day of the period following `start`, clamping to a valid day-of-month. */
export function nextMonthStart(start: DateLike): Date {
  const date = toDate(start);
  const target = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), daysInMonth(target.getFullYear(), target.getMonth())));
}

export function monthKey(value: DateLike): string {
  const date = toDate(value);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
}

export function formatMonth(value: DateLike, style: "short" | "long" = "long"): string {
  const date = toDate(value);
  return date.toLocaleDateString(undefined, {
    month: style === "long" ? "long" : "short",
    year: "numeric",
  });
}

export function formatMonthShort(value: DateLike): string {
  return toDate(value).toLocaleDateString(undefined, { month: "short" });
}

export function isSameDay(a: DateLike, b: DateLike): boolean {
  return toDateKey(a) === toDateKey(b);
}

export function isToday(value: DateLike): boolean {
  return isSameDay(value, new Date());
}

/** `-4 days ago`, `just now`, `in 2 hours`. */
export function formatRelativeTime(value: DateLike, reference: DateLike = new Date()): string {
  const date = toDate(value);
  const ref = toDate(reference);
  const diffMs = date.getTime() - ref.getTime();
  const abs = Math.abs(diffMs);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000_000],
    ["month", 2_592_000_000],
    ["week", 604_800_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "minute") {
      return formatter.format(Math.round(diffMs / ms), unit);
    }
  }
  return "just now";
}

export function parseNumber(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}
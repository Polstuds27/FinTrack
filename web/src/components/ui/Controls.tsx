import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { currencySymbol, parseNumber } from "../../design/format";
import { IconButton } from "./Button";

/* -------------------------------------------------------------- AmountInput */

/**
 * The single most-used control in a finance app. Large, numeric-keyboard friendly,
 * and visually dominant - the amount is the point of the form.
 */
export function AmountInput({
  value,
  onChange,
  currency = "USD",
  tone = "default",
  autoFocus,
  id,
  size = "lg",
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  currency?: string;
  tone?: "default" | "income" | "expense";
  autoFocus?: boolean;
  id?: string;
  size?: "md" | "lg";
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => (value ? value.toFixed(2) : ""));
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setText(value ? value.toFixed(2) : "");
  }, [value]);

  const toneClass =
    tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : "text-ink";
  const textSize = size === "lg" ? "text-display-sm" : "text-title";

  return (
    <div className="flex items-baseline gap-1.5 border-b-2 border-line pb-1 transition-colors focus-within:border-primary">
      <span aria-hidden="true" className={`${textSize} font-medium text-muted`}>
        {currencySymbol(currency)}
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label="Amount"
        value={text}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          setText(value ? value.toFixed(2) : "");
        }}
        onChange={(event) => {
          const next = event.target.value.replace(/[^0-9.]/g, "");
          if ((next.match(/\./g) ?? []).length > 1) return;
          setText(next);
          onChange(parseNumber(next));
        }}
        placeholder="0.00"
        className={`tabular w-full min-w-0 bg-transparent font-semibold tracking-tight outline-none ${textSize} ${toneClass} placeholder:text-faint`}
      />
      {/* Always mounted, visibility-toggled: mounting the button on the first
          digit reflows this row, and several Android keyboards dismiss the
          moment the focused input shifts underneath them. Disabled while
          hidden so it never takes focus or enters the dialog tab trap. */}
      <span className={`shrink-0 ${text && !disabled ? "" : "invisible"}`} aria-hidden="true">
        <IconButton
          label="Clear amount"
          size="sm"
          disabled={!text || disabled}
          onClick={() => { setText(""); onChange(0); }}
          tabIndex={-1}
        >
          <span aria-hidden="true" className="text-xs font-medium text-muted">
            Clear
          </span>
        </IconButton>
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------------- Tabs */

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  icon?: ReactNode;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  size = "md",
  className = "",
  ariaLabel,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={`scroll-area -mx-1 flex gap-1 px-1 ${className}`}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg font-medium transition-colors ${
              size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-1.5 text-sm"
            } ${
              active
                ? "bg-primary-soft-bg text-primary"
                : "text-muted hover:bg-surface-sunken hover:text-ink"
            }`}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span className={`tabular text-xs ${active ? "text-primary" : "text-faint"}`}>{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------- SegmentedControl */

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  tone?: "default" | "income" | "expense" | "transfer";
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
  className = "",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (id: T) => void;
  size?: "sm" | "md";
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`grid gap-1 rounded-xl bg-surface-sunken p-1 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.id === value;
        const toneClass =
          active && option.tone === "income"
            ? "bg-income-soft text-income"
            : active && option.tone === "expense"
              ? "bg-expense-soft text-expense"
              : active && option.tone === "transfer"
                ? "bg-transfer-soft text-transfer"
                : active
                  ? "bg-surface text-ink shadow-card"
                  : "text-muted hover:text-ink";
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.id)}
            className={`flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors ${
              size === "sm" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"
            } ${toneClass}`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Dropdown */

export interface DropdownItem {
  id: string;
  label: string;
  icon?: ReactNode;
  tone?: "default" | "danger";
  onSelect: () => void;
  disabled?: boolean;
}

export function Dropdown({
  trigger,
  items,
  align = "end",
  label,
}: {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: "start" | "end";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Fixed positioning escapes `overflow-hidden` ancestors (e.g. the rounded
  // group cards on the Accounts page, which used to clip the menu invisibly).
  const [placement, setPlacement] = useState<{ top?: number; bottom?: number; left?: number; right?: number }>({});

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = rect.bottom + 4;
      // Flip upward when there is no room below; menus are short (~200px).
      const openUp = below + 208 > window.innerHeight && rect.top - 208 > 0;
      setPlacement(
        align === "end"
          ? {
              right: Math.max(8, window.innerWidth - rect.right),
              ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: below }),
            }
          : {
              left: Math.max(8, rect.left),
              ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: below }),
            },
      );
    };
    place();
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // A fixed menu can't follow a scroll, so dismiss instead of stranding it.
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onScroll);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open, align]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((prev) => !prev)}
        className="icon-btn"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          style={placement}
          className="fixed z-50 min-w-44 animate-rise rounded-xl border border-line bg-surface py-1 shadow-overlay"
        >
          {items.map((item) => (
            <button
              key={item.id}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-sunken disabled:opacity-50 ${
                item.tone === "danger" ? "text-expense" : "text-ink"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Select-like */

export function OptionGrid<T extends string>({
  options,
  value,
  onChange,
  columns = 2,
  renderIcon,
}: {
  options: { id: T; label: string }[];
  value: T | null;
  onChange: (id: T) => void;
  columns?: number;
  renderIcon?: (id: T) => ReactNode;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
              active
                ? "border-primary bg-primary-soft-bg font-medium text-primary"
                : "border-line bg-surface text-ink hover:border-line-strong"
            }`}
          >
            {renderIcon?.(option.id)}
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Collapsible({
  summary,
  children,
  defaultOpen = false,
  className = "",
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 text-sm font-medium text-ink"
      >
        {summary}
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="animate-rise pt-3">{children}</div>}
    </div>
  );
}
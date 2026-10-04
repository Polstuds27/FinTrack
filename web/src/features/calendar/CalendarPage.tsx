/**
 * Calendar.
 *
 * Month grid plus a day sheet: recorded transactions sit alongside what's still
 * owed — recurring occurrences, installment parts, debt due dates and goal
 * deadlines — all projected locally, so a month ahead is visible offline (§19).
 */
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  CreditCard,
  Landmark,
  Plus,
  Repeat,
  Target,
} from "lucide-react";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  IconButton,
  PageHeader,
  PeriodStepper,
} from "../../components/ui";
import { formatMoney, toDateKey, isToday, toDate, addDays } from "../../design/format";
import { calendarGrid } from "../../features/analytics/period";
import { calendarEvents, type CalendarEvent } from "../analytics/engine";
import { useLocalData } from "../analytics/useLocalData";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const KIND_ICON: Record<CalendarEvent["kind"], typeof Repeat> = {
  transaction: CalendarIcon,
  recurring: Repeat,
  installment: CreditCard,
  debt: Landmark,
  goal: Target,
};

export function CalendarPage() {
  const { lookups } = useLocalData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const monthKey = params.get("month") ?? toDateKey(new Date()).slice(0, 7);
  const selectedKey = params.get("day");

  const monthAnchor = useMemo(() => new Date(`${monthKey}-01T12:00:00`), [monthKey]);
  const cells = useMemo(() => calendarGrid(monthAnchor, 1), [monthAnchor]);

  const events = useMemo(() => {
    if (cells.length === 0) return new Map<string, CalendarEvent[]>();
    return calendarEvents(lookups, cells[0], addDays(cells[cells.length - 1], 1), {
      horizonDays: 0,
    });
  }, [lookups, cells]);

  const selected = selectedKey ? (events.get(selectedKey) ?? []) : [];

  function goMonth(delta: number) {
    const next = new Date(monthAnchor);
    next.setMonth(next.getMonth() + delta);
    const key = `${next.getFullYear()}-${`${next.getMonth() + 1}`.padStart(2, "0")}`;
    const nextParams = new URLSearchParams(params);
    nextParams.set("month", key);
    setParams(nextParams, { replace: true });
  }

  function selectDay(key: string) {
    const nextParams = new URLSearchParams(params);
    if (selectedKey === key) nextParams.delete("day");
    else nextParams.set("day", key);
    setParams(nextParams, { replace: true });
  }

  const monthLabel = monthAnchor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const eventCount = [...events.values()].reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Calendar"
        subtitle={eventCount > 0 ? `${eventCount} entries this month` : "Nothing scheduled"}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => navigate("/transactions/new")}
          >
            Add
          </Button>
        }
        tabs={
          <PeriodStepper
            label={monthLabel}
            onPrevious={() => goMonth(-1)}
            onNext={() => goMonth(1)}
            onToday={() => {
              const nextParams = new URLSearchParams(params);
              nextParams.set("month", toDateKey(new Date()).slice(0, 7));
              nextParams.delete("day");
              setParams(nextParams, { replace: true });
            }}
          />
        }
      />

      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-7 border-b border-line bg-surface-sunken">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="px-1 py-2 text-center text-[11px] font-medium tracking-wide text-muted uppercase"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((date) => {
            const key = toDateKey(date);
            const dayEvents = events.get(key) ?? [];
            const inMonth = date.getMonth() === monthAnchor.getMonth();
            const today = isToday(date);
            const active = selectedKey === key;
            const income = dayEvents.filter((event) => event.tone === "income").length;
            const expense = dayEvents.filter((event) => event.tone === "expense").length;

            return (
              <button
                key={key}
                type="button"
                onClick={() => selectDay(key)}
                aria-pressed={active}
                aria-label={`${date.toDateString()}, ${dayEvents.length} entries`}
                className={`relative flex min-h-[4.25rem] flex-col items-stretch gap-1 border-r border-b border-line p-1.5 text-left transition-colors last:border-r-0 hover:bg-surface-sunken sm:min-h-[5.5rem] ${
                  inMonth ? "" : "opacity-40"
                } ${active ? "bg-primary-soft-bg" : ""}`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    today
                      ? "bg-primary text-primary-fg"
                      : active
                        ? "text-primary"
                        : "text-ink-soft"
                  }`}
                >
                  {date.getDate()}
                </span>

                <span className="flex flex-wrap gap-1">
                  {dayEvents.slice(0, 4).map((event) => {
                    const Icon = KIND_ICON[event.kind];
                    return (
                      <span
                        key={event.key}
                        aria-hidden="true"
                        className={`flex h-4 w-4 items-center justify-center rounded ${
                          event.tone === "income"
                            ? "bg-income-soft text-income"
                            : event.tone === "expense"
                              ? "bg-expense-soft text-expense"
                              : event.tone === "transfer"
                                ? "bg-transfer-soft text-transfer"
                                : "bg-surface-sunken text-muted"
                        }`}
                      >
                        <Icon className="h-2.5 w-2.5" />
                      </span>
                    );
                  })}
                  {dayEvents.length > 4 && (
                    <span className="text-[10px] text-muted">+{dayEvents.length - 4}</span>
                  )}
                </span>

                {(income > 0 || expense > 0) && (
                  <span className="tabular mt-auto flex justify-between text-[10px] leading-tight">
                    <span className="text-income">{income > 0 ? `+${income}` : ""}</span>
                    <span className="text-expense">{expense > 0 ? `−${expense}` : ""}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">
              {selectedKey
                ? toDate(selectedKey).toLocaleDateString(undefined, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })
                : "Pick a day"}
            </h2>
            <p className="text-xs text-muted">
              {selectedKey
                ? `${selected.length} ${selected.length === 1 ? "entry" : "entries"}`
                : "Tap any date to see what happened and what's due."}
            </p>
          </div>
          {selectedKey && (
            <IconButton label="Close day" onClick={() => selectDay(selectedKey)}>
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
          )}
        </div>

        {!selectedKey ? (
          <EmptyState
            compact
            icon={<CalendarIcon className="h-6 w-6" />}
            title="No day selected"
            description="Recorded transactions appear as dots; bills, installments, debts and goal dates appear as icons on the days they fall."
          />
        ) : selected.length === 0 ? (
          <EmptyState
            compact
            icon={<CalendarIcon className="h-6 w-6" />}
            title="Nothing on this day"
            description="Add a transaction, or switch on a recurring rule and its occurrences will show up here."
            action={
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => navigate("/transactions/new")}
              >
                Add an entry
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {selected.map((event) => {
              const Icon = KIND_ICON[event.kind];
              return (
                <li key={event.key}>
                  <button
                    type="button"
                    disabled={!event.transactionId}
                    onClick={() =>
                      event.transactionId && navigate(`/transactions/${event.transactionId}`)
                    }
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left enabled:hover:bg-surface-sunken"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                          event.tone === "income"
                            ? "bg-income-soft text-income"
                            : event.tone === "expense"
                              ? "bg-expense-soft text-expense"
                              : event.tone === "transfer"
                                ? "bg-transfer-soft text-transfer"
                                : "bg-surface-sunken text-muted"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">{event.title}</span>
                        <span className="block text-xs capitalize text-muted">{event.kind}</span>
                      </span>
                    </span>
                    <span
                      className={`tabular shrink-0 text-sm font-semibold ${
                        event.tone === "income"
                          ? "text-income"
                          : event.tone === "expense"
                            ? "text-expense"
                            : "text-ink"
                      }`}
                    >
                      {event.tone === "income" ? "+" : event.tone === "expense" ? "−" : ""}
                      {formatMoney(event.amount, event.currency)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Alert tone="info" title="Upcoming items are projected, not recorded">
        Bills and installments are drawn straight from their schedules. They become real
        transactions only when they're actually paid, so the calendar never claims money has
        moved before it has.
      </Alert>
    </div>
  );
}

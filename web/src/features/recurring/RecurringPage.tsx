/**
 * Recurring rules.
 *
 * The schedule that will produce future transactions: what repeats, how often,
 * and when it next runs. Each row is explicit about its status so a paused rule
 * can never be mistaken for one that is about to charge you (§21).
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Pause,
  Play,
  Plus,
  Repeat,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  SegmentedControl,
} from "../../components/ui";
import type { LocalRecurring } from "../../db/types";
import { formatMoney, formatRelativeDay } from "../../design/format";
import { categoryIcon } from "../../design/icons";
import { useLocalData } from "../analytics/useLocalData";
import { updateRecurring } from "../../db/repositories";

type Filter = "all" | "expense" | "income" | "paused";

const FREQUENCY_LABEL: Record<LocalRecurring["frequency"], string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function RecurringPage() {
  const { lookups, dataset, ready } = useLocalData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const ordered = [...dataset.recurring].sort((a, b) =>
      a.next_run_at.localeCompare(b.next_run_at),
    );
    if (filter === "all") return ordered;
    if (filter === "paused") return ordered.filter((row) => !row.enabled);
    return ordered.filter((row) => row.type === filter);
  }, [dataset.recurring, filter]);

  const activeCount = dataset.recurring.filter((row) => row.enabled).length;
  const pausedCount = dataset.recurring.length - activeCount;

  const monthlyOut = dataset.recurring
    .filter((row) => row.enabled && row.type === "expense" && row.frequency === "monthly")
    .reduce((sum, row) => sum + row.amount, 0);
  const monthlyIn = dataset.recurring
    .filter((row) => row.enabled && row.type === "income" && row.frequency === "monthly")
    .reduce((sum, row) => sum + row.amount, 0);

  const currency = lookups.dataset.baseCurrency;

  async function toggle(rule: LocalRecurring) {
    await updateRecurring(rule.id, { enabled: !rule.enabled });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Recurring"
        subtitle={`${activeCount} active${pausedCount > 0 ? ` · ${pausedCount} paused` : ""}`}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => navigate("/recurring/new")}
          >
            New rule
          </Button>
        }
        tabs={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              size="sm"
              options={[
                { id: "all", label: `All (${dataset.recurring.length})` },
                { id: "expense", label: "Bills", icon: <ArrowDownRight className="h-3.5 w-3.5" /> },
                { id: "income", label: "Income", icon: <ArrowUpRight className="h-3.5 w-3.5" /> },
                { id: "paused", label: `Paused (${pausedCount})` },
              ]}
              value={filter}
              onChange={setFilter}
              ariaLabel="Recurring filter"
            />
          </div>
        }
      />

      {dataset.recurring.length > 0 && (
        <Card>
          <div className="grid grid-cols-2 divide-x divide-line">
            <div className="px-4 py-3.5">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">Monthly out</p>
              <p className="tabular mt-0.5 text-title font-semibold text-expense">
                {formatMoney(monthlyOut, currency)}
              </p>
            </div>
            <div className="px-4 py-3.5">
              <p className="text-xs font-medium tracking-wide text-muted uppercase">Monthly in</p>
              <p className="tabular mt-0.5 text-title font-semibold text-income">
                {formatMoney(monthlyIn, currency)}
              </p>
            </div>
          </div>
          <div className="border-t border-line px-4 py-2.5 text-xs text-muted">
            Recurring rules describe your schedule. Occurrences become transactions in your
            ledger as they come due, so nothing here inflates a report before it happens.
          </div>
        </Card>
      )}

      {ready && dataset.recurring.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Repeat className="h-7 w-7" />}
            title="No recurring rules yet"
            description="Rent, subscriptions, salary — if it repeats, put it here and you'll always know what's committed before you spend. Entries land in your ledger as they come due."
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate("/recurring/new")}>
                Add a recurring rule
              </Button>
            }
            secondaryAction={<LinkButton to="/calendar">See the calendar</LinkButton>}
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Repeat className="h-7 w-7" />}
            title="Nothing matches this filter"
            description="Switch to All to see every recurring rule you've set up."
            action={
              <Button variant="secondary" onClick={() => setFilter("all")}>
                Show all
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((rule) => {
            const category = rule.category_id
              ? lookups.category.get(rule.category_id)
              : undefined;
            const Icon = categoryIcon(category?.icon ?? null, category?.name);
            const tone =
              rule.type === "income"
                ? "text-income"
                : rule.type === "expense"
                  ? "text-expense"
                  : "text-transfer";
            const sign = rule.type === "income" ? "+" : rule.type === "expense" ? "−" : "";
            const accountName = (id: string | null) =>
              id ? (lookups.account.get(id)?.name ?? "Unknown") : null;

            return (
              <Card key={rule.id} className={`p-4 ${rule.enabled ? "" : "opacity-70"}`}>
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/recurring/${rule.id}`)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        rule.type === "income"
                          ? "bg-income-soft text-income"
                          : rule.type === "expense"
                            ? "bg-expense-soft text-expense"
                            : "bg-transfer-soft text-transfer"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-ink">
                          {rule.notes || category?.name || `${rule.type} rule`}
                        </span>
                        {!rule.enabled && <Badge tone="neutral">Paused</Badge>}
                      </span>
                      <span className="tabular block truncate text-xs text-muted">
                        {FREQUENCY_LABEL[rule.frequency]} ·{" "}
                        {rule.type === "transfer"
                          ? `${accountName(rule.from_account_id) ?? "?"} → ${accountName(rule.to_account_id) ?? "?"}`
                          : (accountName(rule.type === "income" ? rule.to_account_id : rule.from_account_id) ?? "No account")}
                        {rule.end_at && ` · until ${formatRelativeDay(rule.end_at)}`}
                      </span>
                    </span>
                  </button>

                  <span className="shrink-0 text-right">
                    <span className={`tabular block text-sm font-semibold ${tone}`}>
                      {sign}
                      {formatMoney(rule.amount, rule.currency)}
                    </span>
                    <span className="tabular block text-[11px] text-muted">
                      {formatRelativeDay(rule.next_run_at)}
                    </span>
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
                    Next {formatRelativeDay(rule.next_run_at)}
                    {rule.last_run_at && ` · last ${formatRelativeDay(rule.last_run_at)}`}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={rule.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      onClick={() => void toggle(rule)}
                    >
                      {rule.enabled ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/recurring/${rule.id}/edit`)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/recurring/${rule.id}`)}
                    >
                      View
                    </Button>
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Alert tone="info" title="How occurrence generation works">
        The backend generates entries from these rules on their due date and pushes them down on
        your next sync. Offline, the calendar still shows what's coming, and a rule you pause now
        stops before its next run.
      </Alert>
    </div>
  );
}

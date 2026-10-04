/**
 * Budget detail — `/budgets/:budgetId`.
 *
 * Shows the limit, the period, and which transactions are eating into it — the
 * list is the audit trail behind the bar, so a surprising number can be traced
 * to real entries instead of taken on faith.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, PiggyBank, Trash2 } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  ConfirmOverlay,
  DetailRow,
  Divider,
  EmptyState,
  IconButton,
  PageHeader,
  ProgressBar,
  Stat,
  useToast,
} from "../../components/ui";
import { formatDate, formatMoney, formatPercent, formatRelativeDay } from "../../design/format";
import { useLocalData } from "../analytics/useLocalData";
import { usePreferences } from "../settings/preferences";
import { budgetProgress } from "../analytics/engine";
import { inRange, periodRange, type Period } from "../analytics/period";
import { deleteBudget } from "../../db/repositories";

export function BudgetDetailPage() {
  const { budgetId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { lookups, dataset, ready } = useLocalData();
  const { preferences } = usePreferences();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const budget = dataset.budgets.find((row) => row.id === budgetId) ?? null;

  const progress = useMemo(
    () =>
      budgetProgress(
        budget ? [budget] : [],
        dataset.transactions,
        lookups,
        new Date(),
        preferences.monthStartDay,
      )[0] ?? null,
    [budget, dataset.transactions, lookups, preferences.monthStartDay],
  );

  const spending = useMemo(() => {
    if (!budget) return [];
    const period: Period = {
      kind: budget.period === "weekly" ? "week" : budget.period === "yearly" ? "year" : "month",
      anchor: new Date(),
      monthStartDay: preferences.monthStartDay,
    };
    const range = periodRange(period);
    if (!range) return [];
    return dataset.transactions
      .filter(
        (tx) =>
          tx.type === "expense" &&
          !tx.deleted_at &&
          (!budget.category_id || tx.category_id === budget.category_id) &&
          inRange(tx.date, range),
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 25);
  }, [budget, dataset.transactions, preferences.monthStartDay]);

  if (!budget) {
    return (
      <div className="space-y-4">
        <PageHeader title="Budget" />
        <Card>
          <EmptyState
            icon={<PiggyBank className="h-7 w-7" />}
            title={ready ? "Budget not found" : "Loading…"}
            description={ready ? "It may have been deleted on another device." : undefined}
            action={
              <Button variant="primary" onClick={() => navigate("/budgets")}>
                Back to budgets
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const category = budget.category_id ? lookups.category.get(budget.category_id) : undefined;
  const tone = progress?.overBudget ? "expense" : progress?.alert ? "warning" : "primary";

  async function remove() {
    setBusy(true);
    try {
      await deleteBudget(budget!.id);
      toast.push({ tone: "success", title: "Budget deleted" });
      navigate("/budgets");
    } catch (err) {
      toast.push({
        tone: "error",
        title: "Couldn't delete budget",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        leading={
          <IconButton label="Back" onClick={() => navigate("/budgets")}>
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
        }
        title={category?.name ?? "All spending"}
        subtitle={`${budget.period === "weekly" ? "Weekly" : budget.period === "yearly" ? "Yearly" : "Monthly"} limit`}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Pencil className="h-4 w-4" />}
            onClick={() => navigate(`/budgets/${budget.id}/edit`)}
          >
            Edit
          </Button>
        }
      />

      {progress && (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4 px-4 py-4">
            <Stat
              label="Spent so far"
              emphasis="hero"
              tone={progress.overBudget ? "expense" : "default"}
              value={formatMoney(progress.spent, lookups.dataset.baseCurrency)}
              caption={`of ${formatMoney(progress.spent + progress.remaining, lookups.dataset.baseCurrency)}`}
            />
            <div className="grid grid-cols-2 gap-x-8">
              <Stat
                label="Remaining"
                tone={progress.remaining < 0 ? "expense" : "default"}
                value={formatMoney(progress.remaining, lookups.dataset.baseCurrency)}
              />
              <Stat
                label="Used"
                tone={progress.overBudget ? "expense" : "default"}
                value={formatPercent(progress.percent)}
              />
            </div>
          </div>
          <div className="px-4 pb-4">
            <ProgressBar
              value={progress.percent}
              tone={tone}
              label={`${category?.name ?? "Total"} budget usage`}
            />
          </div>
        </Card>
      )}

      {progress?.overBudget && (
        <Alert tone="warning" title="This budget is exceeded">
          Spending for the current period is past the limit. Nothing is blocked — the bar is a
          signal, not a gate.
        </Alert>
      )}

      <Card>
        <CardHeader title="Settings" />
        <dl className="space-y-0.5 px-4 py-3">
          <DetailRow label="Category">{category?.name ?? "All spending"}</DetailRow>
          <DetailRow label="Limit">
            {formatMoney(budget.amount, lookups.dataset.baseCurrency)}
          </DetailRow>
          <DetailRow label="Period">
            {budget.period === "weekly"
              ? "Weekly"
              : budget.period === "yearly"
                ? "Yearly"
                : "Monthly"}
          </DetailRow>
          <DetailRow label="Starts">{formatDate(budget.start_date, "medium")}</DetailRow>
          <DetailRow label="Alert at">{budget.alert_threshold}% of the limit</DetailRow>
        </dl>
        <Divider />
        <p className="px-4 pb-3 text-xs text-muted">
          Only expenses count against this budget. Transfers and income are ignored by design.
        </p>
      </Card>

      <Card>
        <CardHeader title="Transactions in this period" subtitle={`${spending.length} shown`} />
        {spending.length === 0 ? (
          <EmptyState
            compact
            icon={<PiggyBank className="h-6 w-6" />}
            title="Nothing spent yet"
            description="Expenses recorded in the current period will be listed here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {spending.map((tx) => (
              <li key={tx.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/transactions/${tx.id}`)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-sunken"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">
                      {tx.notes ||
                        (tx.category_id
                          ? (lookups.category.get(tx.category_id)?.name ?? "Expense")
                          : "Expense")}
                    </span>
                    <span className="block text-xs text-muted">{formatRelativeDay(tx.date)}</span>
                  </span>
                  <span className="tabular shrink-0 text-sm font-semibold text-expense">
                    −{formatMoney(Math.abs(tx.amount), tx.currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div>
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 className="h-4 w-4" />}
          onClick={() => setConfirmDelete(true)}
        >
          Delete budget
        </Button>
      </div>

      <ConfirmOverlay
        open={confirmDelete}
        busy={busy}
        tone="danger"
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Delete this budget?"
        confirmLabel="Delete budget"
        message="Your transactions are untouched — you just lose the limit for that category."
      />
    </div>
  );
}

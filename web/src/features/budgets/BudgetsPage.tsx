/**
 * Budgets.
 *
 * One question on screen: how much room is left. Each budget shows the limit,
 * what's spent, and how far into the alert or over-budget zone it has gone —
 * nothing else. Creation and editing live at `/budgets/new` and
 * `/budgets/:budgetId/edit`.
 */
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowDownRight,
  CircleAlert,
  PieChart,
  PiggyBank,
  Plus,
} from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  Divider,
  EmptyState,
  LinkButton,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  Stat,
} from "../../components/ui";
import { formatMoney, formatPercent } from "../../design/format";
import { useLocalData } from "../analytics/useLocalData";
import { usePreferences } from "../settings/preferences";
import { budgetProgress, type BudgetProgress } from "../analytics/engine";

type View = "all" | "attention";

export function BudgetsPage() {
  const { lookups, dataset, ready } = useLocalData();
  const { preferences } = usePreferences();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = (params.get("view") as View) ?? "all";

  const anchor = useMemo(() => new Date(), []);

  const progress = useMemo(
    () =>
      budgetProgress(
        dataset.budgets,
        dataset.transactions,
        lookups,
        anchor,
        preferences.monthStartDay,
      ).sort((a, b) => b.percent - a.percent),
    [dataset.budgets, dataset.transactions, lookups, anchor, preferences.monthStartDay],
  );

  const currency = lookups.dataset.baseCurrency;
  const totalLimit = progress.reduce((sum, item) => sum + item.spent + item.remaining, 0);
  const totalSpent = progress.reduce((sum, item) => sum + item.spent, 0);
  const overCount = progress.filter((item) => item.overBudget).length;
  const alertCount = progress.filter((item) => item.alert).length;
  const attentionCount = progress.filter((item) => item.alert).length;

  const visible = view === "attention" ? progress.filter((item) => item.alert) : progress;
  const overallPercent = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Budget"
        subtitle={
          progress.length > 0
            ? `${overCount} over · ${alertCount} near the limit`
            : "Set a limit, then watch the bar"
        }
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => navigate("/budgets/new")}
          >
            New budget
          </Button>
        }
        tabs={
          progress.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                size="sm"
                options={[
                  { id: "all", label: `All (${progress.length})` },
                  {
                    id: "attention",
                    label: `Needs attention (${attentionCount})`,
                    icon: attentionCount > 0 ? <CircleAlert className="h-3.5 w-3.5" /> : undefined,
                    tone: attentionCount > 0 ? "expense" : undefined,
                  },
                ]}
                value={view}
                onChange={(next) => {
                  const nextParams = new URLSearchParams(params);
                  nextParams.set("view", next);
                  setParams(nextParams, { replace: true });
                }}
                ariaLabel="Budget view"
              />
            </div>
          ) : undefined
        }
      />

      {progress.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4 px-4 py-4">
            <Stat
              label="Spent across all budgets"
              emphasis="hero"
              tone={overallPercent > 100 ? "expense" : "default"}
              value={formatMoney(totalSpent, currency)}
              caption={`of ${formatMoney(totalLimit, currency)} allocated`}
              icon={<PiggyBank className="h-3.5 w-3.5" />}
            />
            <div className="grid grid-cols-3 gap-x-8">
              <Stat label="Left" value={formatMoney(Math.max(0, totalLimit - totalSpent), currency)} />
              <Stat
                label="Used"
                tone={overallPercent > 100 ? "expense" : overallPercent > 80 ? "primary" : "default"}
                value={formatPercent(overallPercent)}
              />
              <Stat
                label="Over"
                tone={overCount > 0 ? "expense" : "muted"}
                value={`${overCount}`}
              />
            </div>
          </div>
          <div className="px-4 pb-4">
            <ProgressBar
              value={overallPercent}
              tone={overallPercent > 100 ? "expense" : overallPercent > 80 ? "warning" : "primary"}
              label="Overall budget usage"
            />
          </div>
        </Card>
      )}

      {ready && dataset.budgets.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PiggyBank className="h-7 w-7" />}
            title="No budgets yet"
            description="Give your biggest spending categories a monthly ceiling and FinTrack tracks it for you — offline, automatically, with no spreadsheet. Start with one or two categories that surprise you at the end of the month."
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate("/budgets/new")}>
                Create your first budget
              </Button>
            }
            secondaryAction={<LinkButton to="/categories">Review my categories</LinkButton>}
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PieChart className="h-7 w-7" />}
            title={view === "attention" ? "Nothing needs attention" : "No budgets match"}
            description={
              view === "attention"
                ? "Every budget is below its alert threshold. Enjoy it while it lasts."
                : "Try switching the filter to see all budgets."
            }
            action={
              <Button variant="secondary" onClick={() => setParams({}, { replace: true })}>
                Show all budgets
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((item) => (
            <BudgetCard key={item.budget.id} item={item} currency={currency} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader
          title="How budgets are counted"
          icon={<ArrowDownRight className="h-4 w-4" />}
        />
        <ul className="space-y-2 px-4 py-3 text-sm text-muted">
          <li>
            <span className="font-medium text-ink">Only expenses.</span> Transfers between your own
            accounts and income never count against a budget.
          </li>
          <li>
            <span className="font-medium text-ink">Children roll up.</span> A budget on a parent
            category includes every subcategory beneath it.
          </li>
          <li>
            <span className="font-medium text-ink">Computed locally.</span> The figure comes from
            your on-device ledger, so it is correct even with no connection.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function BudgetCard({ item, currency }: { item: BudgetProgress; currency: string }) {
  const navigate = useNavigate();
  const tone = item.overBudget ? "expense" : item.alert ? "warning" : "primary";
  const label = item.categoryName ?? "All spending";

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(`/budgets/${item.budget.id}`)}
          className="min-w-0 text-left"
        >
          <span className="block truncate text-sm font-semibold text-ink hover:text-primary">
            {label}
          </span>
          <span className="block text-xs text-muted">
            {item.budget.period === "weekly"
              ? "Weekly"
              : item.budget.period === "yearly"
                ? "Yearly"
                : "Monthly"}{" "}
            limit
          </span>
        </button>
        <button
          type="button"
          onClick={() => navigate(`/budgets/${item.budget.id}/edit`)}
          className="shrink-0 text-xs font-medium text-primary hover:underline"
        >
          Edit
        </button>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="tabular text-title font-semibold text-ink">
          {formatMoney(item.spent, currency)}
        </span>
        <span className="tabular text-xs text-muted">of {formatMoney(item.spent + item.remaining, currency)}</span>
      </div>

      <ProgressBar value={item.percent} size="sm" tone={tone} className="mt-2" label={`${label} budget usage`} />

      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="tabular text-muted">{formatPercent(item.percent)} used</span>
        <span
          className={`tabular font-medium ${
            item.overBudget ? "text-expense" : item.alert ? "text-warning" : "text-ink-soft"
          }`}
        >
          {item.remaining >= 0
            ? `${formatMoney(item.remaining, currency)} left`
            : `${formatMoney(Math.abs(item.remaining), currency)} over`}
        </span>
      </div>

      {item.overBudget && (
        <>
          <Divider />
          <p className="flex items-start gap-2 text-xs text-expense">
            <CircleAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
            You have spent past the limit for this period.
          </p>
        </>
      )}
    </Card>
  );
}

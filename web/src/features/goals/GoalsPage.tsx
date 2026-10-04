/**
 * Savings goals.
 *
 * Progress is derived from the ledger — contributions are transactions tagged
 * with the goal — so the bar is honest even when recorded offline. A goal that
 * needs money each month to hit its date says exactly how much (§26).
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CalendarClock, PiggyBank, Plus, Target, Trophy } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  ProgressBar,
  Stat,
} from "../../components/ui";
import { formatMoney, formatPercent, formatRelativeTime } from "../../design/format";
import { useLocalData } from "../analytics/useLocalData";
import { goalProgress, type GoalProgress } from "../analytics/engine";

export function GoalsPage() {
  const { lookups, dataset, ready } = useLocalData();
  const navigate = useNavigate();

  const progress = useMemo(
    () => goalProgress(dataset.goals, dataset.transactions, lookups),
    [dataset.goals, dataset.transactions, lookups],
  );

  const currency = lookups.dataset.baseCurrency;
  const savedTotal = progress.reduce((sum, item) => sum + item.saved, 0);
  const targetTotal = progress.reduce((sum, item) => sum + item.target, 0);
  const completed = progress.filter((item) => item.percent >= 100).length;
  const onSchedule = progress.filter((item) => item.onTrack || item.daysLeft === null).length;

  const [selected, setSelected] = useState<string | null>(null);
  const detail = progress.find((item) => item.goal.id === selected) ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Savings goals"
        subtitle={
          progress.length > 0
            ? `${completed} complete · ${onSchedule} of ${progress.length} on track`
            : "Set a target, then fund it from your ledger"
        }
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => navigate("/goals/new")}
          >
            New goal
          </Button>
        }
      />

      {progress.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4 px-4 py-4">
            <Stat
              label="Total saved toward goals"
              emphasis="hero"
              value={formatMoney(savedTotal, currency)}
              caption={`of ${formatMoney(targetTotal, currency)} targeted`}
              icon={<Target className="h-3.5 w-3.5" />}
            />
            <div className="grid grid-cols-2 gap-x-8">
              <Stat
                label="Overall"
                value={formatPercent(targetTotal > 0 ? (savedTotal / targetTotal) * 100 : 0)}
              />
              <Stat label="Completed" value={`${completed}`} />
            </div>
          </div>
          {targetTotal > 0 && (
            <div className="px-4 pb-4">
              <ProgressBar
                value={(savedTotal / targetTotal) * 100}
                tone="income"
                label="Overall savings progress"
              />
            </div>
          )}
        </Card>
      )}

      {ready && dataset.goals.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target className="h-7 w-7" />}
            title="No savings goals yet"
            description="A goal turns an abstract number into something you can chase: it tracks what you've put aside, tells you what's left, and shows whether a target date is realistic. Create one for the next thing you're saving for."
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate("/goals/new")}>
                Create a goal
              </Button>
            }
            secondaryAction={<LinkButton to="/transactions?add=transfer">Record a contribution</LinkButton>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {progress.map((item) => (
            <GoalCard
              key={item.goal.id}
              item={item}
              currency={currency}
              selected={selected === item.goal.id}
              onSelect={() => setSelected(selected === item.goal.id ? null : item.goal.id)}
              onOpen={() => navigate(`/goals/${item.goal.id}`)}
              onEdit={() => navigate(`/goals/${item.goal.id}/edit`)}
            />
          ))}
        </div>
      )}

      {detail && (
        <Card>
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">{detail.goal.name} — activity</h2>
            <p className="text-xs text-muted">
              {detail.contributions.length} contribution
              {detail.contributions.length === 1 ? "" : "s"} recorded
            </p>
          </div>
          {detail.contributions.length === 0 ? (
            <EmptyState
              compact
              icon={<PiggyBank className="h-6 w-6" />}
              title="No contributions yet"
              description="Record a transfer into the goal's account and tag it here — the bar updates immediately."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate("/transactions?add=transfer")}
                >
                  Add a contribution
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {detail.contributions.slice(0, 8).map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{tx.notes || "Contribution"}</p>
                    <p className="text-xs text-muted">{formatRelativeTime(tx.date)}</p>
                  </div>
                  <span className="tabular text-sm font-semibold text-income">
                    +{formatMoney(Math.abs(tx.amount), tx.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function GoalCard({
  item,
  currency,
  selected,
  onSelect,
  onOpen,
  onEdit,
}: {
  item: GoalProgress;
  currency: string;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const done = item.percent >= 100;
  const pct = Math.min(100, item.percent);

  return (
    <Card
      className={`p-4 transition-colors ${selected ? "border-primary ring-1 ring-primary/30" : ""}`}
    >
      <button type="button" onClick={onSelect} aria-expanded={selected} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
              <Target aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
              {item.goal.name}
            </p>
            {item.goal.target_date && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
                By {formatRelativeTime(item.goal.target_date)}
              </p>
            )}
          </div>
          {done && <Trophy aria-label="Goal complete" className="h-5 w-5 shrink-0 text-warning" />}
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-2">
          <span className={`tabular text-title font-semibold ${done ? "text-income" : "text-ink"}`}>
            {formatMoney(item.saved, currency)}
          </span>
          <span className="tabular text-xs text-muted">of {formatMoney(item.target, currency)}</span>
        </div>

        <ProgressBar
          value={pct}
          size="sm"
          tone={done ? "income" : "primary"}
          className="mt-2"
          label={`${item.goal.name} progress`}
        />

        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className="tabular font-medium text-ink-soft">{formatPercent(item.percent)}</span>
          <span className="tabular text-muted">
            {done ? "Complete" : `${formatMoney(item.remaining, currency)} to go`}
          </span>
        </div>
      </button>

      {!done && item.requiredMonthly !== null && item.daysLeft !== null && item.daysLeft > 0 && (
        <p className="mt-2 border-t border-line pt-2 text-xs text-muted">
          <span className="font-medium text-ink">
            {formatMoney(item.requiredMonthly, currency)}
          </span>{" "}
          per month to hit your date
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSelect}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {selected ? "Hide activity" : "View activity"}
          <ArrowRight aria-hidden="true" className="h-3 w-3" />
        </button>
        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpen}
            className="text-xs font-medium text-muted hover:text-ink"
          >
            Details
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-medium text-muted hover:text-ink"
          >
            Edit
          </button>
        </span>
      </div>
    </Card>
  );
}

/**
 * Savings-goal detail — `/goals/:goalId`.
 *
 * Progress, the contribution ledger behind it, and what the target date still
 * demands — all derived locally so the numbers are right with no connection.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarClock, Pencil, PiggyBank, Target, Trash2, Trophy } from "lucide-react";
import {
  Alert,
  Badge,
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
import { byTxNewest, formatMoney, formatPercent, formatRelativeDay, toDate } from "../../design/format";
import { useLocalData } from "../analytics/useLocalData";
import { goalProgress } from "../analytics/engine";
import { deleteSavingsGoal } from "../../db/repositories";

export function GoalDetailPage() {
  const { goalId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { lookups, dataset, ready } = useLocalData();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const goal = dataset.goals.find((row) => row.id === goalId) ?? null;

  const progress = useMemo(
    () =>
      goalProgress(
        goal ? [goal] : [],
        dataset.transactions,
        lookups,
      )[0] ?? null,
    [goal, dataset.transactions, lookups],
  );

  const contributions = useMemo(
    () =>
      dataset.transactions
        .filter((tx) => tx.savings_goal_id === goalId)
        .sort(byTxNewest),
    [dataset.transactions, goalId],
  );

  if (!goal) {
    return (
      <div className="space-y-4">
        <PageHeader title="Savings goal" />
        <Card>
          <EmptyState
            icon={<Target className="h-7 w-7" />}
            title={ready ? "Goal not found" : "Loading…"}
            description={ready ? "It may have been deleted on another device." : undefined}
            action={
              <Button variant="primary" onClick={() => navigate("/goals")}>
                Back to goals
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const done = (progress?.percent ?? 0) >= 100;

  async function remove() {
    setBusy(true);
    try {
      await deleteSavingsGoal(goal!.id);
      toast.push({ tone: "success", title: "Goal deleted" });
      navigate("/goals");
    } catch (err) {
      toast.push({
        tone: "error",
        title: "Couldn't delete goal",
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
          <IconButton label="Back" onClick={() => navigate("/goals")}>
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
        }
        title={goal.name}
        subtitle={
          goal.target_date ? `Target ${formatRelativeDay(goal.target_date)}` : "No target date"
        }
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Pencil className="h-4 w-4" />}
            onClick={() => navigate(`/goals/${goal.id}/edit`)}
          >
            Edit
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4 px-4 py-4">
          <Stat
            label="Saved so far"
            emphasis="hero"
            tone={done ? "income" : "default"}
            value={formatMoney(progress?.saved ?? 0, goal.currency)}
            caption={`of ${formatMoney(goal.target_amount, goal.currency)}`}
            icon={done ? <Trophy className="h-3.5 w-3.5" /> : <Target className="h-3.5 w-3.5" />}
          />
          <div className="grid grid-cols-2 gap-x-8">
            <Stat
              label="To go"
              value={formatMoney(Math.max(0, progress?.remaining ?? goal.target_amount), goal.currency)}
            />
            <Stat label="Progress" value={formatPercent(progress?.percent ?? 0)} />
          </div>
        </div>
        <div className="px-4 pb-4">
          <ProgressBar
            value={Math.min(100, progress?.percent ?? 0)}
            tone={done ? "income" : "primary"}
            label={`${goal.name} progress`}
          />
        </div>
      </Card>

      {done ? (
        <Alert tone="info" title="Target reached">
          You've saved {formatMoney(progress?.saved ?? 0, goal.name ? goal.currency : goal.currency)} —
          exactly what you set out to. Mark it complete or raise the target.
        </Alert>
      ) : progress?.requiredMonthly !== null && progress?.daysLeft !== null && progress.daysLeft > 0 ? (
        <Alert tone="info" title="To hit your date">
          Putting aside {formatMoney(progress.requiredMonthly ?? 0, goal.currency)} a month for the
          next {progress.daysLeft} days lands you on target. Anything sooner simply finishes early.
        </Alert>
      ) : progress?.daysLeft !== null && (progress?.daysLeft ?? 0) <= 0 ? (
        <Alert tone="warning" title="The target date has passed">
          The goal is still short by {formatMoney(progress?.remaining ?? 0, goal.currency)}. Pick a
          new date or keep contributing — the ledger doesn't mind either way.
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Settings" />
        <dl className="space-y-0.5 px-4 py-3">
          <DetailRow label="Target">{formatMoney(goal.target_amount, goal.currency)}</DetailRow>
          <DetailRow label="Currency">{goal.currency}</DetailRow>
          <DetailRow label="Target date">
            {goal.target_date ? formatRelativeDay(goal.target_date) : "None"}
          </DetailRow>
          <DetailRow label="Linked account">
            {goal.linked_account_id
              ? (lookups.account.get(goal.linked_account_id)?.name ?? "—")
              : "None"}
          </DetailRow>
        </dl>
        <Divider />
        <p className="px-4 pb-3 text-xs text-muted">
          Contributions are ordinary transactions tagged with this goal, so the balance always
          traces back to money that actually moved.
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Contributions"
          subtitle={`${contributions.length} recorded`}
          icon={<PiggyBank className="h-4 w-4" />}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate("/transactions?add=transfer")}
            >
              Add
            </Button>
          }
        />
        {contributions.length === 0 ? (
          <EmptyState
            compact
            icon={<PiggyBank className="h-6 w-6" />}
            title="No contributions yet"
            description="Record a transfer toward this goal and tag it here — the bar updates the moment you do."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate("/transactions?add=transfer")}
              >
                Record a contribution
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {contributions.map((tx) => (
              <li key={tx.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/transactions/${tx.id}`)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-sunken"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">
                      {tx.notes || "Contribution"}
                    </span>
                    <span className="block text-xs text-muted">{formatRelativeDay(tx.date)}</span>
                  </span>
                  <span className="tabular shrink-0 text-sm font-semibold text-income">
                    +{formatMoney(Math.abs(tx.amount), tx.currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {goal.target_date && !done && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
          Target date {toDate(goal.target_date).toLocaleDateString()}
        </p>
      )}

      <div>
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 className="h-4 w-4" />}
          onClick={() => setConfirmDelete(true)}
        >
          Delete goal
        </Button>
        {!done && <Badge tone="neutral">In progress</Badge>}
      </div>

      <ConfirmOverlay
        open={confirmDelete}
        busy={busy}
        tone="danger"
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Delete this goal?"
        confirmLabel="Delete goal"
        message="Contributions you recorded stay in your ledger — only the target goes away."
      />
    </div>
  );
}

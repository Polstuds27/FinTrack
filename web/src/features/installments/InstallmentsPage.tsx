/**
 * Installment plans.
 *
 * A plan shows what was bought, how many parts are left, and how much is still
 * to pay. The schedule and the paid markers both come from the ledger, so an
 * offline-recorded payment is reflected the moment it is entered (§23).
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Layers, Plus, Receipt } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  ProgressBar,
} from "../../components/ui";
import { formatMoney, formatPercent, formatRelativeDay } from "../../design/format";
import { useLocalData } from "../analytics/useLocalData";
import { installmentProgress, type InstallmentProgress } from "../analytics/engine";

export function InstallmentsPage() {
  const { lookups, dataset, ready } = useLocalData();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);

  const plans = useMemo(
    () => installmentProgress(dataset.installments, dataset.transactions, lookups),
    [dataset.installments, dataset.transactions, lookups],
  );

  const currency = lookups.dataset.baseCurrency;
  const totalRemaining = plans.reduce(
    (sum, item) => sum + Math.max(0, item.plan.total_amount - item.paidAmount),
    0,
  );
  const paidTotal = plans.reduce((sum, item) => sum + item.paidAmount, 0);
  const dueSoon = plans.filter(
    (item) => item.nextDueDate !== null && daysOut(item.nextDueDate) <= 7,
  ).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Installments"
        subtitle={
          plans.length > 0
            ? `${plans.length} active plan${plans.length === 1 ? "" : "s"} · ${dueSoon} due within a week`
            : "Split a purchase across time"
        }
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => navigate("/installments/new")}
          >
            New plan
          </Button>
        }
      />

      {plans.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4 px-4 py-4">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted uppercase">
                Still to pay
              </p>
              <p className="tabular mt-0.5 text-display-sm font-semibold text-ink">
                {formatMoney(totalRemaining, currency)}
              </p>
              <p className="mt-1 text-xs text-muted">
                {formatMoney(paidTotal, currency)} already settled
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-8">
              <div>
                <p className="text-xs text-muted">Plans</p>
                <p className="tabular text-title font-semibold text-ink">{plans.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Due soon</p>
                <p
                  className={`tabular text-title font-semibold ${dueSoon > 0 ? "text-warning" : "text-ink"}`}
                >
                  {dueSoon}
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {ready && dataset.installments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Layers className="h-7 w-7" />}
            title="No installment plans yet"
            description="Bought something on a payment plan? Record it once and FinTrack tracks every part — how many are left, what each costs, and when the next one is due — all computed from your own ledger."
            action={
              <Button
                variant="primary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => navigate("/installments/new")}
              >
                Create a plan
              </Button>
            }
            secondaryAction={<LinkButton to="/calendar">Open the calendar</LinkButton>}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {plans.map((item) => (
            <PlanCard
              key={item.plan.id}
              item={item}
              expanded={selected === item.plan.id}
              onToggle={() => setSelected(selected === item.plan.id ? null : item.plan.id)}
              onOpen={() => navigate(`/installments/${item.plan.id}`)}
              onEdit={() => navigate(`/installments/${item.plan.id}/edit`)}
            />
          ))}
        </div>
      )}

      <Alert tone="info" title="Payments are ordinary transactions">
        Marking a part as paid happens by recording the transaction itself. That keeps spending
        reports, account balances and this schedule telling the same story — even when the payment
        was entered on a phone with no connection.
      </Alert>
    </div>
  );
}

function daysOut(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

function PlanCard({
  item,
  expanded,
  onToggle,
  onOpen,
  onEdit,
}: {
  item: InstallmentProgress;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const { plan } = item;
  const remaining = Math.max(0, plan.total_amount - item.paidAmount);
  const done = item.remainingParts === 0;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="min-w-0 flex-1 text-left">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Receipt aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{plan.notes || "Installment plan"}</span>
          </p>
          <p className="tabular mt-0.5 text-xs text-muted">
            {plan.currency} · {item.paidParts} of {plan.parts_count} parts ·{" "}
            {formatMoney(item.partAmount, plan.currency)} each
          </p>
        </button>
        <span className="flex shrink-0 items-center gap-3">
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
            className="text-xs font-medium text-primary hover:underline"
          >
            Edit
          </button>
        </span>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="tabular text-title font-semibold text-ink">
          {formatMoney(remaining, plan.currency)}
        </span>
        <span className="tabular text-xs text-muted">
          {done ? "Fully paid" : `${formatPercent(item.percent)} settled`}
        </span>
      </div>

      <ProgressBar
        value={Math.min(100, item.percent)}
        size="sm"
        tone={done ? "income" : "primary"}
        className="mt-2"
        label={`${plan.notes || "Installment"} repayment progress`}
      />

      {!done && item.nextDueDate && (
        <p
          className={`mt-2 flex items-center gap-1.5 text-xs ${
            daysOut(item.nextDueDate) <= 7 ? "text-warning" : "text-muted"
          }`}
        >
          <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
          Next part {formatRelativeDay(item.nextDueDate)}
        </p>
      )}

      {expanded && (
        <ul className="mt-3 grid gap-1 border-t border-line pt-3 sm:grid-cols-2">
          {item.schedule.map((part) => (
            <li
              key={part.index}
              className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs ${
                part.paid ? "bg-income-soft text-income" : "bg-surface-sunken text-muted"
              }`}
            >
              <span>
                Part {part.index + 1} · {formatRelativeDay(part.date)}
              </span>
              <span className="tabular font-medium">
                {formatMoney(part.amount, plan.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

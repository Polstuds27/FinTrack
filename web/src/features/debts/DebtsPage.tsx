/**
 * Debts & receivables.
 *
 * Two lists, never mixed: money you owe and money owed to you. Each row shows
 * how much is settled, and the whole page stays explicitly separate from income
 * and expense so a borrowed sum can never inflate a report (§27).
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  HandCoins,
  Landmark,
  Plus,
} from "lucide-react";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  Stat,
} from "../../components/ui";
import { formatMoney, formatPercent, formatRelativeDay } from "../../design/format";
import { useLocalData } from "../analytics/useLocalData";
import { debtSummary, type DebtSummary } from "../analytics/engine";

export function DebtsPage() {
  const { lookups, dataset, ready } = useLocalData();
  const navigate = useNavigate();
  const [direction, setDirection] = useState<"i_owe" | "owed_to_me">("i_owe");

  const summary = useMemo(
    () => debtSummary(dataset.debts, dataset.transactions, lookups),
    [dataset.debts, dataset.transactions, lookups],
  );

  const currency = lookups.dataset.baseCurrency;
  const owed = summary.filter((item) => item.debt.direction === "i_owe");
  const receivable = summary.filter((item) => item.debt.direction === "owed_to_me");

  /** Raw remainders; every debt keeps its own currency. */
  const sumRemaining = (rows: DebtSummary[]) =>
    rows.reduce((total, item) => total + item.debt.remaining_amount, 0);

  const outstanding = sumRemaining(owed);
  const receivableTotal = sumRemaining(receivable);

  const active = direction === "i_owe" ? owed : receivable;
  const overdueCount = summary.filter((item) => item.overdue).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Debts"
        subtitle={
          summary.length > 0
            ? `${overdueCount} overdue · ${summary.length} open`
            : "Track what you owe and what you're owed"
        }
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => navigate("/debts/new")}
          >
            New
          </Button>
        }
        tabs={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              size="sm"
              options={[
                { id: "i_owe", label: `I owe (${owed.length})`, icon: <ArrowDownRight className="h-3.5 w-3.5" /> },
                { id: "owed_to_me", label: `Owed to me (${receivable.length})`, icon: <ArrowUpRight className="h-3.5 w-3.5" /> },
              ]}
              value={direction}
              onChange={setDirection}
              ariaLabel="Debt direction"
            />
          </div>
        }
      />

      <Alert tone="info" title="Debts are not income or expense">
        A loan is money moving, not money earned. Repayments are recorded as transfers, so
        spending reports and net worth stay correct while a balance is being settled.
      </Alert>

      {summary.length > 0 && (
        <Card>
          <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="px-4 py-3.5">
              <Stat
                label="You owe"
                tone="expense"
                value={formatMoney(outstanding, currency)}
                icon={<Landmark className="h-3.5 w-3.5" />}
              />
            </div>
            <div className="px-4 py-3.5">
              <Stat
                label="Owed to you"
                tone="income"
                value={formatMoney(receivableTotal, currency)}
                icon={<HandCoins className="h-3.5 w-3.5" />}
              />
            </div>
            <div className="px-4 py-3.5">
              <Stat
                label="Overdue"
                tone={overdueCount > 0 ? "expense" : "muted"}
                value={`${overdueCount}`}
                caption={overdueCount > 0 ? "Needs attention" : "All clear"}
              />
            </div>
          </div>
        </Card>
      )}

      {ready && dataset.debts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Landmark className="h-7 w-7" />}
            title="No debts recorded"
            description="Whether it's a credit-card balance, a friend you'll repay, or money someone owes you, keeping it here means the total is always visible instead of lurking in the back of your mind."
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate("/debts/new")}>
                Record one
              </Button>
            }
            secondaryAction={<LinkButton to="/credit-cards">Open credit cards</LinkButton>}
          />
        </Card>
      ) : active.length === 0 ? (
        <Card>
          <EmptyState
            icon={direction === "i_owe" ? <Landmark className="h-7 w-7" /> : <HandCoins className="h-7 w-7" />}
            title={direction === "i_owe" ? "Nothing owed" : "Nobody owes you anything"}
            description={
              direction === "i_owe"
                ? "Switch the tab to record a receivable, or add a new one."
                : "Switch the tab to record something you're owed, or add a new one."
            }
            action={
              <Button variant="secondary" onClick={() => setDirection(direction === "i_owe" ? "owed_to_me" : "i_owe")}>
                Switch view
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {active.map((item) => (
            <DebtRow key={item.debt.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function DebtRow({ item }: { item: DebtSummary }) {
  const navigate = useNavigate();
  const { debt } = item;
  const iOwe = debt.direction === "i_owe";

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(`/debts/${debt.id}`)}
          className="min-w-0 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="truncate hover:text-primary">{debt.counterparty}</span>
            {item.overdue && <span className="badge-failed">Overdue</span>}
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            {iOwe ? "You owe" : "Owed to you"} ·{" "}
            {debt.due_date ? `due ${formatRelativeDay(debt.due_date)}` : "no due date"}
            {debt.notes && ` · ${debt.notes}`}
          </span>
        </button>
        <button
          type="button"
          onClick={() => navigate(`/debts/${debt.id}/edit`)}
          className="shrink-0 text-xs font-medium text-primary hover:underline"
        >
          Edit
        </button>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className={`tabular text-title font-semibold ${iOwe ? "text-expense" : "text-income"}`}>
          {formatMoney(debt.remaining_amount, debt.currency)}
        </span>
        <span className="tabular text-xs text-muted">
          of {formatMoney(debt.original_amount, debt.currency)} · {formatPercent(item.percent)} settled
        </span>
      </div>

      <ProgressBar
        value={item.percent}
        size="sm"
        tone={item.percent >= 100 ? "income" : "primary"}
        className="mt-2"
        label={`${debt.counterparty} repayment progress`}
      />

      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">
          {item.percent >= 100 ? "Settled in full" : `${item.payments.length} payment${item.payments.length === 1 ? "" : "s"} recorded`}
        </span>
        {debt.due_date && (
          <span className={`flex items-center gap-1 ${item.overdue ? "text-expense" : "text-muted"}`}>
            <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
            {item.daysUntilDue !== null &&
              (item.daysUntilDue < 0
                ? `${Math.abs(item.daysUntilDue)} days late`
                : item.daysUntilDue === 0
                  ? "Due today"
                  : `In ${item.daysUntilDue} days`)}
          </span>
        )}
      </div>

      {item.payments.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-t border-line pt-1">
          {item.payments.slice(0, 3).map((tx) => (
            <li key={tx.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate text-xs text-muted">
                {tx.notes || "Payment"} · {formatRelativeDay(tx.date)}
              </span>
              <span className="tabular shrink-0 text-xs font-semibold text-ink">
                {formatMoney(Math.abs(tx.amount), tx.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Debt detail — `/debts/:debtId`.
 *
 * The running balance, who it's with, and the payments that produced the
 * remainder — with the reminder that a repayment is a transfer, not an expense.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, HandCoins, Landmark, Pencil, Trash2 } from "lucide-react";
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
import { formatMoney, formatPercent, formatRelativeDay } from "../../design/format";
import { useLocalData } from "../analytics/useLocalData";
import { debtSummary } from "../analytics/engine";
import { deleteDebt } from "../../db/repositories";

export function DebtDetailPage() {
  const { debtId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { lookups, dataset, ready } = useLocalData();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const debt = dataset.debts.find((row) => row.id === debtId) ?? null;

  const summary = useMemo(
    () =>
      debtSummary(
        debt ? [debt] : [],
        dataset.transactions,
        lookups,
      )[0] ?? null,
    [debt, dataset.transactions, lookups],
  );

  if (!debt) {
    return (
      <div className="space-y-4">
        <PageHeader title="Debt" />
        <Card>
          <EmptyState
            icon={<Landmark className="h-7 w-7" />}
            title={ready ? "Record not found" : "Loading…"}
            description={ready ? "It may have been deleted on another device." : undefined}
            action={
              <Button variant="primary" onClick={() => navigate("/debts")}>
                Back to debts
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const iOwe = debt.direction === "i_owe";
  const Icon = iOwe ? Landmark : HandCoins;
  const settled = summary ? summary.percent >= 100 : false;

  async function remove() {
    setBusy(true);
    try {
      await deleteDebt(debt!.id);
      toast.push({ tone: "success", title: "Record deleted" });
      navigate("/debts");
    } catch (err) {
      toast.push({
        tone: "error",
        title: "Couldn't delete record",
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
          <IconButton label="Back" onClick={() => navigate("/debts")}>
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
        }
        title={debt.counterparty}
        subtitle={iOwe ? "You owe this" : "Owed to you"}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Pencil className="h-4 w-4" />}
            onClick={() => navigate(`/debts/${debt.id}/edit`)}
          >
            Edit
          </Button>
        }
      />

      {summary?.overdue && (
        <Alert tone="warning" title="Past the due date">
          This record was due {formatRelativeDay(debt.due_date ?? "")}. Settle it or move the date
          so the rest of your planning stays honest.
        </Alert>
      )}

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4 px-4 py-4">
          <Stat
            label={iOwe ? "Still to repay" : "Still to collect"}
            emphasis="hero"
            tone={iOwe ? "expense" : "income"}
            value={formatMoney(debt.remaining_amount, debt.currency)}
            caption={`of ${formatMoney(debt.original_amount, debt.currency)}`}
            icon={<Icon className="h-3.5 w-3.5" />}
          />
          <div className="grid grid-cols-2 gap-x-8">
            <Stat label="Settled" value={formatPercent(summary?.percent ?? 0)} />
            <Stat
              label="Payments"
              value={`${summary?.payments.length ?? 0}`}
            />
          </div>
        </div>
        <div className="px-4 pb-4">
          <ProgressBar
            value={Math.min(100, summary?.percent ?? 0)}
            tone={settled ? "income" : "primary"}
            label={`${debt.counterparty} settlement progress`}
          />
          <p className="mt-1.5 text-xs text-muted">
            {settled ? "Settled in full." : `${summary?.payments.length ?? 0} payment(s) recorded so far.`}
          </p>
        </div>

        <Divider />

        <dl className="space-y-0.5 px-4 py-3">
          <DetailRow label="Direction">{iOwe ? "I owe" : "Owed to me"}</DetailRow>
          <DetailRow label="Original">{formatMoney(debt.original_amount, debt.currency)}</DetailRow>
          <DetailRow label="Remaining">{formatMoney(debt.remaining_amount, debt.currency)}</DetailRow>
          <DetailRow label="Due date">
            {debt.due_date ? formatRelativeDay(debt.due_date) : "None"}
          </DetailRow>
          <DetailRow label="Notes">{debt.notes || "—"}</DetailRow>
        </dl>
      </Card>

      <Alert tone="info" title="Repayments are transfers">
        Paying this back moves money between accounts. It is never counted as spending or income,
        so your reports and net worth stay correct while the balance comes down.
      </Alert>

      <Card>
        <CardHeader
          title="Payments"
          subtitle={`${summary?.payments.length ?? 0} recorded`}
          icon={<HandCoins className="h-4 w-4" />}
          action={
            <Button variant="secondary" size="sm" onClick={() => navigate("/transactions?add=transfer")}>
              Record
            </Button>
          }
        />
        {!summary || summary.payments.length === 0 ? (
          <EmptyState
            compact
            icon={<HandCoins className="h-6 w-6" />}
            title="No payments yet"
            description="Record a transfer against this record and it appears here, reducing the remainder automatically."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate("/transactions?add=transfer")}
              >
                Record a payment
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {summary.payments.map((tx) => (
              <li key={tx.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/transactions/${tx.id}`)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-sunken"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{tx.notes || "Payment"}</span>
                    <span className="block text-xs text-muted">{formatRelativeDay(tx.date)}</span>
                  </span>
                  <span className="tabular shrink-0 text-sm font-semibold text-ink">
                    {formatMoney(Math.abs(tx.amount), tx.currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 className="h-4 w-4" />}
          onClick={() => setConfirmDelete(true)}
        >
          Delete
        </Button>
        <Badge tone={settled ? "income" : "neutral"}>{settled ? "Settled" : "Open"}</Badge>
      </div>

      <ConfirmOverlay
        open={confirmDelete}
        busy={busy}
        tone="danger"
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Delete this record?"
        confirmLabel="Delete"
        message="Linked payment transactions stay in your ledger; only this running balance goes away."
      />
    </div>
  );
}

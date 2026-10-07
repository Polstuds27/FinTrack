/**
 * Installment-plan detail — `/installments/:installmentId`.
 *
 * The full part-by-part schedule, derived from the plan plus the payments that
 * actually exist in the ledger, so it is correct offline.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarClock, Layers, Pencil, Receipt, Trash2 } from "lucide-react";
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
  useToast,
} from "../../components/ui";
import { byTxNewest, formatDate, formatMoney, formatPercent, formatRelativeDay } from "../../design/format";
import { useLocalData } from "../analytics/useLocalData";
import { installmentProgress } from "../analytics/engine";
import { deleteInstallment } from "../../db/repositories";

export function InstallmentDetailPage() {
  const { installmentId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { lookups, dataset, ready } = useLocalData();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const item = useMemo(
    () =>
      installmentProgress(
        dataset.installments.filter((row) => row.id === installmentId),
        dataset.transactions,
        lookups,
      )[0] ?? null,
    [dataset.installments, dataset.transactions, lookups, installmentId],
  );

  const payments = useMemo(
    () =>
      dataset.transactions
        .filter((tx) => tx.installment_id === installmentId)
        .sort(byTxNewest),
    [dataset.transactions, installmentId],
  );

  if (!item) {
    return (
      <div className="space-y-4">
        <PageHeader title="Installment plan" />
        <Card>
          <EmptyState
            icon={<Layers className="h-7 w-7" />}
            title={ready ? "Plan not found" : "Loading…"}
            description={ready ? "It may have been deleted on another device." : undefined}
            action={
              <Button variant="primary" onClick={() => navigate("/installments")}>
                Back to installments
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const plan = item.plan;
  const remaining = Math.max(0, plan.total_amount - item.paidAmount);
  const done = item.remainingParts === 0;

  async function remove() {
    setBusy(true);
    try {
      await deleteInstallment(plan.id);
      toast.push({ tone: "success", title: "Plan deleted" });
      navigate("/installments");
    } catch (err) {
      toast.push({
        tone: "error",
        title: "Couldn't delete plan",
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
          <IconButton label="Back" onClick={() => navigate("/installments")}>
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
        }
        title={plan.notes || "Installment plan"}
        subtitle={`${item.paidParts} of ${plan.parts_count} parts paid`}
        actions={
          <>
            <Button
              variant="primary"
              size="sm"
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => navigate(`/installments/${plan.id}/edit`)}
            >
              Edit
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted uppercase">Remaining</p>
            <p className="tabular mt-0.5 text-display-sm font-semibold text-ink">
              {formatMoney(remaining, plan.currency)}
            </p>
            <p className="mt-1 text-xs text-muted">
              of {formatMoney(plan.total_amount, plan.currency)} total
            </p>
          </div>
          <Badge tone={done ? "income" : "primary"}>{done ? "Settled" : `${item.remainingParts} left`}</Badge>
        </div>
        <div className="px-4 pb-4">
          <ProgressBar
            value={Math.min(100, item.percent)}
            tone={done ? "income" : "primary"}
            label="Repayment progress"
          />
          <p className="mt-1.5 text-xs text-muted">{formatPercent(item.percent)} of the purchase paid.</p>
        </div>

        <Divider />

        <dl className="space-y-0.5 px-4 py-3">
          <DetailRow label="Per part">{formatMoney(item.partAmount, plan.currency)}</DetailRow>
          <DetailRow label="Paid so far">{formatMoney(item.paidAmount, plan.currency)}</DetailRow>
          <DetailRow label="Frequency">
            {plan.frequency === "weekly"
              ? "Weekly"
              : plan.frequency === "quarterly"
                ? "Quarterly"
                : "Monthly"}
          </DetailRow>
          <DetailRow label="First payment">{formatDate(plan.start_date, "medium")}</DetailRow>
          <DetailRow label="Next due">
            {item.nextDueDate ? formatRelativeDay(item.nextDueDate) : "None remaining"}
          </DetailRow>
          <DetailRow label="Pays from">
            {lookups.account.get(plan.from_account_id ?? "")?.name ?? "No account"}
          </DetailRow>
          <DetailRow label="Category">
            {plan.category_id ? (lookups.category.get(plan.category_id)?.name ?? "—") : "Uncategorised"}
          </DetailRow>
        </dl>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Schedule" subtitle="Every part of the plan" icon={<CalendarClock className="h-4 w-4" />} />
          <ul className="divide-y divide-line">
            {item.schedule.map((part) => (
              <li key={part.index} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${part.paid ? "bg-income" : "bg-line-strong"}`}
                  />
                  <span className={part.paid ? "text-muted line-through" : "text-ink"}>
                    Part {part.index + 1} · {formatDate(part.date, "medium")}
                  </span>
                </span>
                <span className="tabular text-sm font-semibold text-ink">
                  {formatMoney(part.amount, plan.currency)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Payments" subtitle={`${payments.length} recorded`} icon={<Receipt className="h-4 w-4" />} />
          {payments.length === 0 ? (
            <EmptyState
              compact
              icon={<Receipt className="h-6 w-6" />}
              title="No payments recorded yet"
              description="Record each part as a normal expense — it shows up here automatically."
              action={
                <Button variant="secondary" size="sm" onClick={() => navigate("/transactions?add=expense")}>
                  Record a payment
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {payments.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{tx.notes || plan.notes || "Payment"}</p>
                    <p className="text-xs text-muted">{formatRelativeDay(tx.date)}</p>
                  </div>
                  <span className="tabular text-sm font-semibold text-expense">
                    −{formatMoney(Math.abs(tx.amount), tx.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {!done && (
        <Alert tone="info" title="Changing the plan is safe">
          Editing the number of parts or the amount only affects future scheduling — payments
          already in your ledger are never rewritten.
        </Alert>
      )}

      <div>
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 className="h-4 w-4" />}
          onClick={() => setConfirmDelete(true)}
        >
          Delete plan
        </Button>
      </div>

      <ConfirmOverlay
        open={confirmDelete}
        busy={busy}
        tone="danger"
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Delete this plan?"
        confirmLabel="Delete plan"
        message="Payments already recorded stay in your ledger; only the schedule goes away."
      />
    </div>
  );
}

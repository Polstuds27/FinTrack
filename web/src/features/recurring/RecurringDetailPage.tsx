/**
 * Recurring rule detail — `/recurring/:recurringId`.
 *
 * Answers "what exactly repeats, and when?" by projecting the schedule forward
 * from the stored rule rather than reading a generated table, so the preview is
 * correct offline and never disagrees with the calendar.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarClock,
  Pause,
  Pencil,
  Play,
  Repeat,
  Trash2,
} from "lucide-react";
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
  useToast,
} from "../../components/ui";
import type { LocalRecurring } from "../../db/types";
import { byTxNewest, formatDate, formatMoney, formatRelativeDay, toDate } from "../../design/format";
import { categoryIcon } from "../../design/icons";
import { useLocalData } from "../analytics/useLocalData";
import { advanceOccurrence } from "../analytics/period";
import { deleteRecurring, updateRecurring } from "../../db/repositories";

const FREQUENCY_LABEL: Record<LocalRecurring["frequency"], string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export function RecurringDetailPage() {
  const { recurringId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { lookups, dataset, ready } = useLocalData();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const rule = dataset.recurring.find((row) => row.id === recurringId) ?? null;

  /** The next six occurrences, projected locally from the rule. */
  const schedule = useMemo(() => {
    if (!rule) return [];
    const out: Date[] = [];
    let cursor = toDate(rule.next_run_at);
    const end = rule.end_at ? toDate(rule.end_at) : null;
    for (let i = 0; i < 6; i += 1) {
      if (end && cursor > end) break;
      out.push(cursor);
      cursor = advanceOccurrence(cursor, rule.frequency);
    }
    return out;
  }, [rule]);

  const history = useMemo(
    () =>
      dataset.transactions
        .filter((tx) => tx.recurring_id === recurringId)
        .sort(byTxNewest)
        .slice(0, 10),
    [dataset.transactions, recurringId],
  );

  if (!rule) {
    return (
      <div className="space-y-4">
        <PageHeader title="Recurring rule" />
        <Card>
          <EmptyState
            icon={<Repeat className="h-7 w-7" />}
            title={ready ? "Rule not found" : "Loading…"}
            description={ready ? "It may have been deleted on another device." : undefined}
            action={
              <Button variant="primary" onClick={() => navigate("/recurring")}>
                Back to recurring
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const category = rule.category_id ? lookups.category.get(rule.category_id) : undefined;
  const Icon = categoryIcon(category?.icon ?? null, category?.name);

  async function toggle() {
    await updateRecurring(rule!.id, { enabled: !rule!.enabled });
    toast.push({
      tone: "success",
      title: rule!.enabled ? "Rule paused" : "Rule resumed",
      description: rule!.enabled
        ? "No further occurrences will be scheduled."
        : "It will run again from the next due date.",
    });
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteRecurring(rule!.id);
      toast.push({ tone: "success", title: "Rule deleted" });
      navigate("/recurring");
    } catch (err) {
      toast.push({
        tone: "error",
        title: "Couldn't delete rule",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  const tone =
    rule.type === "income" ? "text-income" : rule.type === "expense" ? "text-expense" : "text-transfer";

  return (
    <div className="space-y-4">
      <PageHeader
        leading={
          <IconButton label="Back" onClick={() => navigate("/recurring")}>
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
        }
        title={rule.notes || category?.name || `${rule.type} rule`}
        subtitle={`${FREQUENCY_LABEL[rule.frequency]} · ${rule.enabled ? "Active" : "Paused"}`}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={rule.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              onClick={() => void toggle()}
            >
              {rule.enabled ? "Pause" : "Resume"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => navigate(`/recurring/${rule.id}/edit`)}
            >
              Edit
            </Button>
          </>
        }
      />

      {!rule.enabled && (
        <Alert tone="warning" title="This rule is paused">
          No new occurrences will be scheduled until you resume it. Everything already recorded
          stays in your ledger.
        </Alert>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                rule.type === "income"
                  ? "bg-income-soft text-income"
                  : rule.type === "expense"
                    ? "bg-expense-soft text-expense"
                    : "bg-transfer-soft text-transfer"
              }`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <span className={`tabular block text-display-sm leading-none font-semibold ${tone}`}>
                {rule.type === "income" ? "+" : rule.type === "expense" ? "−" : ""}
                {formatMoney(rule.amount, rule.currency)}
              </span>
              <span className="mt-1 block text-xs text-muted">{FREQUENCY_LABEL[rule.frequency]}</span>
            </div>
          </div>
          <Badge tone={rule.enabled ? "income" : "neutral"}>
            {rule.enabled ? "Active" : "Paused"}
          </Badge>
        </div>

        <Divider />

        <dl className="space-y-0.5 px-4 py-3">
          <DetailRow label="Direction">
            {rule.type === "transfer"
              ? `${lookups.account.get(rule.from_account_id ?? "")?.name ?? "—"} → ${
                  lookups.account.get(rule.to_account_id ?? "")?.name ?? "—"
                }`
              : lookups.account.get(
                    rule.type === "income" ? rule.to_account_id ?? "" : rule.from_account_id ?? "",
                  )?.name ?? "No account"}
          </DetailRow>
          <DetailRow label="Category">{category?.name ?? "Uncategorised"}</DetailRow>
          <DetailRow label="Next run">{formatDate(rule.next_run_at, "medium")}</DetailRow>
          <DetailRow label="Last run">
            {rule.last_run_at ? formatRelativeDay(rule.last_run_at) : "Never"}
          </DetailRow>
          <DetailRow label="Ends">
            {rule.end_at ? formatDate(rule.end_at, "medium") : "No end date"}
          </DetailRow>
          <DetailRow label="Notes">{rule.notes || "—"}</DetailRow>
        </dl>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Upcoming occurrences"
            subtitle="Projected from the rule"
            icon={<CalendarClock className="h-4 w-4" />}
          />
          <ul className="divide-y divide-line">
            {schedule.map((date) => (
              <li
                key={date.toISOString()}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <span className="text-sm text-ink">{formatDate(date, "medium")}</span>
                <span className={`tabular text-sm font-semibold ${tone}`}>
                  {rule.type === "income" ? "+" : rule.type === "expense" ? "−" : ""}
                  {formatMoney(rule.amount, rule.currency)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Generated transactions" subtitle={`${history.length} in your ledger`} />
          {history.length === 0 ? (
            <EmptyState
              compact
              icon={<Repeat className="h-6 w-6" />}
              title="Nothing generated yet"
              description="Occurrences appear here once their due date passes and the generator runs."
            />
          ) : (
            <ul className="divide-y divide-line">
              {history.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{tx.notes || category?.name}</p>
                    <p className="text-xs text-muted">{formatRelativeDay(tx.date)}</p>
                  </div>
                  <span className={`tabular text-sm font-semibold ${tone}`}>
                    {formatMoney(tx.amount, tx.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div>
        <Button variant="danger" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
          Delete rule
        </Button>
      </div>

      <ConfirmOverlay
        open={confirmDelete}
        busy={busy}
        tone="danger"
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Delete this rule?"
        confirmLabel="Delete rule"
        message="Past occurrences already recorded in your ledger stay put — only the schedule stops."
      />
    </div>
  );
}

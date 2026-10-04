/**
 * Transaction detail.
 *
 * The single place a transaction is inspected, corrected or deleted. Reads the
 * row straight from IndexedDB, so it works with no connection and reflects an
 * edit made on this device the instant it lands. Editing swaps the sheet into
 * place rather than navigating away, so the user never loses their spot (§18).
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Bookmark,
  Cloud,
  CloudOff,
  Download,
  Pencil,
  Repeat,
  Tag,
  Trash2,
} from "lucide-react";
import { db } from "../../db";
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
  Overlay,
  PageHeader,
  useToast,
} from "../../components/ui";
import type { LocalTransaction } from "../../db/types";
import { formatDateTime, formatMoney } from "../../design/format";
import { categoryIcon } from "../../design/icons";
import { useLocalData } from "../analytics/useLocalData";
import { convert } from "../analytics/fx";
import { deleteTransaction, toggleBookmark } from "../../db/repositories";
import { TransactionForm } from "./TransactionForm";
import { transactionAccounts, transactionTitle } from "./TransactionList";

const TYPE_LABEL: Record<LocalTransaction["type"], string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
};

export function TransactionDetailPage() {
  const { transactionId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { lookups, dataset, ready } = useLocalData();

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const transaction = useMemo(
    () => dataset.transactions.find((tx) => tx.id === transactionId) ?? null,
    [dataset.transactions, transactionId],
  );

  // Attachments are not part of the sync dataset (they live in Cloudinary), so
  // they are read straight from IndexedDB.
  const attachmentCount = useLiveQuery(
    async () => (transaction ? db.attachments.where("transaction_id").equals(transaction.id).count() : 0),
    [transaction?.id],
    0,
  );

  if (!transaction) {
    return (
      <div className="space-y-4">
        <PageHeader title="Transaction" />
        <Card>
          <EmptyState
            icon={<Cloud className="h-7 w-7" />}
            title={ready ? "Transaction not found" : "Looking it up…"}
            description={
              ready
                ? "It may have been deleted on another device, or the link is out of date."
                : "Local data is still loading."
            }
            action={
              <Button variant="primary" onClick={() => navigate("/transactions")}>
                Back to transactions
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const category = transaction.category_id
    ? lookups.category.get(transaction.category_id)
    : undefined;
  const Icon = categoryIcon(category?.icon ?? null, category?.name);
  const tags = transaction.tag_ids
    .map((id) => lookups.tag.get(id))
    .filter((name): name is string => Boolean(name));
  const value = convert(Math.abs(transaction.amount), transaction.currency, lookups.fx);
  const foreign = transaction.currency !== lookups.dataset.baseCurrency;

  /**
   * Re-bound after the null guard so the hoisted handlers below can read it —
   * TypeScript does not preserve narrowing inside function declarations.
   */
  const tx = transaction;

  async function runDelete() {
    setBusy(true);
    try {
      await deleteTransaction(tx.id);
      toast.push({ tone: "success", title: "Transaction deleted" });
      setConfirmDelete(false);
      navigate("/transactions");
    } catch (err) {
      toast.push({
        tone: "error",
        title: "Couldn't delete",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function flipBookmark() {
    await toggleBookmark(tx.id);
    toast.push({
      tone: "success",
      title: tx.is_bookmarked ? "Bookmark removed" : "Bookmarked",
      description: tx.is_bookmarked ? undefined : "Find it under Bookmarks.",
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        leading={
          <IconButton label="Back" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
        }
        title={transactionTitle(transaction, lookups)}
        subtitle={TYPE_LABEL[transaction.type]}
        actions={
          <>
            <IconButton
              label={transaction.is_bookmarked ? "Remove bookmark" : "Bookmark this transaction"}
              onClick={() => void flipBookmark()}
              className={transaction.is_bookmarked ? "text-warning" : ""}
            >
              <Bookmark
                className={`h-5 w-5 ${transaction.is_bookmarked ? "fill-warning/25" : ""}`}
              />
            </IconButton>
            <Button
              variant="secondary"
              size="sm"
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-4">
          <div className="min-w-0">
            <span
              className={`tabular block text-display-lg leading-none font-semibold ${
                transaction.type === "income"
                  ? "text-income"
                  : transaction.type === "expense"
                    ? "text-expense"
                    : "text-transfer"
              }`}
            >
              {transaction.type === "income" ? "+" : transaction.type === "expense" ? "−" : ""}
              {formatMoney(Math.abs(transaction.amount), transaction.currency)}
            </span>
            <span className="mt-1 flex items-center gap-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Icon aria-hidden="true" className="h-4 w-4" />
                {category?.name ?? (transaction.type === "transfer" ? "Between accounts" : "Uncategorised")}
              </span>
            </span>
            {foreign && (
              <span className="tabular mt-1 block text-xs text-faint">
                ≈{formatMoney(value, lookups.dataset.baseCurrency)} in your base currency
              </span>
            )}
          </div>

          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={transaction.sync_status === "synced" ? "income" : "warning"}>
              {transaction.sync_status === "synced" ? (
                <Cloud aria-hidden="true" className="h-3 w-3" />
              ) : (
                <CloudOff aria-hidden="true" className="h-3 w-3" />
              )}
              {transaction.sync_status === "synced"
                ? "Synced"
                : transaction.sync_status === "pending"
                  ? "Waiting to sync"
                  : "Sync failed"}
            </Badge>
            {transaction.recurring_id && <Badge tone="info">Recurring</Badge>}
            {transaction.installment_id && <Badge tone="info">Installment</Badge>}
            {transaction.debt_id && <Badge tone="primary">Debt payment</Badge>}
            {transaction.savings_goal_id && <Badge tone="primary">Goal contribution</Badge>}
          </span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <dl className="space-y-0.5 px-4 py-3">
            <DetailRow label="Date">{formatDateTime(transaction.date)}</DetailRow>
            <DetailRow label="Type">{TYPE_LABEL[transaction.type]}</DetailRow>
            <DetailRow label="Account">
              {transactionAccounts(transaction, lookups) || "—"}
            </DetailRow>
            {transaction.type === "transfer" && transaction.from_account_id && (
              <DetailRow label="Counterparty">
                {lookups.account.get(transaction.to_account_id ?? "")?.name ?? "—"}
              </DetailRow>
            )}
            <DetailRow label="Currency">{transaction.currency}</DetailRow>
            <DetailRow label="Reference">{transaction.id.slice(0, 8)}</DetailRow>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Note & tags" />
          <div className="space-y-3 px-4 py-3">
            <p className={transaction.notes ? "text-sm text-ink" : "text-sm text-faint italic"}>
              {transaction.notes || "No note on this transaction."}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Tag aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
              {tags.length === 0 ? (
                <span className="text-xs text-faint">No tags</span>
              ) : (
                tags.map((name) => (
                  <span key={name} className="badge-primary">
                    {name}
                  </span>
                ))
              )}
            </div>
            <Divider />
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs text-muted">
                <Download aria-hidden="true" className="h-3.5 w-3.5" />
                {attachmentCount > 0 ? `${attachmentCount} attachment` : "No attachments yet"}
              </span>
              {transaction.recurring_id && (
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <Repeat aria-hidden="true" className="h-3.5 w-3.5" />
                  From a recurring rule
                </span>
              )}
            </div>
            <Alert tone="info" title="Attachments need a connection">
              Receipts upload through Cloudinary once you're back online. The entry itself is
              already saved on this device.
            </Alert>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 className="h-4 w-4" />}
          onClick={() => setConfirmDelete(true)}
        >
          Delete transaction
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Bookmark className="h-4 w-4" />}
          onClick={() => void flipBookmark()}
        >
          {transaction.is_bookmarked ? "Remove bookmark" : "Bookmark"}
        </Button>
      </div>

      <Overlay
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit transaction"
        variant="sheet"
        size="md"
      >
        <TransactionForm
          transaction={transaction}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </Overlay>

      <ConfirmOverlay
        open={confirmDelete}
        busy={busy}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void runDelete()}
        title="Delete this transaction?"
        confirmLabel="Delete"
        tone="danger"
        message="It will be removed from your history and any budgets or reports will recompute without it."
      />
    </div>
  );
}

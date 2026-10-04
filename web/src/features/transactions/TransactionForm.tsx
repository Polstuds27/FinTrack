/**
 * The transaction editor.
 *
 * One form, two hosts: the quick-add sheet (create) and the transaction detail
 * screen (create + edit). Amount first, then type, account, category, then the
 * optional metadata - the order a person actually records an expense in (§17).
 * Saving always goes through the repositories, so the change is written to
 * IndexedDB and queued for sync even with no connection.
 */
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Bookmark,
  Paperclip,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { LocalTransaction } from "../../db/types";
import { CURRENCIES, todayKey } from "../../design/format";
import {
  AmountInput,
  Button,
  Collapsible,
  Field,
  Input,
  SegmentedControl,
  Select,
  Textarea,
  useToast,
} from "../../components/ui";
import { useLocalData } from "../analytics/useLocalData";
import { usePreferences } from "../settings/preferences";
import {
  createTag,
  createTransaction,
  toggleBookmark,
  updateTransaction,
} from "../../db/repositories";

export type TransactionType = LocalTransaction["type"];

const TYPE_OPTIONS: {
  id: TransactionType;
  label: string;
  icon: ReactNode;
  tone: "expense" | "income" | "transfer";
}[] = [
  { id: "expense", label: "Expense", icon: <TrendingDown className="h-4 w-4" />, tone: "expense" },
  { id: "income", label: "Income", icon: <TrendingUp className="h-4 w-4" />, tone: "income" },
  { id: "transfer", label: "Transfer", icon: <ArrowLeftRight className="h-4 w-4" />, tone: "transfer" },
];

export interface TransactionFormProps {
  /** Omit to create. Provide to edit in place. */
  transaction?: LocalTransaction;
  /** Pre-selected type when creating from a deep link (`?add=income`). */
  initialType?: TransactionType;
  onSaved?: (id: string) => void;
  onCancel?: () => void;
  /** Compact variant used inside the bottom sheet. */
  dense?: boolean;
}

export function TransactionForm({
  transaction,
  initialType,
  onSaved,
  onCancel,
  dense = false,
}: TransactionFormProps) {
  const { lookups } = useLocalData();
  const { preferences, update } = usePreferences();
  const toast = useToast();

  const accounts = useMemo(
    () => lookups.dataset.accounts.filter((a) => !a.archived).sort((a, b) => a.name.localeCompare(b.name)),
    [lookups.dataset.accounts],
  );

  const [type, setType] = useState<TransactionType>(transaction?.type ?? initialType ?? "expense");
  const [amount, setAmount] = useState<number>(transaction ? Math.abs(transaction.amount) : 0);
  const [currency, setCurrency] = useState(transaction?.currency ?? accounts[0]?.currency ?? preferences.baseCurrency);
  const [fromAccount, setFromAccount] = useState<string>(
    transaction?.from_account_id ?? preferences.lastAccountId ?? accounts[0]?.id ?? "",
  );
  const [toAccount, setToAccount] = useState<string>(transaction?.to_account_id ?? "");
  const [categoryId, setCategoryId] = useState<string>(transaction?.category_id ?? "");
  const [date, setDate] = useState(transaction ? transaction.date.slice(0, 10) : todayKey());
  const [notes, setNotes] = useState(transaction?.notes ?? "");
  const [tagName, setTagName] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>(transaction?.tag_ids ?? []);
  const [bookmarked, setBookmarked] = useState(transaction?.is_bookmarked ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = useMemo(
    () =>
      lookups.dataset.categories
        .filter((c) => c.type === (type === "income" ? "income" : "expense"))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [lookups.dataset.categories, type],
  );

  // Income credits an account; expense and transfer debit one. Keep the picker
  // semantically correct so the ledger stays consistent.
  const creditAccountId = type === "income" ? toAccount || fromAccount : toAccount;
  const debitAccountId = type === "income" ? fromAccount : fromAccount;
  const selectedAccountId = type === "income" ? creditAccountId : debitAccountId;

  const availableTags = useMemo(
    () => [...lookups.dataset.tags].sort((a, b) => a.name.localeCompare(b.name)),
    [lookups.dataset.tags],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!amount || amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!fromAccount) {
      setError("Choose an account.");
      return;
    }
    if (type === "transfer" && !toAccount) {
      setError("Choose the destination account for this transfer.");
      return;
    }
    if (type === "transfer" && toAccount === fromAccount) {
      setError("A transfer needs two different accounts.");
      return;
    }

    setBusy(true);
    try {
      let tagIds = selectedTags;
      if (tagName.trim()) {
        const existing = availableTags.find((tag) => tag.name.toLowerCase() === tagName.trim().toLowerCase());
        const tag = existing ?? (await createTag(tagName.trim()));
        tagIds = [...tagIds, tag.id];
      }

      // Income lands in an account, so it always uses the credit-side field.
      const payload = {
        type,
        amount: Math.abs(amount),
        currency,
        from_account_id: type === "income" ? null : fromAccount,
        to_account_id: type === "expense" ? null : (type === "income" ? fromAccount : toAccount),
        category_id: type === "transfer" ? null : categoryId || null,
        date: new Date(`${date}T12:00:00`).toISOString(),
        notes: notes.trim(),
        tag_ids: tagIds,
        is_bookmarked: bookmarked,
      };

      const saved = transaction
        ? ((await updateTransaction(transaction.id, payload)) ?? transaction)
        : await createTransaction({ ...payload, fx_rate: 1 });

      await update({
        lastAccountId: selectedAccountId || null,
        lastCategoryId: categoryId || null,
      });

      toast.push({
        tone: "success",
        title: transaction ? "Transaction updated" : `${type === "expense" ? "Expense" : type === "income" ? "Income" : "Transfer"} saved`,
        description: transaction ? undefined : "Stored on this device and queued for sync.",
      });
      onSaved?.(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that transaction.");
    } finally {
      setBusy(false);
    }
  }

  async function bookmarkNow() {
    const next = !bookmarked;
    setBookmarked(next);
    if (transaction) await toggleBookmark(transaction.id);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && (
        <p role="alert" className="rounded-lg bg-expense-soft px-3 py-2 text-sm text-expense">
          {error}
        </p>
      )}

      <SegmentedControl
        options={TYPE_OPTIONS}
        value={type}
        onChange={(next) => {
          setType(next);
          setCategoryId("");
        }}
        ariaLabel="Transaction type"
      />

      <Field label="Amount" htmlFor="tx-amount">
        <AmountInput
          id="tx-amount"
          value={amount}
          onChange={setAmount}
          currency={currency}
          tone={type === "income" ? "income" : type === "expense" ? "expense" : "default"}
          autoFocus={!transaction}
        />
      </Field>

      {type === "transfer" ? (
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="From"
            value={fromAccount}
            onChange={(e) => setFromAccount(e.target.value)}
            required
          >
            <option value="">Select account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select label="To" value={toAccount} onChange={(e) => setToAccount(e.target.value)} required>
            <option value="">Select account</option>
            {accounts.filter((a) => a.id !== fromAccount).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={type === "income" ? "Deposit into" : "Paid from"}
            value={fromAccount}
            onChange={(e) => setFromAccount(e.target.value)}
            required
          >
            <option value="">Select account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </Select>
          {type === "expense" && (
            <Select
              label="Category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              hint={!categories.length ? "Create categories first." : undefined}
            >
              <option value="">Uncategorised</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_id ? "↳ " : ""}
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Date"
          type="date"
          value={date}
          max={todayKey()}
          onChange={(e) => setDate(e.target.value)}
          required
        />
        {type !== "transfer" && (
          <Select
            label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            hint={`Reports use ${preferences.baseCurrency}`}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        )}
      </div>

      <Textarea
        label="Note"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Merchant, description or anything you'll want to remember"
        maxLength={280}
        addon={
          <button
            type="button"
            onClick={bookmarkNow}
            aria-pressed={bookmarked}
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark this transaction"}
            className={`icon-btn h-7 w-7 ${bookmarked ? "text-warning" : ""}`}
          >
            <Bookmark className={`h-4 w-4 ${bookmarked ? "fill-warning/25" : ""}`} />
          </button>
        }
      />

      <Collapsible
        defaultOpen={!dense}
        summary={
          <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <Paperclip aria-hidden="true" className="h-4 w-4 text-muted" />
            Tags & attachments
          </span>
        }
      >
        <div className="space-y-3">
          {availableTags.length > 0 && (
            <div>
              <p className="label mb-1.5">Existing tags</p>
              <div className="flex flex-wrap gap-1.5">
                {availableTags.map((tag) => {
                  const on = selectedTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setSelectedTags((prev) =>
                          on ? prev.filter((id) => id !== tag.id) : [...prev, tag.id],
                        )
                      }
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        on
                          ? "border-primary bg-primary-soft-bg text-primary"
                          : "border-line-strong text-muted hover:text-ink"
                      }`}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <Input
            label="Add a tag"
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            placeholder="e.g. Reimbursable"
          />
          <p className="field-hint">
            Receipt uploads need a connection. Attach from the transaction screen once it is saved.
          </p>
        </div>
      </Collapsible>

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" variant="primary" size="lg" loading={busy} className="flex-1">
          {transaction ? "Save changes" : "Save transaction"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
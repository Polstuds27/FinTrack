/**
 * Recurring rule editor.
 *
 * `/recurring/new` and `/recurring/:recurringId/edit`. The rule describes the
 * schedule; occurrences become real transactions when the generator runs, so a
 * rule never fabricates money on its own.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { paramId } from "../../app/routeParams";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db";
import { createRecurring, deleteRecurring, updateRecurring } from "../../db/repositories";
import type { LocalRecurring } from "../../db/types";
import {
  AmountInput,
  Button,
  ConfirmOverlay,
  Field,
  Input,
  Overlay,
  SegmentedControl,
  Select,
  Textarea,
  useToast,
} from "../../components/ui";
import { useLocalData } from "../analytics/useLocalData";

type Kind = LocalRecurring["type"];
type Frequency = LocalRecurring["frequency"];

const FREQUENCIES: { id: Frequency; label: string }[] = [
  { id: "daily", label: "Every day" },
  { id: "weekly", label: "Every week" },
  { id: "monthly", label: "Every month" },
  { id: "yearly", label: "Every year" },
];

export function RecurringEditor() {
  const navigate = useNavigate();
  const toast = useToast();
  const { recurringId: rawRecurringId } = useParams<{ recurringId: string }>();
  const recurringId = paramId(rawRecurringId);
  const editing = recurringId !== undefined;
  const { lookups, ready } = useLocalData();

  const rule = useLiveQuery(
    async () => (recurringId ? db.recurring.get(recurringId) : undefined),
    [recurringId],
    undefined,
  );

  const [type, setType] = useState<Kind>("expense");
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState(lookups.dataset.baseCurrency);
  const [fromAccount, setFromAccount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [nextRun, setNextRun] = useState(() => new Date().toISOString().slice(0, 10));
  const [endAt, setEndAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!editing || !rule) return;
    setType(rule.type);
    setAmount(rule.amount);
    setCurrency(rule.currency);
    setFromAccount(rule.from_account_id ?? "");
    setToAccount(rule.to_account_id ?? "");
    setCategoryId(rule.category_id ?? "");
    setFrequency(rule.frequency);
    setNextRun(rule.next_run_at.slice(0, 10));
    setEndAt(rule.end_at ? rule.end_at.slice(0, 10) : "");
    setNotes(rule.notes);
  }, [editing, rule]);

  const accounts = [...lookups.dataset.accounts]
    .filter((row) => !row.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
  const categories = [...lookups.dataset.categories]
    .filter((row) => row.type === (type === "income" ? "income" : "expense"))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function save() {
    setError(null);
    if (!amount || amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!fromAccount && type !== "income") {
      setError("Choose the account this comes out of.");
      return;
    }
    if (!toAccount && type !== "expense") {
      setError("Choose the account this lands in.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        type,
        amount,
        currency,
        from_account_id: type === "income" ? null : fromAccount,
        to_account_id: type === "expense" ? null : type === "income" ? fromAccount : toAccount,
        category_id: categoryId || null,
        frequency,
        next_run_at: new Date(`${nextRun}T12:00:00`).toISOString(),
        end_at: endAt ? new Date(`${endAt}T12:00:00`).toISOString() : null,
        notes,
      };
      if (editing && rule) {
        await updateRecurring(rule.id, payload);
        toast.push({ tone: "success", title: "Recurring rule updated" });
      } else {
        await createRecurring(payload);
        toast.push({
          tone: "success",
          title: "Recurring rule created",
          description: "Occurrences appear in your ledger as they come due.",
        });
      }
      navigate("/recurring");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that rule.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  async function remove() {
    if (!recurringId) return;
    setBusy(true);
    try {
      await deleteRecurring(recurringId);
      toast.push({ tone: "success", title: "Recurring rule deleted" });
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

  if (editing && !rule && ready) {
    return (
      <Overlay
        open
        onClose={() => navigate("/recurring")}
        title="Rule not found"
        variant="sheet"
        size="sm"
        footer={<Button variant="primary" onClick={() => navigate("/recurring")}>Back</Button>}
      >
        <p className="text-sm text-muted">It may have been deleted on another device.</p>
      </Overlay>
    );
  }

  return (
    <>
      <Overlay
        open
        onClose={() => navigate("/recurring")}
        title={editing ? "Edit recurring rule" : "New recurring rule"}
        description="Rent, subscriptions, salary — anything that repeats."
        variant="sheet"
        size="md"
        footer={
          <>
            {editing && <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>}
            <Button variant="ghost" onClick={() => navigate("/recurring")}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              {editing ? "Save changes" : "Create rule"}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && (
            <p role="alert" className="rounded-lg bg-expense-soft px-3 py-2 text-sm text-expense">
              {error}
            </p>
          )}

          <Field label="Kind" required>
            <SegmentedControl
              options={[
                { id: "expense", label: "Expense", tone: "expense" },
                { id: "income", label: "Income", tone: "income" },
                { id: "transfer", label: "Transfer", tone: "transfer" },
              ]}
              value={type}
              onChange={(next) => {
                setType(next);
                setCategoryId("");
              }}
              ariaLabel="Recurring kind"
            />
          </Field>

          <Field label="Amount" htmlFor="rec-amount" required>
            <AmountInput
              id="rec-amount"
              value={amount}
              onChange={setAmount}
              currency={currency}
              tone={type === "income" ? "income" : "expense"}
              autoFocus={!editing}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={type === "income" ? "Deposit into" : "Pay from"}
              value={fromAccount}
              onChange={(event) => setFromAccount(event.target.value)}
              required={type !== "income"}
            >
              <option value="">Select account</option>
              {accounts.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </Select>
            {type === "transfer" && (
              <Select
                label="Transfer to"
                value={toAccount}
                onChange={(event) => setToAccount(event.target.value)}
                required
              >
                <option value="">Select account</option>
                {accounts
                  .filter((row) => row.id !== fromAccount)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
              </Select>
            )}
            {type !== "transfer" && (
              <Select
                label="Category"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">Uncategorised</option>
                {categories.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </Select>
            )}
            <Select label="Frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as Frequency)}>
              {FREQUENCIES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Next run"
              type="date"
              value={nextRun}
              onChange={(event) => setNextRun(event.target.value)}
              required
            />
            <Input
              label="Ends"
              type="date"
              value={endAt}
              onChange={(event) => setEndAt(event.target.value)}
              hint="Optional — leave empty to run indefinitely."
            />
          </div>

          <Textarea
            label="Notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Netflix, salary, rent…"
            maxLength={200}
          />

          <button type="submit" className="sr-only">
            Save
          </button>
        </form>
      </Overlay>

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
    </>
  );
}

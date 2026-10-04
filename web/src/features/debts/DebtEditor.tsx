/**
 * Debt editor.
 *
 * Routed at `/debts/new` and `/debts/:debtId/edit`. The direction ("I owe" vs
 * "owed to me") is chosen first because it decides whether payments reduce or
 * increase your net worth — never both.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { paramId } from "../../app/routeParams";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db";
import { createDebt, deleteDebt, updateDebt } from "../../db/repositories";
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

export function DebtEditor() {
  const navigate = useNavigate();
  const toast = useToast();
  const { debtId: rawDebtId } = useParams<{ debtId: string }>();
  const debtId = paramId(rawDebtId);
  const editing = debtId !== undefined;
  const { lookups, ready } = useLocalData();

  const debt = useLiveQuery(
    async () => (debtId ? db.debts.get(debtId) : undefined),
    [debtId],
    undefined,
  );

  const [counterparty, setCounterparty] = useState("");
  const [direction, setDirection] = useState<"i_owe" | "owed_to_me">("i_owe");
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState(lookups.dataset.baseCurrency);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!editing || !debt) return;
    setCounterparty(debt.counterparty);
    setDirection(debt.direction);
    setAmount(debt.original_amount);
    setCurrency(debt.currency);
    setDueDate(debt.due_date ? debt.due_date.slice(0, 10) : "");
    setNotes(debt.notes);
  }, [editing, debt]);

  async function save() {
    setError(null);
    if (!counterparty.trim()) {
      setError("Name the person or institution on the other side.");
      return;
    }
    if (!amount || amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setBusy(true);
    try {
      if (editing && debt) {
        await updateDebt(debt.id, {
          counterparty: counterparty.trim(),
          direction,
          original_amount: amount,
          currency,
          due_date: dueDate || null,
          notes,
        });
        toast.push({ tone: "success", title: "Debt updated" });
      } else {
        await createDebt({
          counterparty: counterparty.trim(),
          direction,
          original_amount: amount,
          currency,
          due_date: dueDate || null,
          notes,
        });
        toast.push({
          tone: "success",
          title: direction === "i_owe" ? "Debt recorded" : "Receivable recorded",
          description: "Payments made against it will show up in its history.",
        });
      }
      navigate("/debts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that debt.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  async function remove() {
    if (!debtId) return;
    setBusy(true);
    try {
      await deleteDebt(debtId);
      toast.push({ tone: "success", title: "Debt deleted" });
      navigate("/debts");
    } catch (err) {
      toast.push({
        tone: "error",
        title: "Couldn't delete debt",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  if (editing && !debt && ready) {
    return (
      <Overlay
        open
        onClose={() => navigate("/debts")}
        title="Debt not found"
        variant="sheet"
        size="sm"
        footer={<Button variant="primary" onClick={() => navigate("/debts")}>Back to debts</Button>}
      >
        <p className="text-sm text-muted">It may have been deleted on another device.</p>
      </Overlay>
    );
  }

  return (
    <>
      <Overlay
        open
        onClose={() => navigate("/debts")}
        title={editing ? "Edit" : "New"}
        description="Who owes whom, how much, and by when."
        variant="sheet"
        size="md"
        footer={
          <>
            {editing && <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>}
            <Button variant="ghost" onClick={() => navigate("/debts")}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              {editing ? "Save changes" : "Create"}
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

          <Field label="Direction" required>
            <SegmentedControl
              options={[
                { id: "i_owe", label: "I owe", tone: "expense" },
                { id: "owed_to_me", label: "Owed to me", tone: "income" },
              ]}
              value={direction}
              onChange={(next) => setDirection(next)}
              ariaLabel="Debt direction"
            />
          </Field>

          <Input
            label={direction === "i_owe" ? "Owed to" : "Owed by"}
            value={counterparty}
            onChange={(event) => setCounterparty(event.target.value)}
            placeholder={direction === "i_owe" ? "e.g. Bank" : "e.g. Alex"}
            maxLength={80}
            required
            autoFocus={!editing}
          />

          <Field label="Amount" htmlFor="debt-amount" required>
            <AmountInput
              id="debt-amount"
              value={amount}
              onChange={setAmount}
              currency={currency}
              tone={direction === "i_owe" ? "expense" : "income"}
              autoFocus={false}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {[lookups.dataset.baseCurrency, "USD", "EUR", "GBP", "PHP"].filter(
                (code, index, all) => all.indexOf(code) === index,
              ).map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
            <Input
              label="Due date"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              hint="Optional — drives the overdue badge."
            />
          </div>

          <Textarea
            label="Notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Agreement, interest rate, anything worth remembering"
            maxLength={280}
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
        title="Delete this record?"
        confirmLabel="Delete"
        message="Linked payment transactions stay in your ledger; only this running balance goes away."
      />
    </>
  );
}

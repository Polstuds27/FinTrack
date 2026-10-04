/**
 * Installment-plan editor.
 *
 * `/installments/new` and `/installments/:installmentId/edit`. The plan only
 * describes how a purchase is split; each part becomes a real transaction when
 * it is paid, so nothing is double-counted (§23).
 */
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { paramId } from "../../app/routeParams";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db";
import {
  createInstallment,
  deleteInstallment,
  updateInstallment,
} from "../../db/repositories";
import type { LocalInstallment } from "../../db/types";
import {
  AmountInput,
  Button,
  ConfirmOverlay,
  Field,
  Input,
  Overlay,
  Select,
  Textarea,
  useToast,
} from "../../components/ui";
import { useLocalData } from "../analytics/useLocalData";

type Frequency = LocalInstallment["frequency"];

const FREQUENCIES: { id: Frequency; label: string }[] = [
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
];

export function InstallmentEditor() {
  const navigate = useNavigate();
  const toast = useToast();
  const { installmentId: rawInstallmentId } = useParams<{ installmentId: string }>();
  const installmentId = paramId(rawInstallmentId);
  const editing = installmentId !== undefined;
  const { lookups, ready } = useLocalData();

  const plan = useLiveQuery(
    async () => (installmentId ? db.installments.get(installmentId) : undefined),
    [installmentId],
    undefined,
  );

  const [total, setTotal] = useState(0);
  const [parts, setParts] = useState(6);
  const [currency, setCurrency] = useState(lookups.dataset.baseCurrency);
  const [fromAccount, setFromAccount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!editing || !plan) return;
    setTotal(plan.total_amount);
    setParts(plan.parts_count);
    setCurrency(plan.currency);
    setFromAccount(plan.from_account_id ?? "");
    setCategoryId(plan.category_id ?? "");
    setStartDate(plan.start_date.slice(0, 10));
    setFrequency(plan.frequency);
    setNotes(plan.notes);
  }, [editing, plan]);

  const accounts = [...lookups.dataset.accounts]
    .filter((row) => !row.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
  const categories = [...lookups.dataset.categories]
    .filter((row) => row.type === "expense")
    .sort((a, b) => a.name.localeCompare(b.name));

  const partAmount = parts > 0 && total > 0 ? Math.floor((total / parts) * 100) / 100 : 0;

  async function save() {
    setError(null);
    if (!total || total <= 0) {
      setError("Enter the full purchase amount.");
      return;
    }
    if (parts < 2 || parts > 60) {
      setError("Choose between 2 and 60 parts.");
      return;
    }
    if (!fromAccount) {
      setError("Choose the account making the payments.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        total_amount: total,
        parts_count: parts,
        currency,
        from_account_id: fromAccount,
        category_id: categoryId || null,
        start_date: startDate,
        frequency,
        notes,
      };
      if (editing && plan) {
        await updateInstallment(plan.id, payload);
        toast.push({ tone: "success", title: "Installment plan updated" });
      } else {
        await createInstallment(payload);
        toast.push({
          tone: "success",
          title: "Installment plan created",
          description: "Each due part appears in the calendar as it comes.",
        });
      }
      navigate("/installments");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that plan.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  async function remove() {
    if (!installmentId) return;
    setBusy(true);
    try {
      await deleteInstallment(installmentId);
      toast.push({ tone: "success", title: "Installment plan deleted" });
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

  if (editing && !plan && ready) {
    return (
      <Overlay
        open
        onClose={() => navigate("/installments")}
        title="Plan not found"
        variant="sheet"
        size="sm"
        footer={<Button variant="primary" onClick={() => navigate("/installments")}>Back</Button>}
      >
        <p className="text-sm text-muted">It may have been deleted on another device.</p>
      </Overlay>
    );
  }

  return (
    <>
      <Overlay
        open
        onClose={() => navigate("/installments")}
        title={editing ? "Edit installment plan" : "New installment plan"}
        description="Split a purchase into equal parts across time."
        variant="sheet"
        size="md"
        footer={
          <>
            {editing && <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>}
            <Button variant="ghost" onClick={() => navigate("/installments")}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              {editing ? "Save changes" : "Create plan"}
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

          <Field label="Purchase amount" htmlFor="ins-total" required>
            <AmountInput
              id="ins-total"
              value={total}
              onChange={setTotal}
              currency={currency}
              tone="expense"
              autoFocus={!editing}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Number of parts"
              type="number"
              min={2}
              max={60}
              value={parts}
              onChange={(event) => setParts(Number(event.target.value))}
              required
              hint={partAmount > 0 ? `${partAmount.toFixed(2)} ${currency} per part.` : undefined}
            />
            <Select label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {[lookups.dataset.baseCurrency, "USD", "EUR", "GBP", "PHP"].filter(
                (code, index, all) => all.indexOf(code) === index,
              ).map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </div>

          <Select
            label="Pay from"
            value={fromAccount}
            onChange={(event) => setFromAccount(event.target.value)}
            required
          >
            <option value="">Select account</option>
            {accounts.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>

          <Select label="Category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Uncategorised</option>
            {categories.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="First payment"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              required
            />
            <Select label="Frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as Frequency)}>
              {FREQUENCIES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <Textarea
            label="Notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="What this purchase was"
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
        title="Delete this plan?"
        confirmLabel="Delete plan"
        message="Payments already recorded stay in your ledger; only the schedule goes away."
      />
    </>
  );
}

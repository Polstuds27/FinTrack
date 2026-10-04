/**
 * Budget editor.
 *
 * Routed at `/budgets/new` and `/budgets/:budgetId/edit` so the URL is the
 * source of truth — the browser Back button closes it and a shared link opens
 * the same sheet.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { paramId } from "../../app/routeParams";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db";
import { createBudget, deleteBudget, updateBudget } from "../../db/repositories";
import type { LocalBudget } from "../../db/types";
import {
  AmountInput,
  Button,
  ConfirmOverlay,
  Field,
  Input,
  Overlay,
  Select,
  useToast,
} from "../../components/ui";
import { useLocalData } from "../analytics/useLocalData";

type Period = LocalBudget["period"];

const PERIODS: { id: Period; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "weekly", label: "Weekly" },
  { id: "yearly", label: "Yearly" },
];

export function BudgetEditor() {
  const navigate = useNavigate();
  const toast = useToast();
  const { budgetId: rawBudgetId } = useParams<{ budgetId: string }>();
  const budgetId = paramId(rawBudgetId);
  const editing = budgetId !== undefined;
  const { lookups, ready } = useLocalData();

  const budget = useLiveQuery(
    async () => (budgetId ? db.budgets.get(budgetId) : undefined),
    [budgetId],
    undefined,
  );

  const [amount, setAmount] = useState(0);
  const [categoryId, setCategoryId] = useState("");
  const [period, setPeriod] = useState<Period>("monthly");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [threshold, setThreshold] = useState(80);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!editing || !budget) return;
    setAmount(budget.amount);
    setCategoryId(budget.category_id ?? "");
    setPeriod(budget.period);
    setStartDate(budget.start_date.slice(0, 10));
    setThreshold(budget.alert_threshold);
  }, [editing, budget]);

  const categories = [...lookups.dataset.categories]
    .filter((row) => !row.parent_id && row.type === "expense")
    .sort((a, b) => a.name.localeCompare(b.name));

  const currency = lookups.dataset.baseCurrency;

  async function save() {
    setError(null);
    if (!amount || amount <= 0) {
      setError("Set a budget greater than zero.");
      return;
    }
    setBusy(true);
    try {
      if (editing && budget) {
        await updateBudget(budget.id, {
          amount,
          category_id: categoryId || null,
          period,
          start_date: startDate,
          alert_threshold: threshold,
        });
        toast.push({ tone: "success", title: "Budget updated" });
      } else {
        await createBudget({
          amount,
          category_id: categoryId || null,
          period,
          start_date: startDate,
          alert_threshold: threshold,
        });
        toast.push({
          tone: "success",
          title: "Budget created",
          description: "Spending in this category now counts against it.",
        });
      }
      navigate("/budgets");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that budget.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  async function remove() {
    if (!budgetId) return;
    setBusy(true);
    try {
      await deleteBudget(budgetId);
      toast.push({ tone: "success", title: "Budget deleted" });
      navigate("/budgets");
    } catch (err) {
      toast.push({
        tone: "error",
        title: "Couldn't delete budget",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  if (editing && !budget && ready) {
    return (
      <Overlay
        open
        onClose={() => navigate("/budgets")}
        title="Budget not found"
        variant="sheet"
        size="sm"
        footer={
          <Button variant="primary" onClick={() => navigate("/budgets")}>
            Back to budgets
          </Button>
        }
      >
        <p className="text-sm text-muted">It may have been deleted on another device.</p>
      </Overlay>
    );
  }

  return (
    <>
      <Overlay
        open
        onClose={() => navigate("/budgets")}
        title={editing ? "Edit budget" : "New budget"}
        description="Leave the category empty to budget your total spending."
        variant="sheet"
        size="md"
        footer={
          <>
            {editing && <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>}
            <Button variant="ghost" onClick={() => navigate("/budgets")}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              {editing ? "Save changes" : "Create budget"}
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

          <Field label="Limit" htmlFor="budget-amount" required>
            <AmountInput
              id="budget-amount"
              value={amount}
              onChange={setAmount}
              currency={currency}
              autoFocus={!editing}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              hint="Empty means total spending."
            >
              <option value="">Everything I spend</option>
              {categories.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </Select>

            <Select label="Period" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
              {PERIODS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Starts"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              hint="Weekly and yearly budgets run from this date."
            />
            <Input
              label="Alert me at"
              type="number"
              min={1}
              max={200}
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
              trailing={<span className="pointer-events-none text-sm text-muted">%</span>}
              hint="Turns the bar amber once crossed."
            />
          </div>

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
        title="Delete this budget?"
        confirmLabel="Delete budget"
        message="Your transactions are untouched — you just lose the limit for that category."
      />
    </>
  );
}

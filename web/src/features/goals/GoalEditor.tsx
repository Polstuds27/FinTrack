/**
 * Savings-goal editor.
 *
 * Routed at `/goals/new` and `/goals/:goalId/edit`. Contributions are never
 * entered here — they are ledger entries tagged with the goal, so the balance
 * always traces back to real transactions.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { paramId } from "../../app/routeParams";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db";
import {
  createSavingsGoal,
  deleteSavingsGoal,
  updateSavingsGoal,
} from "../../db/repositories";
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

export function GoalEditor() {
  const navigate = useNavigate();
  const toast = useToast();
  const { goalId: rawGoalId } = useParams<{ goalId: string }>();
  const goalId = paramId(rawGoalId);
  const editing = goalId !== undefined;
  const { lookups, ready } = useLocalData();

  const goal = useLiveQuery(
    async () => (goalId ? db.savings_goals.get(goalId) : undefined),
    [goalId],
    undefined,
  );

  const [name, setName] = useState("");
  const [target, setTarget] = useState(0);
  const [currency, setCurrency] = useState(lookups.dataset.baseCurrency);
  const [targetDate, setTargetDate] = useState("");
  const [linkedAccount, setLinkedAccount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!editing || !goal) return;
    setName(goal.name);
    setTarget(goal.target_amount);
    setCurrency(goal.currency);
    setTargetDate(goal.target_date ? goal.target_date.slice(0, 10) : "");
    setLinkedAccount(goal.linked_account_id ?? "");
  }, [editing, goal]);

  const accounts = [...lookups.dataset.accounts]
    .filter((row) => !row.archived)
    .sort((a, b) => a.name.localeCompare(b.name));

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError("Name the goal so you recognise it later.");
      return;
    }
    if (!target || target <= 0) {
      setError("Set a target greater than zero.");
      return;
    }
    setBusy(true);
    try {
      if (editing && goal) {
        await updateSavingsGoal(goal.id, {
          name: name.trim(),
          target_amount: target,
          currency,
          target_date: targetDate || null,
          linked_account_id: linkedAccount || null,
        });
        toast.push({ tone: "success", title: "Goal updated" });
      } else {
        await createSavingsGoal({
          name: name.trim(),
          target_amount: target,
          currency,
          target_date: targetDate || null,
          linked_account_id: linkedAccount || null,
        });
        toast.push({
          tone: "success",
          title: "Goal created",
          description: "Transfer money to it and progress updates automatically.",
        });
      }
      navigate("/goals");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that goal.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  async function remove() {
    if (!goalId) return;
    setBusy(true);
    try {
      await deleteSavingsGoal(goalId);
      toast.push({ tone: "success", title: "Goal deleted" });
      navigate("/goals");
    } catch (err) {
      toast.push({
        tone: "error",
        title: "Couldn't delete goal",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  if (editing && !goal && ready) {
    return (
      <Overlay
        open
        onClose={() => navigate("/goals")}
        title="Goal not found"
        variant="sheet"
        size="sm"
        footer={<Button variant="primary" onClick={() => navigate("/goals")}>Back to goals</Button>}
      >
        <p className="text-sm text-muted">It may have been deleted on another device.</p>
      </Overlay>
    );
  }

  return (
    <>
      <Overlay
        open
        onClose={() => navigate("/goals")}
        title={editing ? "Edit goal" : "New savings goal"}
        description="Progress comes from the transactions tagged with this goal."
        variant="sheet"
        size="md"
        footer={
          <>
            {editing && <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>}
            <Button variant="ghost" onClick={() => navigate("/goals")}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              {editing ? "Save changes" : "Create goal"}
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

          <Input
            label="What are you saving for?"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Emergency fund"
            maxLength={80}
            required
            autoFocus={!editing}
          />

          <Field label="Target" htmlFor="goal-target" required>
            <AmountInput
              id="goal-target"
              value={target}
              onChange={setTarget}
              currency={currency}
              autoFocus={false}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {[...new Set([lookups.dataset.baseCurrency, ...accounts.map((a) => a.currency)])].map(
                (code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ),
              )}
            </Select>
            <Input
              label="Target date"
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
              hint="Optional — enables the required-per-month figure."
            />
          </div>

          <Select
            label="Linked account"
            value={linkedAccount}
            onChange={(event) => setLinkedAccount(event.target.value)}
            hint="Optional — shows the account alongside progress."
          >
            <option value="">None</option>
            {accounts.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>

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
        title="Delete this goal?"
        confirmLabel="Delete goal"
        message="Contributions you recorded stay in your ledger — only the target goes away."
      />
    </>
  );
}

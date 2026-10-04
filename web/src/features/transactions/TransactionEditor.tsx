/**
 * Routed transaction editor.
 *
 * Serves `/transactions/new` and `/transactions/:transactionId/edit`: the URL is
 * the source of truth, so Back closes the sheet and a shared link opens the
 * right record. The form itself is unchanged — it is simply hosted here.
 */
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { paramId } from "../../app/routeParams";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db";
import { Button, Overlay } from "../../components/ui";
import { TransactionForm, type TransactionType } from "./TransactionForm";
import { useLocalData } from "../analytics/useLocalData";

const TYPES: TransactionType[] = ["expense", "income", "transfer"];

export function TransactionEditor() {
  const navigate = useNavigate();
  const { transactionId: rawTransactionId } = useParams<{ transactionId: string }>();
  const transactionId = paramId(rawTransactionId);
  const [params] = useSearchParams();
  const editing = transactionId !== undefined;
  const { ready } = useLocalData();

  const requested = params.get("add");
  const initialType = TYPES.includes(requested as TransactionType)
    ? (requested as TransactionType)
    : undefined;

  const transaction = useLiveQuery(
    async () => (transactionId ? db.transactions.get(transactionId) : undefined),
    [transactionId],
    undefined,
  );

  const back = () => navigate(editing ? `/transactions/${transactionId}` : "/transactions");

  if (editing && !transaction && ready) {
    return (
      <Overlay
        open
        onClose={() => navigate("/transactions")}
        title="Transaction not found"
        variant="sheet"
        size="sm"
        footer={<Button variant="primary" onClick={() => navigate("/transactions")}>Back to transactions</Button>}
      >
        <p className="text-sm text-muted">It may have been deleted on another device.</p>
      </Overlay>
    );
  }

  return (
    <Overlay
      open
      onClose={back}
      title={editing ? "Edit transaction" : "New transaction"}
      description={
        editing
          ? undefined
          : initialType === "income"
            ? "Money in."
            : initialType === "transfer"
              ? "Move money between your own accounts — never counted as income or spending."
              : "Money out."
      }
      variant="sheet"
      size="md"
    >
      <TransactionForm
        key={transactionId ?? "new"}
        transaction={editing ? transaction : undefined}
        initialType={editing ? undefined : initialType}
        onSaved={(id) => navigate(editing ? `/transactions/${id}` : "/transactions")}
        onCancel={back}
      />
    </Overlay>
  );
}

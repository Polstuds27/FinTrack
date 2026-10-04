/**
 * Quick add.
 *
 * The fastest path from "I just spent money" to a recorded transaction: bottom
 * sheet on mobile, side drawer on desktop, amount first. Opened from the central
 * "+" in the mobile bottom bar and from the Overview/Transactions actions.
 */
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Overlay } from "../../components/ui";
import { TransactionForm, type TransactionType } from "./TransactionForm";

export interface QuickAddSheetProps {
  open: boolean;
  onClose: () => void;
}

const TYPES: TransactionType[] = ["expense", "income", "transfer"];

/**
 * Deep-linkable: `/transactions?add=expense` opens the sheet straight into that
 * type, which is what the "New expense" / "New income" buttons link to.
 */
export function QuickAddSheet({ open, onClose }: QuickAddSheetProps) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("add");
  const initialType = TYPES.includes(requested as TransactionType)
    ? (requested as TransactionType)
    : undefined;

  // Clear the deep link once the sheet closes so a refresh doesn't reopen it.
  const requestedKey = requested ?? "";
  useEffect(() => {
    if (open || !requestedKey) return;
    const next = new URLSearchParams(params);
    next.delete("add");
    setParams(next, { replace: true });
    // `params` is intentionally omitted: depending on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requestedKey]);

  if (!open) return null;

  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="Add transaction"
      description="Saved on this device first, then synced."
      variant="sheet"
      size="md"
    >
      <TransactionForm
        key={initialType ?? "default"}
        initialType={initialType}
        dense
        onSaved={onClose}
        onCancel={onClose}
      />
    </Overlay>
  );
}
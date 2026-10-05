/**
 * Quick add.
 *
 * The fastest path from "I just spent money" to a recorded transaction: bottom
 * sheet on mobile, side drawer on desktop, amount first. Opened from the central
 * "+" in the mobile bottom bar and from the Overview/Transactions actions.
 */
import { useCallback, useEffect } from "react";
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

  // Closing has to drop the `?add=` deep link *at the same time*: the parent
  // derives `open` from that param, so leaving it in place would flip the sheet
  // straight back open (X / Escape / Cancel all looked like no-ops).
  const close = useCallback(() => {
    if (params.has("add")) {
      const next = new URLSearchParams(params);
      next.delete("add");
      setParams(next, { replace: true });
    }
    onClose();
  }, [params, setParams, onClose]);

  // Safety net for a stale deep link landing on a route that doesn't open the
  // sheet (`/overview?add=expense`): clear it so a refresh doesn't keep it.
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
      onClose={close}
      title="Add transaction"
      description="Saved on this device first, then synced."
      variant="sheet"
      size="md"
    >
      <TransactionForm
        key={initialType ?? "default"}
        initialType={initialType}
        dense
        onSaved={close}
        onCancel={close}
      />
    </Overlay>
  );
}
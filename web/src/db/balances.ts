import { db } from "./index";

/**
 * Balance is always derived from the local ledger (same rule as the server).
 * Accounts keep `current_balance` as a cache that this recomputes.
 */
export async function recalcBalances(): Promise<void> {
  const accounts = await db.accounts.toArray();
  const txs = (await db.transactions.toArray()).filter((t) => !t.deleted_at);
  for (const acc of accounts) {
    let balance = acc.opening_balance;
    for (const t of txs) {
      if (t.type === "income") {
        if (t.to_account_id === acc.id) balance += t.amount;
      } else if (t.type === "expense") {
        if (t.from_account_id === acc.id) balance -= t.amount;
      } else if (t.type === "transfer") {
        if (t.from_account_id === acc.id) balance -= t.amount;
        if (t.to_account_id === acc.id) balance += t.amount;
      }
    }
    if (balance !== acc.current_balance) {
      await db.accounts.update(acc.id, { current_balance: balance });
    }
  }
}
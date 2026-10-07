import { recalcBalances } from "./balances";
import { db } from "./index";
import type {
  EntityName,
  LocalAccount,
  LocalAccountGroup,
  LocalBudget,
  LocalCategory,
  LocalDebt,
  LocalExchangeRate,
  LocalInstallment,
  LocalRecurring,
  LocalRow,
  LocalSavingsGoal,
  LocalTag,
  LocalTransaction,
} from "./types";
import { enqueueMutation } from "../sync/outbox";
import { byTxNewest } from "../design/format";

export { recalcBalances };

export function newId(): string {
  return crypto.randomUUID();
}

const now = () => new Date().toISOString();

/**
 * The birth stamp for a new row: one instant shared by `created_at` and
 * `updated_at`, so the outbox entry (which reads the row's `created_at`)
 * carries exactly what Dexie stored — not a millisecond-later sibling.
 */
function stamp(): Pick<LocalRow, "created_at" | "updated_at"> {
  const at = now();
  return { created_at: at, updated_at: at };
}

/**
 * Every local edit re-stamps `updated_at` and re-queues, but must never move
 * `created_at` — not even when the patch (e.g. a pulled payload replayed by
 * mistake) carries one. Birth is written once, by `stamp()`.
 */
function edited<T extends LocalRow>(existing: T, patch: Partial<T>): T {
  return { ...existing, ...patch, created_at: existing.created_at, sync_status: "pending", updated_at: now() };
}

/** Soft-deleted rows stay in IndexedDB (tombstones) but never surface in the UI. */
function live<T extends { deleted_at: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => !row.deleted_at);
}

/* ------------------------------------------------------------------ reads */

export async function listAccounts(): Promise<LocalAccount[]> {
  return live(await db.accounts.toArray()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listAccountGroups(): Promise<LocalAccountGroup[]> {
  return live(await db.account_groups.toArray()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listCategories(): Promise<LocalCategory[]> {
  return live(await db.categories.toArray()).sort(
    (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
  );
}

export async function listTags(): Promise<LocalTag[]> {
  return live(await db.tags.toArray()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listTransactions(): Promise<LocalTransaction[]> {
  return live(await db.transactions.toArray()).sort(byTxNewest);
}

export async function listBudgets(): Promise<LocalBudget[]> {
  return live(await db.budgets.toArray());
}

export async function listRecurring(): Promise<LocalRecurring[]> {
  return live(await db.recurring.toArray()).sort((a, b) => a.next_run_at.localeCompare(b.next_run_at));
}

export async function listInstallments(): Promise<LocalInstallment[]> {
  return live(await db.installments.toArray()).sort((a, b) => a.start_date.localeCompare(b.start_date));
}

export async function listDebts(): Promise<LocalDebt[]> {
  return live(await db.debts.toArray()).sort((a, b) =>
    (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
  );
}

export async function listSavingsGoals(): Promise<LocalSavingsGoal[]> {
  return live(await db.savings_goals.toArray()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listExchangeRates(): Promise<LocalExchangeRate[]> {
  return live(await db.exchange_rates.toArray()).sort((a, b) => b.date.localeCompare(a.date));
}

export async function getRow(entity: EntityName, id: string): Promise<LocalRow | undefined> {
  switch (entity) {
    case "accounts":
      return db.accounts.get(id);
    case "account_groups":
      return db.account_groups.get(id);
    case "budgets":
      return db.budgets.get(id);
    case "categories":
      return db.categories.get(id);
    case "debts":
      return db.debts.get(id);
    case "exchange_rates":
      return db.exchange_rates.get(id);
    case "installments":
      return db.installments.get(id);
    case "recurring":
      return db.recurring.get(id);
    case "savings_goals":
      return db.savings_goals.get(id);
    case "tags":
      return db.tags.get(id);
    case "transactions":
      return db.transactions.get(id);
  }
}

/* ---------------------------------------------------------------- accounts */

type AccountInput = Pick<LocalAccount, "name" | "type" | "currency" | "opening_balance"> &
  Partial<Pick<LocalAccount, "credit_limit" | "statement_day" | "due_day" | "group_id">>;

export async function createAccount(input: AccountInput): Promise<LocalAccount> {
  const account: LocalAccount = {
    id: newId(),
    group_id: input.group_id ?? null,
    name: input.name,
    type: input.type,
    currency: input.currency,
    opening_balance: input.opening_balance,
    current_balance: input.opening_balance,
    credit_limit: input.credit_limit ?? null,
    statement_day: input.statement_day ?? null,
    due_day: input.due_day ?? null,
    archived: false,
    version: 0,
    deleted_at: null,
    sync_status: "pending",
    ...stamp(),
  };
  await db.accounts.add(account);
  await enqueueMutation("accounts", account.id, "create", account, 0);
  return account;
}

export async function updateAccount(
  id: string,
  patch: Partial<LocalAccount>,
): Promise<LocalAccount | undefined> {
  const existing = await db.accounts.get(id);
  if (!existing) return undefined;
  const next: LocalAccount = edited(existing, patch);
  await db.accounts.put(next);
  if (patch.opening_balance !== undefined) await recalcBalances();
  await enqueueMutation("accounts", id, "update", next, existing.version);
  return next;
}

/**
 * Accounts are soft-deleted like every other row, but only when no ledger entry
 * still points at them - the server protects those rows, so failing early gives a
 * clear message instead of an opaque sync rejection.
 */
export async function deleteAccount(id: string): Promise<void> {
  const existing = await db.accounts.get(id);
  if (!existing) return;
  const used = await db.transactions
    .filter((tx) => !tx.deleted_at && (tx.from_account_id === id || tx.to_account_id === id))
    .count();
  if (used > 0) {
    throw new Error(
      "This account still has transactions. Archive it instead to keep your history intact.",
    );
  }
  await db.accounts.update(id, { deleted_at: now(), sync_status: "pending", updated_at: now() });
  await enqueueMutation("accounts", id, "delete", null, existing.version);
  await recalcBalances();
}

export async function createAccountGroup(name: string): Promise<LocalAccountGroup> {
  const group: LocalAccountGroup = {
    id: newId(),
    name,
    version: 0,
    deleted_at: null,
    sync_status: "pending",
    ...stamp(),
  };
  await db.account_groups.add(group);
  await enqueueMutation("account_groups", group.id, "create", group, 0);
  return group;
}

/* -------------------------------------------------------------- categories */

type CategoryInput = Pick<LocalCategory, "name" | "type"> &
  Partial<Pick<LocalCategory, "parent_id" | "icon" | "color">>;

export async function createCategory(input: CategoryInput): Promise<LocalCategory> {
  const category: LocalCategory = {
    id: newId(),
    name: input.name,
    type: input.type,
    parent_id: input.parent_id ?? null,
    icon: input.icon ?? null,
    color: input.color ?? null,
    is_custom: true,
    version: 0,
    deleted_at: null,
    sync_status: "pending",
    ...stamp(),
  };
  await db.categories.add(category);
  await enqueueMutation("categories", category.id, "create", category, 0);
  return category;
}

export async function updateCategory(
  id: string,
  patch: Partial<LocalCategory>,
): Promise<LocalCategory | undefined> {
  const existing = await db.categories.get(id);
  if (!existing) return undefined;
  const next: LocalCategory = edited(existing, patch);
  await db.categories.put(next);
  await enqueueMutation("categories", id, "update", next, existing.version);
  return next;
}

export async function deleteCategory(id: string): Promise<void> {
  const existing = await db.categories.get(id);
  if (!existing) return;
  await db.categories.update(id, { deleted_at: now(), sync_status: "pending", updated_at: now() });
  await enqueueMutation("categories", id, "delete", null, existing.version);
}

/* -------------------------------------------------------------------- tags */

export async function createTag(name: string): Promise<LocalTag> {
  const tag: LocalTag = {
    id: newId(),
    name,
    version: 0,
    deleted_at: null,
    sync_status: "pending",
    ...stamp(),
  };
  await db.tags.add(tag);
  await enqueueMutation("tags", tag.id, "create", tag, 0);
  return tag;
}

export async function renameTag(id: string, name: string): Promise<void> {
  const existing = await db.tags.get(id);
  if (!existing) return;
  const next: LocalTag = edited(existing, { name });
  await db.tags.put(next);
  await enqueueMutation("tags", id, "update", next, existing.version);
}

export async function deleteTag(id: string): Promise<void> {
  const existing = await db.tags.get(id);
  if (!existing) return;
  await db.tags.update(id, { deleted_at: now(), sync_status: "pending", updated_at: now() });
  await enqueueMutation("tags", id, "delete", null, existing.version);
  // Strip the tag from any transaction that referenced it so nothing dangles.
  const affected = await db.transactions.filter((tx) => tx.tag_ids.includes(id)).toArray();
  for (const tx of affected) {
    const next = { ...tx, tag_ids: tx.tag_ids.filter((tagId) => tagId !== id), updated_at: now() };
    await db.transactions.put(next);
    await enqueueMutation("transactions", tx.id, "update", next, tx.version);
  }
}

/* ------------------------------------------------------------ transactions */

type TransactionInput = Pick<
  LocalTransaction,
  "type" | "amount" | "currency" | "fx_rate" | "from_account_id" | "to_account_id" | "date" | "notes"
> &
  Partial<
    Pick<
      LocalTransaction,
      "category_id" | "is_bookmarked" | "tag_ids" | "recurring_id" | "installment_id" | "savings_goal_id" | "debt_id"
    >
  >;

export async function createTransaction(input: TransactionInput): Promise<LocalTransaction> {
  const tx: LocalTransaction = {
    id: newId(),
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    fx_rate: input.fx_rate,
    from_account_id: input.from_account_id,
    to_account_id: input.to_account_id,
    category_id: input.category_id ?? null,
    date: input.date,
    notes: input.notes,
    is_bookmarked: input.is_bookmarked ?? false,
    tag_ids: input.tag_ids ?? [],
    recurring_id: input.recurring_id ?? null,
    installment_id: input.installment_id ?? null,
    savings_goal_id: input.savings_goal_id ?? null,
    debt_id: input.debt_id ?? null,
    version: 0,
    deleted_at: null,
    sync_status: "pending",
    ...stamp(),
  };
  await db.transactions.add(tx);
  await recalcBalances();
  await enqueueMutation("transactions", tx.id, "create", tx, 0);
  if (tx.debt_id && tx.type === "expense") await applyDebtPayment(tx);
  return tx;
}

export async function updateTransaction(
  id: string,
  patch: Partial<LocalTransaction>,
): Promise<LocalTransaction | undefined> {
  const existing = await db.transactions.get(id);
  if (!existing) return undefined;
  const next: LocalTransaction = edited(existing, patch);
  await db.transactions.put(next);
  await recalcBalances();
  await enqueueMutation("transactions", id, "update", next, existing.version);
  return next;
}

export async function deleteTransaction(id: string): Promise<void> {
  const existing = await db.transactions.get(id);
  if (!existing) return;
  await db.transactions.update(id, { deleted_at: now(), sync_status: "pending", updated_at: now() });
  await enqueueMutation("transactions", id, "delete", null, existing.version);
  await recalcBalances();
}

export async function toggleBookmark(id: string): Promise<void> {
  const existing = await db.transactions.get(id);
  if (!existing) return;
  await updateTransaction(id, { is_bookmarked: !existing.is_bookmarked });
}

/* ----------------------------------------------------------------- budgets */

type BudgetInput = Pick<LocalBudget, "amount" | "period" | "start_date"> &
  Partial<Pick<LocalBudget, "category_id" | "alert_threshold">>;

export async function createBudget(input: BudgetInput): Promise<LocalBudget> {
  const budget: LocalBudget = {
    id: newId(),
    category_id: input.category_id ?? null,
    amount: input.amount,
    period: input.period,
    start_date: input.start_date,
    alert_threshold: input.alert_threshold ?? 80,
    version: 0,
    deleted_at: null,
    sync_status: "pending",
    ...stamp(),
  };
  await db.budgets.add(budget);
  await enqueueMutation("budgets", budget.id, "create", budget, 0);
  return budget;
}

export async function updateBudget(
  id: string,
  patch: Partial<LocalBudget>,
): Promise<LocalBudget | undefined> {
  const existing = await db.budgets.get(id);
  if (!existing) return undefined;
  const next: LocalBudget = edited(existing, patch);
  await db.budgets.put(next);
  await enqueueMutation("budgets", id, "update", next, existing.version);
  return next;
}

export async function deleteBudget(id: string): Promise<void> {
  const existing = await db.budgets.get(id);
  if (!existing) return;
  await db.budgets.update(id, { deleted_at: now(), sync_status: "pending", updated_at: now() });
  await enqueueMutation("budgets", id, "delete", null, existing.version);
}

/* --------------------------------------------------------------- recurring */

type RecurringInput = Pick<
  LocalRecurring,
  "type" | "amount" | "currency" | "from_account_id" | "to_account_id" | "frequency" | "next_run_at" | "notes"
> &
  Partial<Pick<LocalRecurring, "category_id" | "end_at">>;

export async function createRecurring(input: RecurringInput): Promise<LocalRecurring> {
  const rule: LocalRecurring = {
    id: newId(),
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    from_account_id: input.from_account_id,
    to_account_id: input.to_account_id,
    category_id: input.category_id ?? null,
    frequency: input.frequency,
    next_run_at: input.next_run_at,
    last_run_at: null,
    end_at: input.end_at ?? null,
    enabled: true,
    notes: input.notes,
    version: 0,
    deleted_at: null,
    sync_status: "pending",
    ...stamp(),
  };
  await db.recurring.add(rule);
  await enqueueMutation("recurring", rule.id, "create", rule, 0);
  return rule;
}

export async function updateRecurring(
  id: string,
  patch: Partial<LocalRecurring>,
): Promise<LocalRecurring | undefined> {
  const existing = await db.recurring.get(id);
  if (!existing) return undefined;
  const next: LocalRecurring = edited(existing, patch);
  await db.recurring.put(next);
  await enqueueMutation("recurring", id, "update", next, existing.version);
  return next;
}

export async function deleteRecurring(id: string): Promise<void> {
  const existing = await db.recurring.get(id);
  if (!existing) return;
  await db.recurring.update(id, { deleted_at: now(), sync_status: "pending", updated_at: now() });
  await enqueueMutation("recurring", id, "delete", null, existing.version);
}

/* ------------------------------------------------------------ installments */

type InstallmentInput = Pick<
  LocalInstallment,
  "total_amount" | "parts_count" | "currency" | "start_date" | "frequency" | "notes"
> &
  Partial<Pick<LocalInstallment, "from_account_id" | "category_id">>;

export async function createInstallment(input: InstallmentInput): Promise<LocalInstallment> {
  const plan: LocalInstallment = {
    id: newId(),
    total_amount: input.total_amount,
    parts_count: input.parts_count,
    currency: input.currency,
    from_account_id: input.from_account_id ?? null,
    category_id: input.category_id ?? null,
    start_date: input.start_date,
    frequency: input.frequency,
    notes: input.notes,
    version: 0,
    deleted_at: null,
    sync_status: "pending",
    ...stamp(),
  };
  await db.installments.add(plan);
  await enqueueMutation("installments", plan.id, "create", plan, 0);
  return plan;
}

export async function updateInstallment(
  id: string,
  patch: Partial<LocalInstallment>,
): Promise<LocalInstallment | undefined> {
  const existing = await db.installments.get(id);
  if (!existing) return undefined;
  const next: LocalInstallment = edited(existing, patch);
  await db.installments.put(next);
  await enqueueMutation("installments", id, "update", next, existing.version);
  return next;
}

export async function deleteInstallment(id: string): Promise<void> {
  const existing = await db.installments.get(id);
  if (!existing) return;
  await db.installments.update(id, { deleted_at: now(), sync_status: "pending", updated_at: now() });
  await enqueueMutation("installments", id, "delete", null, existing.version);
}

/* ------------------------------------------------------------------- debts */

type DebtInput = Pick<LocalDebt, "counterparty" | "direction" | "original_amount" | "currency"> &
  Partial<Pick<LocalDebt, "due_date" | "notes">>;

export async function createDebt(input: DebtInput): Promise<LocalDebt> {
  const debt: LocalDebt = {
    id: newId(),
    counterparty: input.counterparty,
    direction: input.direction,
    original_amount: input.original_amount,
    remaining_amount: input.original_amount,
    currency: input.currency,
    due_date: input.due_date ?? null,
    notes: input.notes ?? "",
    version: 0,
    deleted_at: null,
    sync_status: "pending",
    ...stamp(),
  };
  await db.debts.add(debt);
  await enqueueMutation("debts", debt.id, "create", debt, 0);
  return debt;
}

export async function updateDebt(id: string, patch: Partial<LocalDebt>): Promise<LocalDebt | undefined> {
  const existing = await db.debts.get(id);
  if (!existing) return undefined;
  const next: LocalDebt = edited(existing, patch);
  await db.debts.put(next);
  await enqueueMutation("debts", id, "update", next, existing.version);
  return next;
}

export async function deleteDebt(id: string): Promise<void> {
  const existing = await db.debts.get(id);
  if (!existing) return;
  await db.debts.update(id, { deleted_at: now(), sync_status: "pending", updated_at: now() });
  await enqueueMutation("debts", id, "delete", null, existing.version);
}

/**
 * Keeps `Debt.remaining_amount` in step with the ledger. Payment history is the
 * transactions carrying `debt_id`, so the two can never disagree.
 */
async function applyDebtPayment(tx: LocalTransaction): Promise<void> {
  const debt = await db.debts.get(tx.debt_id ?? "");
  if (!debt) return;
  const remaining = Math.max(0, debt.remaining_amount - Math.abs(tx.amount));
  if (remaining !== debt.remaining_amount) {
    await db.debts.update(debt.id, { remaining_amount: remaining, updated_at: now() });
  }
}

/* ----------------------------------------------------------- savings goals */

type SavingsGoalInput = Pick<LocalSavingsGoal, "name" | "target_amount" | "currency"> &
  Partial<Pick<LocalSavingsGoal, "target_date" | "linked_account_id">>;

export async function createSavingsGoal(input: SavingsGoalInput): Promise<LocalSavingsGoal> {
  const goal: LocalSavingsGoal = {
    id: newId(),
    name: input.name,
    target_amount: input.target_amount,
    currency: input.currency,
    target_date: input.target_date ?? null,
    linked_account_id: input.linked_account_id ?? null,
    version: 0,
    deleted_at: null,
    sync_status: "pending",
    ...stamp(),
  };
  await db.savings_goals.add(goal);
  await enqueueMutation("savings_goals", goal.id, "create", goal, 0);
  return goal;
}

export async function updateSavingsGoal(
  id: string,
  patch: Partial<LocalSavingsGoal>,
): Promise<LocalSavingsGoal | undefined> {
  const existing = await db.savings_goals.get(id);
  if (!existing) return undefined;
  const next: LocalSavingsGoal = edited(existing, patch);
  await db.savings_goals.put(next);
  await enqueueMutation("savings_goals", id, "update", next, existing.version);
  return next;
}

export async function deleteSavingsGoal(id: string): Promise<void> {
  const existing = await db.savings_goals.get(id);
  if (!existing) return;
  await db.savings_goals.update(id, { deleted_at: now(), sync_status: "pending", updated_at: now() });
  await enqueueMutation("savings_goals", id, "delete", null, existing.version);
}

/* ----------------------------------------------------------- exchange rates */

type ExchangeRateInput = Pick<LocalExchangeRate, "base_currency" | "quote_currency" | "rate" | "date"> &
  Partial<Pick<LocalExchangeRate, "source">>;

export async function createExchangeRate(input: ExchangeRateInput): Promise<LocalExchangeRate> {
  const rate: LocalExchangeRate = {
    id: newId(),
    base_currency: input.base_currency.toUpperCase(),
    quote_currency: input.quote_currency.toUpperCase(),
    rate: input.rate,
    date: input.date,
    source: input.source ?? "manual",
    version: 0,
    deleted_at: null,
    sync_status: "pending",
    ...stamp(),
  };
  await db.exchange_rates.add(rate);
  await enqueueMutation("exchange_rates", rate.id, "create", rate, 0);
  return rate;
}

export async function deleteExchangeRate(id: string): Promise<void> {
  const existing = await db.exchange_rates.get(id);
  if (!existing) return;
  await db.exchange_rates.update(id, { deleted_at: now(), sync_status: "pending", updated_at: now() });
  await enqueueMutation("exchange_rates", id, "delete", null, existing.version);
}

/**
 * Client-side report engine.
 *
 * Every figure the UI shows is derived here from IndexedDB rows, which is what
 * makes budgets, statistics, the calendar and net worth work with no connection.
 * Pure functions only - they take arrays and return plain data, so they are cheap
 * to memoise and never touch the network.
 */
import type {
  LocalAccount,
  LocalBudget,
  LocalCategory,
  LocalDebt,
  LocalExchangeRate,
  LocalInstallment,
  LocalRecurring,
  LocalSavingsGoal,
  LocalTag,
  LocalTransaction,
} from "../../db/types";
import { addDays, toDate, toDateKey } from "../../design/format";
import { buildFxTable, convert, type FxTable } from "./fx";
import {
  buildBuckets,
  inRange,
  installmentDueDate,
  periodRange,
  advanceOccurrence,
  type DateRange,
  type Period,
} from "./period";

/* ------------------------------------------------------------------ dataset */

export interface Dataset {
  accounts: LocalAccount[];
  categories: LocalCategory[];
  tags: LocalTag[];
  transactions: LocalTransaction[];
  budgets: LocalBudget[];
  recurring: LocalRecurring[];
  installments: LocalInstallment[];
  debts: LocalDebt[];
  goals: LocalSavingsGoal[];
  rates: LocalExchangeRate[];
  /** Currency all report figures are expressed in. */
  baseCurrency: string;
}

export interface Lookups {
  account: Map<string, LocalAccount>;
  category: Map<string, LocalCategory>;
  /** Category id -> the root parent id, so subcategories roll into their parent. */
  categoryRoot: Map<string, string>;
  /** Tag id -> tag name, used by search and the transaction detail sheet. */
  tag: Map<string, string>;
  fx: FxTable;
  dataset: Dataset;
}

export function buildLookups(dataset: Dataset): Lookups {
  const category = new Map(dataset.categories.map((row) => [row.id, row]));
  const categoryRoot = new Map<string, string>();
  for (const row of dataset.categories) {
    categoryRoot.set(row.id, row.parent_id ?? row.id);
  }
  return {
    account: new Map(dataset.accounts.map((row) => [row.id, row])),
    category,
    categoryRoot,
    tag: new Map(dataset.tags.map((row) => [row.id, row.name])),
    fx: buildFxTable(dataset.rates, dataset.baseCurrency),
    dataset,
  };
}

export type { FxTable };

/* ------------------------------------------------------------------- totals */

export interface Summary {
  income: number;
  expense: number;
  /** income - expense. Transfers never affect it. */
  net: number;
  /** Income minus expense minus transfers out, i.e. pure cash movement. */
  cashFlow: number;
  transferIn: number;
  transferOut: number;
  transactionCount: number;
}

const EMPTY_SUMMARY: Summary = {
  income: 0,
  expense: 0,
  net: 0,
  cashFlow: 0,
  transferIn: 0,
  transferOut: 0,
  transactionCount: 0,
};

/** Signed effect of a transaction on one account, in base currency. */
export function signedImpact(tx: LocalTransaction, fx: FxTable): { from: number; to: number } {
  const value = convert(Math.abs(tx.amount), tx.currency, fx);
  return {
    from: tx.type === "income" ? 0 : tx.from_account_id ? -value : 0,
    to: tx.type === "expense" ? 0 : tx.to_account_id ? value : 0,
  };
}

export function summarize(
  transactions: LocalTransaction[],
  range: DateRange | null,
  fx: FxTable,
  accountIds?: string[],
): Summary {
  const summary: Summary = { ...EMPTY_SUMMARY };
  for (const tx of transactions) {
    if (!inRange(tx.date, range)) continue;
    if (accountIds && !accountIds.some((id) => tx.from_account_id === id || tx.to_account_id === id)) {
      continue;
    }
    summary.transactionCount += 1;
    const value = convert(Math.abs(tx.amount), tx.currency, fx);
    if (tx.type === "income") {
      summary.income += value;
      summary.cashFlow += value;
    } else if (tx.type === "expense") {
      summary.expense += value;
      summary.cashFlow -= value;
    } else {
      summary.transferIn += tx.to_account_id ? value : 0;
      summary.transferOut += tx.from_account_id ? value : 0;
    }
  }
  summary.net = summary.income - summary.expense;
  return summary;
}

/* ---------------------------------------------------------------- breakdown */

export interface CategorySlice {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  value: number;
  share: number;
  count: number;
  /** Children of this slice, so the UI can offer drill-down. */
  children: { id: string; name: string; icon: string | null; value: number; count: number }[];
}

/** Spending by category, with subcategories rolled up into their parent. */
export function categoryBreakdown(
  transactions: LocalTransaction[],
  range: DateRange | null,
  lookups: Lookups,
  type: "income" | "expense" = "expense",
  limit = 0,
): CategorySlice[] {
  const totals = new Map<string, { value: number; count: number }>();
  const childTotals = new Map<string, Map<string, { name: string; icon: string | null; value: number; count: number }>>();

  for (const tx of transactions) {
    if (tx.type !== type || !inRange(tx.date, range)) continue;
    const rootId = tx.category_id ? (lookups.categoryRoot.get(tx.category_id) ?? tx.category_id) : null;
    const key = rootId ?? "__uncategorised__";
    const bucket = totals.get(key) ?? { value: 0, count: 0 };
    bucket.value += convert(Math.abs(tx.amount), tx.currency, lookups.fx);
    bucket.count += 1;
    totals.set(key, bucket);

    if (rootId && tx.category_id !== rootId) {
      const child = tx.category_id ? lookups.category.get(tx.category_id) : undefined;
      if (!child) continue;
      const map = childTotals.get(rootId) ?? new Map();
      const entry = map.get(child.id) ?? { name: child.name, icon: child.icon, value: 0, count: 0 };
      entry.value += convert(Math.abs(tx.amount), tx.currency, lookups.fx);
      entry.count += 1;
      map.set(child.id, entry);
      childTotals.set(rootId, map);
    }
  }

  const sum = [...totals.values()].reduce((acc, item) => acc + item.value, 0) || 1;
  const slices: CategorySlice[] = [...totals.entries()]
    .map(([id, item]) => {
      const category = id === "__uncategorised__" ? undefined : lookups.category.get(id);
      return {
        id,
        name: category?.name ?? "Uncategorised",
        icon: category?.icon ?? null,
        color: category?.color ?? null,
        value: item.value,
        share: (item.value / sum) * 100,
        count: item.count,
        children: [...(childTotals.get(id)?.entries() ?? [])].map(([childId, entry]) => ({
          id: childId,
          name: entry.name,
          icon: entry.icon,
          value: entry.value,
          count: entry.count,
        })),
      };
    })
    .sort((a, b) => b.value - a.value);

  return limit > 0 ? slices.slice(0, limit) : slices;
}

/* ------------------------------------------------------------------ series */

export interface SeriesPoint {
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
}

export function series(
  transactions: LocalTransaction[],
  period: Period,
  lookups: Lookups,
  bucketCount = 12,
): SeriesPoint[] {
  const buckets = buildBuckets(period, bucketCount);
  if (buckets.length === 0) return [];
  const points = buckets.map<SeriesPoint>((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    income: 0,
    expense: 0,
    net: 0,
  }));

  for (const tx of transactions) {
    if (tx.type === "transfer") continue;
    const when = new Date(tx.date);
    const position = buckets.findIndex((bucket) => when >= bucket.start && when < bucket.end);
    if (position === -1) continue;
    const point = points[position];
    const value = convert(Math.abs(tx.amount), tx.currency, lookups.fx);
    if (tx.type === "income") point.income += value;
    else point.expense += value;
    point.net = point.income - point.expense;
  }
  return points;
}

/**
 * Net worth over time: replay the ledger from the beginning so the curve is
 * correct even for accounts created long after the first transaction.
 */
export function netWorthSeries(
  dataset: Dataset,
  lookups: Lookups,
  period: Period,
  bucketCount = 12,
): { key: string; label: string; assets: number; liabilities: number; net: number }[] {
  const buckets = buildBuckets(period, bucketCount);
  if (buckets.length === 0) return [];
  const points = buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    assets: 0,
    liabilities: 0,
    net: 0,
  }));

  const liabilityIds = new Set(dataset.accounts.filter((a) => isLiability(a.type)).map((a) => a.id));
  const balances = new Map<string, number>();
  for (const account of dataset.accounts) {
    balances.set(account.id, convert(account.opening_balance, account.currency, lookups.fx));
  }

  const snapshot = (index: number) => {
    let assets = 0;
    let liabilities = 0;
    for (const [id, balance] of balances) {
      if (liabilityIds.has(id)) liabilities += balance;
      else assets += balance;
    }
    points[index].assets = assets;
    points[index].liabilities = liabilities;
    points[index].net = assets + liabilities;
  };

  const ordered = [...dataset.transactions].sort((a, b) => a.date.localeCompare(b.date));
  let bucketIndex = 0;
  snapshot(0);
  for (const tx of ordered) {
    const when = new Date(tx.date);
    while (bucketIndex < buckets.length - 1 && when >= buckets[bucketIndex].end) {
      bucketIndex += 1;
      snapshot(bucketIndex);
    }
    if (when < buckets[0].start) continue;
    const { from, to } = signedImpact(tx, lookups.fx);
    if (tx.from_account_id && from) balances.set(tx.from_account_id, (balances.get(tx.from_account_id) ?? 0) + from);
    if (tx.to_account_id && to) balances.set(tx.to_account_id, (balances.get(tx.to_account_id) ?? 0) + to);
  }
  snapshot(buckets.length - 1);
  return points;
}

export function isLiability(type: string): boolean {
  return type === "credit" || type === "loan";
}

/* ----------------------------------------------------------------- accounts */

export interface AccountTotals {
  account: LocalAccount;
  balance: number;
  income: number;
  expense: number;
  net: number;
  /** For credit cards: how much of the limit is already used. */
  creditUsed: number | null;
  creditLimit: number | null;
  utilization: number | null;
  transactionCount: number;
}

export function accountTotals(
  dataset: Dataset,
  lookups: Lookups,
  range: DateRange | null,
): AccountTotals[] {
  const activity = new Map<string, { income: number; expense: number; count: number }>();
  const bump = (id: string | null, field: "income" | "expense", value: number) => {
    if (!id) return;
    const bucket = activity.get(id) ?? { income: 0, expense: 0, count: 0 };
    bucket[field] += value;
    bucket.count += 1;
    activity.set(id, bucket);
  };

  for (const tx of dataset.transactions) {
    if (!inRange(tx.date, range)) continue;
    const value = convert(Math.abs(tx.amount), tx.currency, lookups.fx);
    // Income lands in `to_account`, expense leaves `from_account`; transfers move
    // value between the two and are counted on both sides of the history.
    if (tx.type === "income") bump(tx.to_account_id, "income", value);
    else if (tx.type === "expense") bump(tx.from_account_id, "expense", value);
    else {
      bump(tx.from_account_id, "expense", value);
      bump(tx.to_account_id, "income", value);
    }
  }

  return dataset.accounts.map((account) => {
    const bucket = activity.get(account.id) ?? { income: 0, expense: 0, count: 0 };
    const balance = convert(account.current_balance, account.currency, lookups.fx);
    const limit = account.credit_limit ? convert(account.credit_limit, account.currency, lookups.fx) : null;
    // Credit balances are stored negative, so the used amount is the absolute value.
    const used = limit !== null && isLiability(account.type) ? Math.abs(Math.min(0, balance)) : null;
    return {
      account,
      balance,
      income: bucket.income,
      expense: bucket.expense,
      net: bucket.income - bucket.expense,
      creditUsed: used,
      creditLimit: limit,
      utilization: limit && used !== null ? (used / limit) * 100 : null,
      transactionCount: bucket.count,
    };
  });
}

export interface PortfolioTotals {
  assets: number;
  liabilities: number;
  netWorth: number;
  cashAvailable: number;
  creditAvailable: number | null;
}

/** Total assets / liabilities across all accounts, in base currency. */
export function portfolio(lookups: Lookups, options: { includeArchived?: boolean } = {}): PortfolioTotals {
  let assets = 0;
  let liabilities = 0;
  let cashAvailable = 0;
  let creditTotal = 0;
  let creditUsed = 0;
  let hasCredit = false;

  for (const account of lookups.dataset.accounts) {
    if (!options.includeArchived && account.archived) continue;
    const balance = convert(account.current_balance, account.currency, lookups.fx);
    if (isLiability(account.type)) {
      liabilities += balance;
      if (account.credit_limit) {
        hasCredit = true;
        creditTotal += convert(account.credit_limit, account.currency, lookups.fx);
        creditUsed += Math.abs(Math.min(0, balance));
      }
    } else {
      assets += balance;
      cashAvailable += balance;
    }
  }

  return {
    assets,
    liabilities,
    netWorth: assets + liabilities,
    cashAvailable,
    creditAvailable: hasCredit ? Math.max(0, creditTotal - creditUsed) : null,
  };
}

/* ------------------------------------------------------------------ budgets */

export interface BudgetProgress {
  budget: LocalBudget;
  spent: number;
  remaining: number;
  percent: number;
  /** True once the user-configured alert threshold is crossed. */
  alert: boolean;
  overBudget: boolean;
  categoryName: string | null;
  period: DateRange | null;
}

/** Budget spend is scoped to the budget's own period, not the report period. */
export function budgetProgress(
  budgets: LocalBudget[],
  transactions: LocalTransaction[],
  lookups: Lookups,
  anchor: Date,
  monthStartDay: number,
): BudgetProgress[] {
  return budgets.map((budget) => {
    const range = budgetRange(budget, anchor, monthStartDay);
    let spent = 0;
    for (const tx of transactions) {
      if (tx.type !== "expense" || !inRange(tx.date, range)) continue;
      if (budget.category_id) {
        const root = tx.category_id
          ? (lookups.categoryRoot.get(tx.category_id) ?? tx.category_id)
          : null;
        if (root !== budget.category_id && tx.category_id !== budget.category_id) continue;
      }
      spent += convert(Math.abs(tx.amount), tx.currency, lookups.fx);
    }
    const limit = convert(budget.amount, lookups.dataset.baseCurrency, lookups.fx) || budget.amount;
    const percent = limit > 0 ? (spent / limit) * 100 : 0;
    return {
      budget,
      spent,
      remaining: limit - spent,
      percent,
      alert: percent >= budget.alert_threshold,
      overBudget: percent > 100,
      categoryName: budget.category_id
        ? (lookups.category.get(budget.category_id)?.name ?? null)
        : null,
      period: range,
    };
  });
}

function budgetRange(budget: LocalBudget, anchor: Date, monthStartDay: number): DateRange | null {
  const start = new Date(budget.start_date);
  if (Number.isNaN(start.getTime())) return null;
  const from = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  switch (budget.period) {
    case "weekly":
      return { start: from, end: addDays(from, 7) };
    case "yearly":
      return { start: from, end: addDays(from, 365) };
    default: {
      const period: Period = { kind: "month", anchor, monthStartDay };
      const range = periodRange(period);
      return range;
    }
  }
}

/* --------------------------------------------------------------------- goals */

export interface GoalProgress {
  goal: LocalSavingsGoal;
  saved: number;
  percent: number;
  remaining: number;
  target: number;
  contributions: LocalTransaction[];
  onTrack: boolean;
  daysLeft: number | null;
  /** Amount per month needed to hit the target date. */
  requiredMonthly: number | null;
}

export function goalProgress(
  goals: LocalSavingsGoal[],
  transactions: LocalTransaction[],
  lookups: Lookups,
): GoalProgress[] {
  return goals.map((goal) => {
    const contributions = transactions
      .filter((tx) => !tx.deleted_at && tx.savings_goal_id === goal.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const saved = contributions.reduce((acc, tx) => {
      const value = convert(Math.abs(tx.amount), tx.currency, lookups.fx);
      // Transfers *into* the goal fund it; anything else is a withdrawal.
      const sign = tx.type === "income" || (tx.type === "transfer" && tx.to_account_id) ? value : -value;
      return acc + sign;
    }, 0);
    const target = convert(goal.target_amount, goal.currency, lookups.fx);
    const percent = target > 0 ? (saved / target) * 100 : 0;
    const daysLeft = goal.target_date
      ? Math.round((new Date(goal.target_date).getTime() - Date.now()) / 86_400_000)
      : null;
    const monthsLeft = daysLeft === null ? null : Math.max(1, Math.ceil(daysLeft / 30.44));
    return {
      goal,
      saved: Math.max(0, saved),
      percent,
      remaining: Math.max(0, target - saved),
      target,
      contributions,
      onTrack: percent >= 100,
      daysLeft,
      requiredMonthly: monthsLeft === null ? null : Math.max(0, (target - saved)) / monthsLeft,
    };
  });
}

/* --------------------------------------------------------------------- debts */

export interface DebtSummary {
  debt: LocalDebt;
  paid: number;
  percent: number;
  overdue: boolean;
  daysUntilDue: number | null;
  payments: LocalTransaction[];
}

export function debtSummary(
  debts: LocalDebt[],
  transactions: LocalTransaction[],
  lookups: Lookups,
): DebtSummary[] {
  return debts.map((debt) => {
    const payments = transactions
      .filter((tx) => !tx.deleted_at && tx.debt_id === debt.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    const original = convert(debt.original_amount, debt.currency, lookups.fx) || debt.original_amount;
    const remaining = convert(debt.remaining_amount, debt.currency, lookups.fx);
    const paid = Math.max(0, original - remaining);
    const daysUntilDue = debt.due_date
      ? Math.round((new Date(debt.due_date).getTime() - Date.now()) / 86_400_000)
      : null;
    return {
      debt,
      paid,
      percent: original > 0 ? (paid / original) * 100 : 0,
      overdue: daysUntilDue !== null && daysUntilDue < 0 && remaining > 0,
      daysUntilDue,
      payments,
    };
  });
}

/* --------------------------------------------------------------- installments */

export interface InstallmentProgress {
  plan: LocalInstallment;
  partAmount: number;
  paidParts: number;
  remainingParts: number;
  paidAmount: number;
  percent: number;
  nextDueDate: Date | null;
  schedule: { index: number; date: Date; amount: number; paid: boolean }[];
}

export function installmentProgress(
  plans: LocalInstallment[],
  transactions: LocalTransaction[],
  lookups: Lookups,
): InstallmentProgress[] {
  return plans.map((plan) => {
    // Remainder cents land on the final part, exactly like the server generator.
    const partAmount = Math.floor((plan.total_amount / plan.parts_count) * 100) / 100;
    const linked = transactions
      .filter((tx) => !tx.deleted_at && tx.installment_id === plan.id)
      .sort((a, b) => a.date.localeCompare(b.date));
    const schedule = Array.from({ length: plan.parts_count }, (_, index) => {
      const amount =
        index === plan.parts_count - 1
          ? Number((plan.total_amount - partAmount * (plan.parts_count - 1)).toFixed(2))
          : partAmount;
      return { index, date: installmentDueDate(new Date(plan.start_date), plan.frequency, index), amount, paid: false };
    });
    let paidAmount = 0;
    let paidParts = 0;
    for (const payment of linked) {
      paidAmount += convert(Math.abs(payment.amount), payment.currency, lookups.fx);
      paidParts += 1;
      const dueIndex = Math.min(schedule.length - 1, Math.floor(paidParts - 1));
      if (schedule[dueIndex]) schedule[dueIndex].paid = true;
    }
    const nextDue = schedule.find((item) => !item.paid)?.date ?? null;
    return {
      plan,
      partAmount,
      paidParts: Math.min(paidParts, plan.parts_count),
      remainingParts: Math.max(0, plan.parts_count - paidParts),
      paidAmount,
      percent: plan.total_amount > 0 ? (paidAmount / plan.total_amount) * 100 : 0,
      nextDueDate: nextDue,
      schedule,
    };
  });
}

/* ----------------------------------------------------------------- calendar */

export interface CalendarEvent {
  key: string;
  date: string;
  kind: "transaction" | "recurring" | "installment" | "debt" | "goal";
  title: string;
  amount: number;
  currency: string;
  tone: "income" | "expense" | "transfer" | "neutral";
  transactionId?: string;
}

/** Everything due or recorded on a day, for the calendar grid and day sheet. */
export function calendarEvents(
  lookups: Lookups,
  start: Date,
  end: Date,
  options: { horizonDays?: number } = {},
): Map<string, CalendarEvent[]> {
  const events = new Map<string, CalendarEvent[]>();
  const push = (event: CalendarEvent) => {
    const list = events.get(event.date) ?? [];
    list.push(event);
    events.set(event.date, list);
  };

  for (const tx of lookups.dataset.transactions) {
    if (!inRange(tx.date, { start, end })) continue;
    const account = tx.from_account_id ? lookups.account.get(tx.from_account_id)?.name : undefined;
    const category = tx.category_id ? lookups.category.get(tx.category_id)?.name : undefined;
    const label =
      tx.type === "transfer"
        ? `Transfer ${account ?? "?"}`
        : [category, account].filter(Boolean).join(" · ") || tx.type;
    push({
      key: `tx:${tx.id}`,
      date: toDateKey(tx.date),
      kind: "transaction",
      title: tx.notes || label,
      amount: convert(Math.abs(tx.amount), tx.currency, lookups.fx),
      currency: lookups.dataset.baseCurrency,
      tone: tx.type === "income" ? "income" : tx.type === "expense" ? "expense" : "transfer",
      transactionId: tx.id,
    });
  }

  const horizon = options.horizonDays ?? 0;
  const upcomingEnd = addDays(end, horizon);
  for (const rule of lookups.dataset.recurring) {
    if (!rule.enabled) continue;
    let when = toDate(rule.next_run_at);
    // Walk occurrences forward until past the window. The guard bounds the loop if
    // a daily rule is scanned across a long range.
    let guard = 0;
    while (when < start && guard < 400) {
      when = advanceOccurrence(when, rule.frequency);
      guard += 1;
    }
    while (when < upcomingEnd && guard < 400) {
      const category = rule.category_id ? lookups.category.get(rule.category_id)?.name : null;
      push({
        key: `rec:${rule.id}:${toDateKey(when)}`,
        date: toDateKey(when),
        kind: "recurring",
        title: category ?? `${rule.type} · recurring`,
        amount: convert(Math.abs(rule.amount), rule.currency, lookups.fx),
        currency: lookups.dataset.baseCurrency,
        tone: rule.type === "income" ? "income" : rule.type === "expense" ? "expense" : "transfer",
      });
      when = advanceOccurrence(when, rule.frequency);
      guard += 1;
    }
  }

  for (const progress of installmentProgress(lookups.dataset.installments, lookups.dataset.transactions, lookups)) {
    for (const item of progress.schedule) {
      if (item.paid || item.date < start || item.date >= upcomingEnd) continue;
      push({
        key: `ins:${progress.plan.id}:${item.index}`,
        date: toDateKey(item.date),
        kind: "installment",
        title: `Installment ${item.index + 1} of ${progress.plan.parts_count}`,
        amount: item.amount,
        currency: progress.plan.currency,
        tone: "expense",
      });
    }
  }

  for (const debt of lookups.dataset.debts) {
    if (!debt.due_date) continue;
    const when = toDate(debt.due_date);
    if (when < start || when >= upcomingEnd) continue;
    push({
      key: `debt:${debt.id}`,
      date: toDateKey(when),
      kind: "debt",
      title: `${debt.direction === "i_owe" ? "Pay" : "Collect"} ${debt.counterparty}`,
      amount: convert(debt.remaining_amount, debt.currency, lookups.fx),
      currency: lookups.dataset.baseCurrency,
      tone: debt.direction === "i_owe" ? "expense" : "income",
    });
  }

  for (const progress of goalProgress(lookups.dataset.goals, lookups.dataset.transactions, lookups)) {
    if (!progress.goal.target_date || progress.percent >= 100) continue;
    const when = toDate(progress.goal.target_date);
    if (when < start || when >= upcomingEnd) continue;
    push({
      key: `goal:${progress.goal.id}`,
      date: toDateKey(progress.goal.target_date),
      kind: "goal",
      title: `Goal: ${progress.goal.name}`,
      amount: progress.remaining,
      currency: progress.goal.currency,
      tone: "neutral",
    });
  }

  for (const list of events.values()) {
    list.sort((a, b) => a.kind.localeCompare(b.kind));
  }
  return events;
}

/* ------------------------------------------------------------------ upcoming */

export interface UpcomingItem {
  key: string;
  date: Date;
  inDays: number;
  title: string;
  subtitle: string;
  amount: number;
  currency: string;
  tone: "income" | "expense" | "transfer" | "neutral";
  kind: "recurring" | "installment" | "debt" | "goal";
}

/** Bills, recurring payments, installments and goal deadlines - the next N days. */
export function upcoming(lookups: Lookups, days = 30): UpcomingItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = addDays(today, days);
  const events = calendarEvents(lookups, today, end);
  const items: UpcomingItem[] = [];

  for (const [date, list] of events) {
    const inDays = Math.round((new Date(`${date}T00:00:00`).getTime() - today.getTime()) / 86_400_000);
    for (const event of list) {
      if (event.kind === "transaction") continue;
      items.push({
        key: event.key,
        date: new Date(`${date}T00:00:00`),
        inDays,
        title: event.title,
        subtitle: event.kind,
        amount: event.amount,
        currency: event.currency,
        tone: event.tone,
        kind: event.kind,
      });
    }
  }
  return items.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 25);
}

/* -------------------------------------------------------------- year review */

export interface YearInReview {
  year: number;
  income: number;
  expense: number;
  net: number;
  topCategories: CategorySlice[];
  topIncome: CategorySlice[];
  bestMonth: SeriesPoint | null;
  biggestExpense: LocalTransaction | null;
  transactionCount: number;
  averageDailySpend: number;
  savingsRate: number;
}

export function yearInReview(dataset: Dataset, lookups: Lookups, year: number): YearInReview {
  const range: DateRange = {
    start: new Date(year, 0, 1),
    end: new Date(year + 1, 0, 1),
  };
  const inYear = dataset.transactions.filter((tx) => inRange(tx.date, range));
  const summary = summarize(inYear, range, lookups.fx);
  const points = series(
    inYear,
    { kind: "year", anchor: new Date(year, 0, 1), monthStartDay: 1 },
    lookups,
    12,
  );
  const expenses = inYear.filter((tx) => tx.type === "expense");
  const biggest = expenses.reduce<LocalTransaction | null>(
    (worst, tx) => (!worst || tx.amount > worst.amount ? tx : worst),
    null,
  );
  const daysElapsed = year === new Date().getFullYear() ? Math.max(1, Math.ceil((Date.now() - range.start.getTime()) / 86_400_000)) : 365;

  return {
    year,
    income: summary.income,
    expense: summary.expense,
    net: summary.net,
    topCategories: categoryBreakdown(inYear, range, lookups, "expense", 6),
    topIncome: categoryBreakdown(inYear, range, lookups, "income", 6),
    bestMonth: points.reduce<SeriesPoint | null>((best, point) => (!best || point.net > best.net ? point : best), null),
    biggestExpense: biggest,
    transactionCount: summary.transactionCount,
    averageDailySpend: summary.expense / daysElapsed,
    savingsRate: summary.income > 0 ? (summary.net / summary.income) * 100 : 0,
  };
}

/**
 * Transaction list primitives.
 *
 * One row component serves the overview, the ledger, account history and search
 * results, so a transaction always *looks* like a transaction (§16). Rows are
 * list items, not cards: dense enough to scan on desktop, still tappable on
 * mobile.
 */
import { Fragment, useMemo } from "react";
import { Link } from "react-router-dom";
import { Bookmark, Cloud, CloudOff, Paperclip } from "lucide-react";
import type { LocalAccount, LocalTransaction } from "../../db/types";
import {
  formatMoney,
  formatRelativeDay,
  isToday,
  toDateKey,
} from "../../design/format";
import { categoryIcon } from "../../design/icons";
import type { Lookups } from "../analytics/engine";
import { convert } from "../analytics/fx";

export interface TransactionRowProps {
  transaction: LocalTransaction;
  lookups: Lookups;
  /** Show the account name under the description. */
  showAccount?: boolean;
  /** Show the category name next to the title. */
  showCategory?: boolean;
  /** Render a leading bookmark flag. */
  onToggleBookmark?: () => void;
  /** Attachment count badge. */
  attachments?: number;
  className?: string;
}

/** Human label for a row: the note wins, then the category, then the type. */
export function transactionTitle(tx: LocalTransaction, lookups: Lookups): string {
  if (tx.notes.trim()) return tx.notes.trim();
  if (tx.type === "transfer") {
    const from = tx.from_account_id ? lookups.account.get(tx.from_account_id)?.name : null;
    const to = tx.to_account_id ? lookups.account.get(tx.to_account_id)?.name : null;
    return `Transfer ${from ?? "?"} → ${to ?? "?"}`;
  }
  const category = tx.category_id ? lookups.category.get(tx.category_id)?.name : null;
  return category ?? (tx.type === "income" ? "Income" : "Expense");
}

export function transactionAccounts(tx: LocalTransaction, lookups: Lookups): string {
  const name = (id: string | null) => (id ? lookups.account.get(id)?.name ?? "Unknown" : null);
  if (tx.type === "transfer") {
    const from = name(tx.from_account_id);
    const to = name(tx.to_account_id);
    if (from && to) return `${from} → ${to}`;
    return from ?? to ?? "Transfer";
  }
  return name(tx.type === "income" ? tx.to_account_id : tx.from_account_id) ?? "";
}

export function TransactionRow({
  transaction: tx,
  lookups,
  showAccount = true,
  showCategory = false,
  onToggleBookmark,
  attachments = 0,
  className = "",
}: TransactionRowProps) {
  const category = tx.category_id ? lookups.category.get(tx.category_id) : undefined;
  const Icon = categoryIcon(category?.icon ?? null, category?.name);
  const accountLine = showAccount ? transactionAccounts(tx, lookups) : "";
  const amount = convert(Math.abs(tx.amount), tx.currency, lookups.fx);
  const foreign = tx.currency !== lookups.dataset.baseCurrency;

  const tone =
    tx.type === "income" ? "text-income" : tx.type === "expense" ? "text-expense" : "text-transfer";
  const signed = tx.type === "income" ? "+" : tx.type === "expense" ? "−" : "";

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${className}`}>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-soft"
      >
        <Icon className="h-4.5 w-[18px]" />
      </span>

      <Link to={`/transactions/${tx.id}`} className="min-w-0 flex-1 rounded-md">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-ink">{transactionTitle(tx, lookups)}</span>
          {tx.is_bookmarked && (
            <Bookmark aria-label="Bookmarked" className="h-3.5 w-3.5 shrink-0 fill-warning/20 text-warning" />
          )}
          {tx.sync_status === "pending" && (
            <Cloud
              aria-label="Waiting to sync"
              className="h-3.5 w-3.5 shrink-0 text-faint"
            />
          )}
          {tx.sync_status === "failed" && (
            <CloudOff aria-label="Sync failed" className="h-3.5 w-3.5 shrink-0 text-expense" />
          )}
          {attachments > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-faint">
              <Paperclip aria-hidden="true" className="h-3 w-3" />
              <span className="tabular text-[11px]">{attachments}</span>
            </span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <span>{formatRelativeDay(tx.date)}</span>
          {showCategory && category && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{category.name}</span>
            </>
          )}
          {accountLine && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{accountLine}</span>
            </>
          )}
        </span>
      </Link>

      <div className="flex shrink-0 items-center gap-1.5">
        {onToggleBookmark && (
          <button
            type="button"
            aria-label={tx.is_bookmarked ? "Remove bookmark" : "Bookmark this transaction"}
            aria-pressed={tx.is_bookmarked}
            onClick={onToggleBookmark}
            className={`icon-btn h-8 w-8 ${tx.is_bookmarked ? "text-warning" : ""}`}
          >
            <Bookmark className={`h-4 w-4 ${tx.is_bookmarked ? "fill-warning/25" : ""}`} />
          </button>
        )}
        <div className="text-right">
          <p className={`tabular text-sm font-semibold ${tone}`}>
            {signed}
            {formatMoney(amount, tx.currency)}
          </p>
          {foreign && (
            <p className="tabular text-[11px] text-faint">
              ≈{formatMoney(amount, lookups.dataset.baseCurrency, { compact: true })}
            </p>
          )}
          {isToday(tx.date) && (
            <span className="sr-only">{formatRelativeDay(tx.date, tx.date)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** `Today` / `Yesterday` / date headings between groups of rows. */
export function groupByDay(
  transactions: LocalTransaction[],
): { key: string; label: string; rows: LocalTransaction[] }[] {
  const groups = new Map<string, LocalTransaction[]>();
  for (const tx of transactions) {
    const key = toDateKey(tx.date);
    const list = groups.get(key) ?? [];
    list.push(tx);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, rows]) => ({
    key,
    label: formatRelativeDay(key),
    rows,
  }));
}

export interface DayTotal {
  income: number;
  expense: number;
  transfer: number;
}

export function dayTotals(rows: LocalTransaction[], fx: Lookups["fx"]): DayTotal {
  return rows.reduce<DayTotal>(
    (acc, tx) => {
      const value = convert(Math.abs(tx.amount), tx.currency, fx);
      if (tx.type === "income") acc.income += value;
      else if (tx.type === "expense") acc.expense += value;
      else acc.transfer += value;
      return acc;
    },
    { income: 0, expense: 0, transfer: 0 },
  );
}

/** Day-grouped, day-summed ledger. The default presentation for transactions. */
export function TransactionDayList({
  transactions,
  lookups,
  onToggleBookmark,
  showCategory = false,
  className = "",
}: {
  transactions: LocalTransaction[];
  lookups: Lookups;
  onToggleBookmark?: (id: string) => void;
  showCategory?: boolean;
  className?: string;
}) {
  const groups = useMemo(() => groupByDay(transactions), [transactions]);

  return (
    <div className={className}>
      {groups.map((group) => {
        const totals = dayTotals(group.rows, lookups.fx);
        return (
          <Fragment key={group.key}>
            <div className="flex items-baseline justify-between gap-3 border-y border-line bg-surface-sunken px-4 py-1.5">
              <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
                {group.label}
              </span>
              <span className="tabular text-xs text-muted">
                {totals.income > 0 && (
                  <span className="text-income">+{formatMoney(totals.income, lookups.dataset.baseCurrency, { compact: true })}</span>
                )}
                {totals.income > 0 && totals.expense > 0 && <span aria-hidden="true"> · </span>}
                {totals.expense > 0 && (
                  <span className="text-expense">−{formatMoney(totals.expense, lookups.dataset.baseCurrency, { compact: true })}</span>
                )}
              </span>
            </div>
            <div className="divide-y divide-line">
              {group.rows.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  transaction={tx}
                  lookups={lookups}
                  showCategory={showCategory}
                  onToggleBookmark={onToggleBookmark ? () => onToggleBookmark(tx.id) : undefined}
                />
              ))}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/** Flat, dense table used on desktop where horizontal space is free. */
export function TransactionTable({
  transactions,
  lookups,
  accounts,
  onToggleBookmark,
}: {
  transactions: LocalTransaction[];
  lookups: Lookups;
  accounts: LocalAccount[];
  onToggleBookmark?: (id: string) => void;
}) {
  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
  return (
    <div className="scroll-area max-h-[70vh] overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="border-b border-line">
            <th scope="col" className="th w-24">Date</th>
            <th scope="col" className="th">Description</th>
            <th scope="col" className="th">Category</th>
            <th scope="col" className="th">Account</th>
            <th scope="col" className="th w-16" />
            <th scope="col" className="th w-32 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {transactions.map((tx) => {
            const category = tx.category_id ? lookups.category.get(tx.category_id) : undefined;
            const tone =
              tx.type === "income"
                ? "text-income"
                : tx.type === "expense"
                  ? "text-expense"
                  : "text-transfer";
            const accountId = tx.type === "income" ? tx.to_account_id : tx.from_account_id;
            return (
              <tr key={tx.id} className="row-link">
                <td className="td whitespace-nowrap text-muted">{formatRelativeDay(tx.date)}</td>
                <td className="td max-w-[18rem]">
                  <Link
                    to={`/transactions/${tx.id}`}
                    className="block truncate font-medium text-ink hover:text-primary"
                  >
                    {transactionTitle(tx, lookups)}
                  </Link>
                </td>
                <td className="td truncate text-muted">{category?.name ?? "—"}</td>
                <td className="td truncate text-muted">
                  {accountId ? (accountNames.get(accountId) ?? "Unknown") : "—"}
                </td>
                <td className="td">
                  <button
                    type="button"
                    aria-label={tx.is_bookmarked ? "Remove bookmark" : "Bookmark this transaction"}
                    onClick={() => onToggleBookmark?.(tx.id)}
                    className={`icon-btn h-8 w-8 ${tx.is_bookmarked ? "text-warning" : ""}`}
                  >
                    <Bookmark className={`h-4 w-4 ${tx.is_bookmarked ? "fill-warning/25" : ""}`} />
                  </button>
                </td>
                <td className={`td tabular text-right font-semibold ${tone}`}>
                  {tx.type === "income" ? "+" : tx.type === "expense" ? "−" : ""}
                  {formatMoney(convert(Math.abs(tx.amount), tx.currency, lookups.fx), lookups.dataset.baseCurrency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
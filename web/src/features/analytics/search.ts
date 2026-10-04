/**
 * Global search.
 *
 * Runs entirely against local rows so it works offline, and ranks exact matches
 * above substring matches so typing a merchant name surfaces it immediately.
 */
import type { LocalAccount, LocalCategory, LocalTransaction } from "../../db/types";
import type { Lookups } from "./engine";
import { convert } from "./fx";
import { inRange, type DateRange } from "./period";

export type SearchEntity = "transactions" | "accounts" | "categories" | "tags";

export interface SearchFilters {
  query: string;
  entities: SearchEntity[];
  range: DateRange | null;
  accountIds: string[];
  categoryIds: string[];
  types: LocalTransaction["type"][];
  bookmarkedOnly: boolean;
  minAmount: number | null;
  maxAmount: number | null;
  currency: string | null;
  tagIds: string[];
}

export const EMPTY_FILTERS: SearchFilters = {
  query: "",
  entities: ["transactions", "accounts", "categories"],
  range: null,
  accountIds: [],
  categoryIds: [],
  types: [],
  bookmarkedOnly: false,
  minAmount: null,
  maxAmount: null,
  currency: null,
  tagIds: [],
};

export interface TransactionHit {
  transaction: LocalTransaction;
  score: number;
}

function score(haystack: string, needle: string): number {
  if (!needle) return 0;
  const value = haystack.toLowerCase();
  if (value === needle) return 100;
  if (value.startsWith(needle)) return 60;
  if (value.includes(needle)) return 30;
  // Fall back to loose word matching, e.g. "mcdon" -> "McDonald's".
  return needle.split(/\s+/).some((word) => word.length > 2 && value.includes(word)) ? 15 : -1;
}

export function filterTransactions(
  transactions: LocalTransaction[],
  filters: SearchFilters,
  lookups: Lookups,
): TransactionHit[] {
  const needle = filters.query.trim().toLowerCase();
  const categorySet = new Set(filters.categoryIds);

  if (!filters.entities.includes("transactions")) return [];

  const hits: TransactionHit[] = [];
  for (const tx of transactions) {
    if (tx.deleted_at) continue;
    if (!inRange(tx.date, filters.range)) continue;
    if (filters.types.length > 0 && !filters.types.includes(tx.type)) continue;
    if (filters.bookmarkedOnly && !tx.is_bookmarked) continue;
    if (filters.accountIds.length > 0) {
      const touched = filters.accountIds.some(
        (id) => tx.from_account_id === id || tx.to_account_id === id,
      );
      if (!touched) continue;
    }
    if (categorySet.size > 0) {
      const root = tx.category_id ? (lookups.categoryRoot.get(tx.category_id) ?? tx.category_id) : null;
      if (!root || !categorySet.has(root)) continue;
    }
    if (filters.tagIds.length > 0 && !filters.tagIds.some((id) => tx.tag_ids.includes(id))) continue;
    if (filters.currency && tx.currency !== filters.currency) continue;

    const value = convert(Math.abs(tx.amount), tx.currency, lookups.fx);
    if (filters.minAmount !== null && value < filters.minAmount) continue;
    if (filters.maxAmount !== null && value > filters.maxAmount) continue;

    if (!needle) {
      hits.push({ transaction: tx, score: 0 });
      continue;
    }
    const category = tx.category_id ? lookups.category.get(tx.category_id)?.name ?? "" : "";
    const from = tx.from_account_id ? lookups.account.get(tx.from_account_id)?.name ?? "" : "";
    const to = tx.to_account_id ? lookups.account.get(tx.to_account_id)?.name ?? "" : "";
    const tagText = tx.tag_ids.map((id) => lookups.tag.get(id) ?? "").join(" ");
    const best = Math.max(
      score(tx.notes, needle),
      score(category, needle),
      score(from, needle),
      score(to, needle),
      tagText ? score(tagText, needle) : -1,
    );
    if (best < 0) continue;
    hits.push({ transaction: tx, score: best });
  }

  return hits.sort((a, b) => b.score - a.score || b.transaction.date.localeCompare(a.transaction.date));
}

export interface AccountHit {
  account: LocalAccount;
  score: number;
}

export function filterAccounts(accounts: LocalAccount[], filters: SearchFilters): AccountHit[] {
  if (!filters.entities.includes("accounts")) return [];
  const needle = filters.query.trim().toLowerCase();
  return accounts
    .filter((account) => !account.deleted_at)
    .map((account) => ({ account, score: needle ? score(account.name, needle) : 0 }))
    .filter((hit) => hit.score >= 0)
    .sort((a, b) => b.score - a.score || a.account.name.localeCompare(b.account.name));
}

export interface CategoryHit {
  category: LocalCategory;
  score: number;
  total: number;
  count: number;
}

export function filterCategories(
  categories: LocalCategory[],
  filters: SearchFilters,
  lookups: Lookups,
): CategoryHit[] {
  if (!filters.entities.includes("categories")) return [];
  const needle = filters.query.trim().toLowerCase();
  return categories
    .filter((category) => !category.deleted_at)
    .map((category) => {
      let total = 0;
      let count = 0;
      if (category.type === "expense" && lookups.dataset.transactions) {
        for (const tx of lookups.dataset.transactions) {
          if (tx.type !== "expense" || !inRange(tx.date, filters.range)) continue;
          const root = tx.category_id
            ? (lookups.categoryRoot.get(tx.category_id) ?? tx.category_id)
            : null;
          if (root !== category.id) continue;
          total += convert(Math.abs(tx.amount), tx.currency, lookups.fx);
          count += 1;
        }
      }
      return { category, score: needle ? score(category.name, needle) : 0, total, count };
    })
    .filter((hit) => hit.score >= 0)
    .sort((a, b) => b.score - a.score || b.total - a.total);
}

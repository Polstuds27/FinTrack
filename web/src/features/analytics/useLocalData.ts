/**
 * The single read path for local data.
 *
 * Every page reads from this hook instead of hitting Dexie directly: rows stay
 * live (IndexedDB writes from any screen re-render here), so balances, budgets,
 * reports and the overview always reflect the newest local edit - online or off.
 */
import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db";
import {
  buildLookups,
  type Dataset,
  type Lookups,
} from "./engine";
import { usePreferences } from "../settings/preferences";

/** Dropped rows first: soft-deleted rows exist only as sync tombstones. */
function live<T extends { deleted_at: string | null }>(rows: T[] | undefined): T[] {
  return (rows ?? []).filter((row) => !row.deleted_at);
}

export interface LocalData {
  ready: boolean;
  dataset: Dataset;
  lookups: Lookups;
}

export function useLocalData(): LocalData {
  const { preferences } = usePreferences();

  const accounts = useLiveQuery(async () => live(await db.accounts.toArray()), []);
  const categories = useLiveQuery(async () => live(await db.categories.toArray()), []);
  const tags = useLiveQuery(async () => live(await db.tags.toArray()), []);
  const transactions = useLiveQuery(async () => live(await db.transactions.toArray()), []);
  const budgets = useLiveQuery(async () => live(await db.budgets.toArray()), []);
  const recurring = useLiveQuery(async () => live(await db.recurring.toArray()), []);
  const installments = useLiveQuery(async () => live(await db.installments.toArray()), []);
  const debts = useLiveQuery(async () => live(await db.debts.toArray()), []);
  const goals = useLiveQuery(async () => live(await db.savings_goals.toArray()), []);
  const rates = useLiveQuery(async () => live(await db.exchange_rates.toArray()), []);

  const ready =
    accounts !== undefined &&
    categories !== undefined &&
    transactions !== undefined &&
    budgets !== undefined;

  const dataset = useMemo<Dataset>(
    () => ({
      accounts: accounts ?? [],
      categories: categories ?? [],
      tags: tags ?? [],
      transactions: transactions ?? [],
      budgets: budgets ?? [],
      recurring: recurring ?? [],
      installments: installments ?? [],
      debts: debts ?? [],
      goals: goals ?? [],
      rates: rates ?? [],
      baseCurrency: preferences.baseCurrency,
    }),
    [accounts, categories, tags, transactions, budgets, recurring, installments, debts, goals, rates, preferences.baseCurrency],
  );

  const lookups = useMemo(() => buildLookups(dataset), [dataset]);

  return { ready, dataset, lookups };
}

/** Account name lookup that tolerates unknown ids (deleted on another device). */
export function useAccountName(): (id: string | null | undefined) => string {
  const { lookups } = useLocalData();
  return useMemo(() => (id) => (id ? (lookups.account.get(id)?.name ?? "Unknown account") : ""), [lookups]);
}

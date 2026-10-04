/**
 * Currency conversion from locally cached exchange rates.
 *
 * Multi-currency reporting must work offline, so conversion never calls the
 * network: it uses the newest rate stored for each pair, and treats the base
 * currency of the report as 1.0. Rates are symmetric (A/B == 1 / B/A).
 */
import type { LocalExchangeRate } from "../../db/types";

export interface FxTable {
  base: string;
  /** Direct rates keyed `A/B` -> units of B per 1 A. */
  rates: Map<string, number>;
  /** Date of the newest rate that fed the table, for "rates as of" copy. */
  asOf: string | null;
  missing: Set<string>;
}

export function buildFxTable(rows: LocalExchangeRate[], baseCurrency: string): FxTable {
  const rates = new Map<string, number>();
  const missing = new Set<string>();
  let asOf: string | null = null;

  // Newest first, so the first hit for a pair wins.
  const ordered = [...rows]
    .filter((row) => !row.deleted_at && row.rate > 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  for (const row of ordered) {
    const key = `${row.base_currency}/${row.quote_currency}`;
    if (!rates.has(key)) {
      rates.set(key, row.rate);
      asOf = row.date > (asOf ?? "") ? row.date : asOf;
    }
  }
  // Derive the inverse pairs the user has not entered explicitly.
  for (const [key, rate] of [...rates]) {
    const inverse = `${key.split("/")[1]}/${key.split("/")[0]}`;
    if (!rates.has(inverse) && rate !== 0) rates.set(inverse, 1 / rate);
  }

  const base = baseCurrency.toUpperCase();
  if (!rates.has(`${base}/${base}`)) rates.set(`${base}/${base}`, 1);

  return { base, rates, asOf, missing };
}

/** Units of `table.base` per 1 unit of `currency`. Falls back to 1 (no conversion). */
export function rateToBase(table: FxTable, currency: string): number {
  const code = currency.toUpperCase();
  if (code === table.base) return 1;
  const direct = table.rates.get(`${code}/${table.base}`);
  if (direct !== undefined && direct > 0) return direct;
  table.missing.add(`${code}/${table.base}`);
  return 1;
}

export function convert(amount: number, currency: string, table: FxTable): number {
  return amount * rateToBase(table, currency);
}

/** Currency pairs used by the app that have no stored rate yet. */
export function missingRates(table: FxTable): string[] {
  return [...table.missing].sort();
}

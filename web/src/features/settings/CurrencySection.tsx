/**
 * `/settings/currency` — base currency and stored exchange rates.
 *
 * The base currency is what every report and net-worth figure is expressed in.
 * Rates are ordinary synced rows: they live in this browser's database, so
 * conversions keep working offline, and edits queue like any other change.
 */
import { useMemo, useState, type FormEvent } from "react";
import { Coins, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db";
import { createExchangeRate, deleteExchangeRate } from "../../db/repositories";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  useToast,
} from "../../components/ui";
import { CURRENCIES, todayKey } from "../../design/format";
import { useLocalData } from "../analytics/useLocalData";
import { usePreferences } from "./preferences";
import { Panel } from "./Panel";

export function CurrencySection() {
  const { preferences, update } = usePreferences();
  const { dataset } = useLocalData();
  const toast = useToast();

  const [adding, setAdding] = useState(false);
  const [base, setBase] = useState(preferences.baseCurrency);
  const [quote, setQuote] = useState("EUR");
  const [rate, setRate] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useLiveQuery(
    async () =>
      (await db.exchange_rates.toArray()).sort((a, b) =>
        a.base_currency === b.base_currency
          ? a.quote_currency.localeCompare(b.quote_currency)
          : a.base_currency.localeCompare(b.base_currency),
      ),
    [],
    undefined,
  );

  const rates = rows ?? [];

  const used = useMemo(() => {
    const codes = new Set<string>([preferences.baseCurrency]);
    for (const account of dataset.accounts) codes.add(account.currency);
    for (const tx of dataset.transactions) codes.add(tx.currency);
    return [...codes].sort();
  }, [dataset.accounts, dataset.transactions, preferences.baseCurrency]);

  const lastUpdated = rates.reduce<string | null>(
    (latest, row) => (!latest || row.date > latest ? row.date : latest),
    null,
  );

  async function addRate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const value = Number(rate);
    if (!/^[A-Za-z]{3}$/.test(base) || !/^[A-Za-z]{3}$/.test(quote)) {
      setError("Currencies must be 3-letter codes.");
      return;
    }
    if (base.toUpperCase() === quote.toUpperCase()) {
      setError("Pick two different currencies.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a rate greater than zero.");
      return;
    }
    setBusy(true);
    try {
      await createExchangeRate({
        base_currency: base.toUpperCase(),
        quote_currency: quote.toUpperCase(),
        rate: value,
        date: todayKey(),
        source: "manual",
      });
      setAdding(false);
      setRate("1");
      toast.push({ tone: "success", title: "Rate saved", description: `${base.toUpperCase()} → ${quote.toUpperCase()}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that rate.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Base currency"
        description="Every total, report and budget is expressed in this currency."
      >
        <Select
          label="Report in"
          value={preferences.baseCurrency}
          onChange={(event) => void update({ baseCurrency: event.target.value })}
          hint="Amounts in other currencies are converted for display only — the stored value is never rewritten."
        >
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">In use:</span>
          {used.map((code) => (
            <Badge key={code} tone={code === preferences.baseCurrency ? "primary" : "neutral"}>
              {code}
            </Badge>
          ))}
        </div>
      </Panel>

      <Panel
        title="Exchange rates"
        description="Used to convert foreign accounts and transactions into your base currency."
        footer={
          <Button
            variant={adding ? "ghost" : "secondary"}
            size="sm"
            icon={adding ? undefined : <Plus className="h-4 w-4" />}
            onClick={() => setAdding((value) => !value)}
          >
            {adding ? "Cancel" : "Add rate"}
          </Button>
        }
      >
        {adding && (
          <form onSubmit={addRate} className="mb-3 space-y-3 rounded-xl border border-line p-3" noValidate>
            {error && (
              <p role="alert" className="rounded-lg bg-expense-soft px-3 py-2 text-sm text-expense">
                {error}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <Select label="From" value={base} onChange={(event) => setBase(event.target.value)}>
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
              <Select label="To" value={quote} onChange={(event) => setQuote(event.target.value)}>
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
              <Input
                label="Rate"
                type="number"
                min="0"
                step="0.000001"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
                required
              />
            </div>
            <Button type="submit" variant="primary" size="sm" loading={busy}>
              Save rate
            </Button>
          </form>
        )}

        {lastUpdated && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-muted">
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            {rates.length} rate{rates.length === 1 ? "" : "s"} stored · newest dated {lastUpdated}
          </p>
        )}

        {rates.length === 0 ? (
          <EmptyState
            compact
            icon={<Coins className="h-6 w-6" />}
            title="No exchange rates yet"
            description="If every account uses the same currency you don't need any. Add one whenever an account or transaction is in a different currency — the rate is stored on this device and kept in sync."
            action={
              <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
                Add a rate
              </Button>
            }
          />
        ) : (
          <Card className="max-h-80 divide-y divide-line overflow-y-auto p-0">
            {rates.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="tabular block text-sm font-medium text-ink">
                    {row.base_currency} → {row.quote_currency}
                  </span>
                  <span className="block text-xs text-muted">
                    {row.date} · {row.source || "manual"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular text-sm text-ink">{row.rate.toFixed(6)}</span>
                  <button
                    type="button"
                    aria-label={`Delete ${row.base_currency} to ${row.quote_currency} rate`}
                    title="Delete rate"
                    onClick={() => void deleteExchangeRate(row.id)}
                    className="rounded p-1 text-muted hover:bg-expense-soft hover:text-expense"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            ))}
          </Card>
        )}
      </Panel>

      <Alert tone="info" title="Rates never change what you entered">
        Conversions are applied at read time. A €50 expense stays €50 in the ledger; only the
        combined totals are shown in your base currency.
      </Alert>
    </div>
  );
}

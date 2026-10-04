/**
 * Statistics.
 *
 * Every figure on this page is computed from the local ledger — income vs
 * expense, where the money went, how balances trended, and where you stand
 * right now — so the report is identical online and offline (§16).
 */
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  LineChart as LineIcon,
  PieChart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Alert,
  BarChart,
  Card,
  CardHeader,
  DonutChart,
  EmptyState,
  LineChart,
  PageHeader,
  RankedBars,
  SegmentedControl,
  Stat,
  Tabs,
} from "../../components/ui";
import { formatMoney, formatPercent } from "../../design/format";
import { categoryIcon } from "../../design/icons";
import { useLocalData } from "../analytics/useLocalData";
import { usePreferences } from "../settings/preferences";
import {
  categoryBreakdown,
  netWorthSeries,
  portfolio,
  series,
  summarize,
} from "../analytics/engine";
import { periodRange, rangeLabel, shiftPeriod, type Period, type PeriodKind } from "../analytics/period";

const RANGE_OPTIONS: { id: PeriodKind; label: string }[] = [
  { id: "mtd", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
  { id: "all", label: "All time" },
];

type Tab = "flow" | "categories" | "networth";

export function StatisticsPage() {
  const { lookups, dataset, ready } = useLocalData();
  const { preferences } = usePreferences();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const kind = (params.get("range") as PeriodKind) || "mtd";
  const tab = ((params.get("tab") as Tab) || "flow");
  const offset = Number(params.get("offset") || 0);

  const period = useMemo<Period>(
    () => ({
      kind,
      anchor: new Date(),
      monthStartDay: preferences.monthStartDay,
    }),
    [kind, preferences.monthStartDay],
  );

  // Apply the user's offset (previous/next period) without mutating `period`.
  const anchored = useMemo<Period>(() => {
    if (offset === 0) return period;
    let next = period;
    for (let i = 0; i < Math.abs(offset); i += 1) next = shiftPeriod(next, offset > 0 ? 1 : -1);
    return next;
  }, [period, offset]);

  const range = periodRange(anchored);
  const currency = lookups.dataset.baseCurrency;

  const summary = useMemo(
    () => summarize(dataset.transactions, range, lookups.fx),
    [dataset.transactions, range, lookups.fx],
  );

  const expenseSlices = useMemo(
    () => categoryBreakdown(dataset.transactions, range, lookups, "expense", 8),
    [dataset.transactions, range, lookups],
  );
  const incomeSlices = useMemo(
    () => categoryBreakdown(dataset.transactions, range, lookups, "income", 8),
    [dataset.transactions, range, lookups],
  );

  const points = useMemo(
    () => series(dataset.transactions, anchored, lookups, kind === "all" ? 12 : 12),
    [dataset.transactions, anchored, lookups, kind],
  );

  /** Chart series: expense in front, income as the paired secondary bar. */
  const flowSeries = useMemo(
    () =>
      points.map((point) => ({
        label: point.label,
        value: point.expense,
        secondary: point.income,
        meta: `net ${point.net}`,
      })),
    [points],
  );

  const netSeries = useMemo(
    () => points.map((point) => ({ label: point.label, value: point.net })),
    [points],
  );

  const worth = useMemo(
    () => netWorthSeries(dataset, lookups, anchored, 12),
    [dataset, lookups, anchored],
  );

  const worthSeries = useMemo(
    () => worth.map((point) => ({ label: point.label, value: point.net })),
    [worth],
  );

  const totals = useMemo(() => portfolio(lookups), [lookups]);

  const savingsRate =
    summary.income > 0 ? ((summary.income - summary.expense) / summary.income) * 100 : 0;

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "offset") next.delete("offset");
    setParams(next, { replace: true });
  }

  if (ready && dataset.transactions.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Statistics" />
        <Card>
          <EmptyState
            icon={<BarChart3 className="h-7 w-7" />}
            title="Nothing to report yet"
            description="Statistics are built from your own transactions, which is why they work with no connection. Record a handful of entries and this screen fills in — spending by category, cash flow over time and net worth."
            action={
              <button
                type="button"
                onClick={() => navigate("/transactions/new")}
                className="text-sm font-medium text-primary hover:underline"
              >
                Record your first transaction
              </button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Statistics"
        period={
          <span className="text-sm text-muted">{rangeLabel(range, anchored.kind)}</span>
        }
        subtitle="Everything below is computed on this device"
        tabs={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Tabs
              items={[
                { id: "flow", label: "Cash flow", icon: <TrendingUp className="h-4 w-4" /> },
                { id: "categories", label: "Categories", icon: <PieChart className="h-4 w-4" /> },
                { id: "networth", label: "Net worth", icon: <Wallet className="h-4 w-4" /> },
              ]}
              value={tab}
              onChange={(next) => setParam("tab", next === "flow" ? "" : next)}
              ariaLabel="Statistics view"
            />
            <SegmentedControl
              size="sm"
              options={RANGE_OPTIONS}
              value={kind}
              onChange={(next) => setParam("range", next === "mtd" ? "" : next)}
              ariaLabel="Date range"
            />
          </div>
        }
      />

      <Card>
        <div className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
          <div className="px-4 py-3.5">
            <Stat
              label="Income"
              tone="income"
              value={formatMoney(summary.income, currency)}
              icon={<ArrowUpRight className="h-3.5 w-3.5" />}
            />
          </div>
          <div className="px-4 py-3.5">
            <Stat
              label="Expenses"
              tone="expense"
              value={formatMoney(summary.expense, currency)}
              icon={<ArrowDownRight className="h-3.5 w-3.5" />}
            />
          </div>
          <div className="px-4 py-3.5">
            <Stat
              label="Net"
              tone={summary.net >= 0 ? "income" : "expense"}
              value={formatMoney(summary.net, currency)}
            />
          </div>
          <div className="px-4 py-3.5">
            <Stat
              label="Saved"
              tone={savingsRate >= 0 ? "income" : "expense"}
              value={formatPercent(savingsRate)}
              caption="of income"
            />
          </div>
        </div>
      </Card>

      {tab === "flow" && (
        <>
          <Card>
            <CardHeader
              title="Income vs expenses"
              subtitle={`${summary.transactionCount} transactions in range`}
              icon={<LineIcon className="h-4 w-4" />}
            />
            <div className="px-4 pb-4">
              {points.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">No buckets to plot.</p>
              ) : (
                <BarChart data={flowSeries} height={220} ariaLabel="Income and expenses over time" format={(v) => formatMoney(v, currency, { compact: true })} showSecondary />
              )}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Net over time" icon={<TrendingUp className="h-4 w-4" />} />
              <div className="px-4 pb-4">
                <LineChart
                  data={netSeries}
                  height={180}
                  ariaLabel="Net cash flow over time"
                  tone="primary"
                  fill
                  format={(v) => formatMoney(v, currency, { compact: true })}
                />
              </div>
            </Card>

            <Card>
              <CardHeader title="Where it went" subtitle="Top spending categories" />
              <div className="px-4 pb-4">
                {expenseSlices.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">No expenses in this range.</p>
                ) : (
                  <RankedBars
                    items={expenseSlices.map((slice) => ({
                      label: slice.name,
                      value: slice.value,
                      caption: `${slice.count} tx · ${formatPercent(slice.share)}`,
                    }))}
                    format={(v) => formatMoney(v, currency, { compact: true })}
                    ariaLabel="Spending by category"
                    tone="expense"
                    limit={6}
                  />
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      {tab === "categories" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Spending breakdown" subtitle="Subcategories roll up into parents" />
            <div className="px-4 pb-4">
              {expenseSlices.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">No expenses in this range.</p>
              ) : (
                <>
                  <DonutChart
                    slices={expenseSlices.map((slice) => ({ label: slice.name, value: slice.value }))}
                    centerLabel="Spent"
                    centerValue={formatMoney(summary.expense, currency, { compact: true })}
                    ariaLabel="Spending by category"
                  />
                  <ul className="mt-4 space-y-1.5">
                    {expenseSlices.map((slice) => {
                      const Icon = categoryIcon(slice.icon, slice.name);
                      return (
                        <li key={slice.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
                            <span className="truncate text-ink">{slice.name}</span>
                          </span>
                          <span className="tabular shrink-0 text-muted">
                            {formatMoney(slice.value, currency, { compact: true })} ·{" "}
                            {formatPercent(slice.share)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Income by source" />
            <div className="px-4 pb-4">
              {incomeSlices.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">No income in this range.</p>
              ) : (
                <RankedBars
                  items={incomeSlices.map((slice) => ({
                    label: slice.name,
                    value: slice.value,
                    caption: `${slice.count} tx · ${formatPercent(slice.share)}`,
                  }))}
                  format={(v) => formatMoney(v, currency, { compact: true })}
                  ariaLabel="Income by source"
                  tone="income"
                />
              )}
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Transfers are excluded" />
            <p className="px-4 pb-4 text-sm text-muted">
              Moving money between your own accounts is not income or spending, so it never appears
              in these charts — only genuine gains and losses do. That keeps the categories honest
              when you top up savings or settle a card.
            </p>
          </Card>
        </div>
      )}

      {tab === "networth" && (
        <>
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-4 px-4 py-4">
              <Stat
                label="Net worth now"
                emphasis="hero"
                tone={totals.netWorth >= 0 ? "income" : "expense"}
                value={formatMoney(totals.netWorth, currency)}
                icon={<Wallet className="h-3.5 w-3.5" />}
              />
              <div className="grid grid-cols-2 gap-x-8">
                <Stat label="Assets" value={formatMoney(totals.assets, currency)} />
                <Stat
                  label="Liabilities"
                  tone="expense"
                  value={formatMoney(totals.liabilities, currency)}
                />
              </div>
            </div>
            <div className="px-4 pb-4">
              <LineChart
                data={worthSeries}
                height={220}
                ariaLabel="Net worth over time"
                tone="primary"
                fill
                format={(v) => formatMoney(v, currency, { compact: true })}
              />
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <Stat label="Cash available" value={formatMoney(totals.cashAvailable, currency)} />
            </Card>
            <Card className="p-4">
              <Stat
                label="Credit available"
                value={
                  totals.creditAvailable !== null
                    ? formatMoney(totals.creditAvailable, currency)
                    : "—"
                }
              />
            </Card>
            <Card className="p-4">
              <Stat
                label="Liability ratio"
                value={
                  totals.assets > 0
                    ? formatPercent((Math.abs(totals.liabilities) / totals.assets) * 100)
                    : "—"
                }
                caption="debt ÷ assets"
              />
            </Card>
          </div>
        </>
      )}

      <Alert tone="info" title="Calculated without the network">
        Every number here is derived from rows stored in this browser. That means the report opens
        on a plane, in a basement, or with the backend down — and gives the same answer.
      </Alert>
    </div>
  );
}

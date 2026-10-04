/**
 * Transactions.
 *
 * The ledger. Filters first (period, type, account, category, bookmarked), then a
 * dense list on mobile and a table from `lg` up where there is room for columns.
 * Everything is computed locally so the page is fully usable offline (§16).
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpDown,
  Bookmark,
  ArrowUpRight,
  ListFilter,
  Plus,
  SquarePen,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  PageHeader,
  SearchInput,
  SegmentedControl,
  Select,
  Stat,
} from "../../components/ui";
import { formatMoney } from "../../design/format";
import { useLocalData } from "../analytics/useLocalData";
import { usePreferences } from "../settings/preferences";
import { summarize } from "../analytics/engine";
import { periodRange, rangeLabel, shiftPeriod, type Period, type PeriodKind } from "../analytics/period";
import { toggleBookmark } from "../../db/repositories";
import { TransactionDayList, TransactionTable } from "./TransactionList";

type TypeFilter = "all" | "income" | "expense" | "transfer" | "bookmarked";

const PERIOD_KINDS: { id: PeriodKind; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
  { id: "all", label: "All time" },
];

export function TransactionsPage() {
  const { lookups, dataset } = useLocalData();
  const { preferences } = usePreferences();
  const navigate = useNavigate();

  const [kind, setKind] = useState<PeriodKind>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const period: Period = useMemo(
    () => ({ kind, anchor, monthStartDay: preferences.monthStartDay }),
    [kind, anchor, preferences.monthStartDay],
  );
  const range = periodRange(period);

  const activeFilterCount =
    (accountId ? 1 : 0) + (categoryId ? 1 : 0) + (typeFilter !== "all" ? 1 : 0) + (query ? 1 : 0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return dataset.transactions
      .filter((tx) => {
        if (range && (new Date(tx.date) < range.start || new Date(tx.date) >= range.end)) return false;
        if (typeFilter === "bookmarked") {
          if (!tx.is_bookmarked) return false;
        } else if (typeFilter !== "all" && tx.type !== typeFilter) {
          return false;
        }
        if (accountId && tx.from_account_id !== accountId && tx.to_account_id !== accountId) return false;
        if (categoryId) {
          const root = tx.category_id ? lookups.categoryRoot.get(tx.category_id) ?? tx.category_id : null;
          if (root !== categoryId && tx.category_id !== categoryId) return false;
        }
        if (needle) {
          const category = tx.category_id ? lookups.category.get(tx.category_id)?.name ?? "" : "";
          const haystack = [tx.notes, category].join(" ").toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [dataset.transactions, range, typeFilter, accountId, categoryId, query, lookups]);

  const summary = useMemo(() => summarize(filtered, null, lookups.fx), [filtered, lookups.fx]);

  const accounts = useMemo(
    () => [...dataset.accounts].sort((a, b) => a.name.localeCompare(b.name)),
    [dataset.accounts],
  );
  const categories = useMemo(
    () =>
      [...dataset.categories]
        .filter((c) => !c.parent_id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [dataset.categories],
  );

  function clearFilters() {
    setTypeFilter("all");
    setAccountId("");
    setCategoryId("");
    setQuery("");
  }

  const bookmarkCount = filtered.filter((tx) => tx.is_bookmarked).length;
  const range_text = rangeLabel(range, kind);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transactions"
        subtitle={range_text}
        actions={
          <>
            <IconButton
              label={filtersOpen ? "Hide filters" : "Show filters"}
              onClick={() => setFiltersOpen((prev) => !prev)}
              className={activeFilterCount > 0 ? "text-primary" : ""}
            >
              <ListFilter className="h-5 w-5" />
            </IconButton>
            <Button
              variant="ghost"
              size="sm"
              icon={<SquarePen className="h-4 w-4" />}
              onClick={() => navigate("/transactions/new")}
            >
              Full form
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => navigate("/transactions?add=expense")}
            >
              Add
            </Button>
          </>
        }
        tabs={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              size="sm"
              options={PERIOD_KINDS.map((option) => ({ id: option.id, label: option.label }))}
              value={kind}
              onChange={(next) => setKind(next)}
              ariaLabel="Reporting period"
              className="max-w-full"
            />
            <div className="flex items-center gap-1">
              <IconButton
                label="Previous period"
                size="sm"
                onClick={() => setAnchor(shiftPeriod(period, -1).anchor)}
              >
                <ArrowLeftRight className="h-4 w-4 -scale-x-100" />
              </IconButton>
              <IconButton
                label="Next period"
                size="sm"
                onClick={() => setAnchor(shiftPeriod(period, 1).anchor)}
              >
                <ArrowLeftRight className="h-4 w-4" />
              </IconButton>
              <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>
                Today
              </Button>
            </div>
          </div>
        }
      />

      {filtersOpen && (
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SearchInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search notes and categories"
            />
            <Select
              label="Account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">All accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
            <Select
              label="Category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <SegmentedControl
              options={[
                { id: "all", label: "All" },
                { id: "income", label: "Income", icon: <ArrowUpRight className="h-3.5 w-3.5" />, tone: "income" },
                { id: "expense", label: "Expense", icon: <ArrowDownRight className="h-3.5 w-3.5" />, tone: "expense" },
                { id: "transfer", label: "Transfer", icon: <ArrowLeftRight className="h-3.5 w-3.5" />, tone: "transfer" },
                { id: "bookmarked", label: "Saved", icon: <Bookmark className="h-3.5 w-3.5" /> },
              ]}
              value={typeFilter}
              onChange={(next) => setTypeFilter(next as TypeFilter)}
              ariaLabel="Transaction type"
            />
          </div>
          {activeFilterCount > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone="primary">{activeFilterCount} filters active</Badge>
              <Button variant="ghost" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          )}
        </Card>
      )}

      <Card>
        <div className="grid grid-cols-2 divide-x divide-line border-b border-line sm:grid-cols-4">
          <div className="px-3 py-3">
            <Stat label="Income" tone="income" value={formatMoney(summary.income, lookups.dataset.baseCurrency)} />
          </div>
          <div className="px-3 py-3">
            <Stat label="Expenses" tone="expense" value={formatMoney(summary.expense, lookups.dataset.baseCurrency)} />
          </div>
          <div className="border-t border-line px-3 py-3 sm:border-t-0">
            <Stat
              label="Net"
              tone={summary.net >= 0 ? "income" : "expense"}
              value={formatMoney(summary.net, lookups.dataset.baseCurrency, { signed: true })}
            />
          </div>
          <div className="border-t border-line px-3 py-3 sm:border-t-0">
            <Stat label="Transactions" value={filtered.length.toLocaleString()} />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={activeFilterCount > 0 ? <ArrowUpDown className="h-7 w-7" /> : <ArrowLeftRight className="h-7 w-7" />}
            title={activeFilterCount > 0 ? "No transactions match" : "Nothing recorded in this period"}
            description={
              activeFilterCount > 0
                ? "Try widening the period or clearing a filter."
                : "Record an expense, income or transfer. It saves on this device straight away, with or without a connection."
            }
            action={
              activeFilterCount > 0 ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => navigate("/transactions?add=expense")}
                >
                  Add transaction
                </Button>
              )
            }
          />
        ) : (
          <>
            {bookmarkCount > 0 && (
              <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs text-muted">
                <Bookmark aria-hidden="true" className="h-3.5 w-3.5 fill-warning/20 text-warning" />
                {bookmarkCount} bookmarked in this view
              </div>
            )}
            {/* Mobile: day-grouped list. Desktop: dense table with columns. */}
            <div className="lg:hidden">
              <TransactionDayList
                transactions={filtered}
                lookups={lookups}
                showCategory={categoryId === ""}
                onToggleBookmark={(id) => void toggleBookmark(id)}
              />
            </div>
            <div className="hidden lg:block">
              <TransactionTable
                transactions={filtered}
                lookups={lookups}
                accounts={accounts}
                onToggleBookmark={(id) => void toggleBookmark(id)}
              />
            </div>
          </>
        )}
      </Card>

      {filtered.length > 0 && (
        <p className="text-center text-xs text-muted">
          Showing {filtered.length} transaction{filtered.length === 1 ? "" : "s"} in{" "}
          {range_text.toLowerCase()}
        </p>
      )}
    </div>
  );
}
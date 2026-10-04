/**
 * Global search.
 *
 * Runs against the local rows only, so it answers instantly with no connection
 * and never waits on a round trip. Filters are encoded in the URL so a search
 * can be bookmarked, shared, or restored with the Back button.
 */
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bookmark, FolderTree, Search, Tag, Wallet, X } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SearchInput,
  SegmentedControl,
} from "../../components/ui";
import { formatMoney, formatRelativeDay } from "../../design/format";
import { categoryIcon } from "../../design/icons";
import { useLocalData } from "../analytics/useLocalData";
import {
  EMPTY_FILTERS,
  filterAccounts,
  filterCategories,
  filterTransactions,
  type SearchEntity,
} from "../analytics/search";

const ENTITIES: { id: SearchEntity; label: string }[] = [
  { id: "transactions", label: "Transactions" },
  { id: "accounts", label: "Accounts" },
  { id: "categories", label: "Categories" },
];

export function SearchPage() {
  const { lookups, dataset, ready } = useLocalData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const query = params.get("q") ?? "";
  const entity = ((params.get("in") as SearchEntity) || "transactions") as SearchEntity;
  const bookmarked = params.get("bookmarked") === "1";

  const filters = useMemo(
    () => ({
      ...EMPTY_FILTERS,
      query,
      entities: [entity],
      bookmarkedOnly: bookmarked,
    }),
    [query, entity, bookmarked],
  );

  const txHits = useMemo(
    () => filterTransactions(dataset.transactions, filters, lookups),
    [dataset.transactions, filters, lookups],
  );
  const accountHits = useMemo(
    () => filterAccounts(dataset.accounts, filters),
    [dataset.accounts, filters],
  );
  const categoryHits = useMemo(
    () => filterCategories(dataset.categories, filters, lookups),
    [dataset.categories, filters, lookups],
  );

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  const total = txHits.length + accountHits.length + categoryHits.length;
  const hasQuery = query.trim().length > 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Search"
        subtitle={
          hasQuery
            ? `${total} ${total === 1 ? "result" : "results"} on this device`
            : "Find anything by name, note, tag or amount"
        }
        tabs={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchInput
              value={query}
              onValueChange={(value) => setParam("q", value)}
              placeholder="Coffee, rent, groceries, 42.50…"
              aria-label="Search everything"
              className="sm:flex-1"
            />
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                size="sm"
                options={ENTITIES}
                value={entity}
                onChange={(next) => setParam("in", next === "transactions" ? null : next)}
                ariaLabel="What to search"
              />
              <Button
                variant={bookmarked ? "primary" : "secondary"}
                size="sm"
                icon={<Bookmark className="h-4 w-4" />}
                onClick={() => setParam("bookmarked", bookmarked ? null : "1")}
              >
                Bookmarked
              </Button>
            </div>
          </div>
        }
      />

      {!ready ? (
        <Card>
          <EmptyState
            icon={<Search className="h-7 w-7" />}
            title="Loading your ledger…"
            description="Search runs against the copy stored in this browser."
          />
        </Card>
      ) : total === 0 ? (
        <Card>
          <EmptyState
            icon={<Search className="h-7 w-7" />}
            title={hasQuery ? `No matches for “${query}”` : "Start typing to search"}
            description={
              hasQuery
                ? "Try fewer words, switch the section, or clear the bookmarked-only filter. Search looks at notes, category names, account names and tags."
                : "Everything stored on this device is indexed here — transactions, accounts and categories — and it works with no connection."
            }
            action={
              hasQuery ? (
                <Button
                  variant="secondary"
                  icon={<X className="h-4 w-4" />}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.delete("q");
                    next.delete("bookmarked");
                    setParams(next, { replace: true });
                  }}
                >
                  Clear search
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          {entity === "transactions" && txHits.length > 0 && (
            <Card>
              <div className="border-b border-line px-4 py-2.5 text-xs font-medium tracking-wide text-muted uppercase">
                Transactions · {txHits.length}
              </div>
              <ul className="divide-y divide-line">
                {txHits.slice(0, 60).map(({ transaction: tx }) => {
                  const category = tx.category_id
                    ? lookups.category.get(tx.category_id)
                    : undefined;
                  const Icon = categoryIcon(category?.icon ?? null, category?.name);
                  const from = tx.from_account_id
                    ? (lookups.account.get(tx.from_account_id)?.name ?? "")
                    : "";
                  const to = tx.to_account_id
                    ? (lookups.account.get(tx.to_account_id)?.name ?? "")
                    : "";
                  return (
                    <li key={tx.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/transactions/${tx.id}`)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-sunken"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                              tx.type === "income"
                                ? "bg-income-soft text-income"
                                : tx.type === "expense"
                                  ? "bg-expense-soft text-expense"
                                  : "bg-transfer-soft text-transfer"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 truncate text-sm text-ink">
                              {tx.notes || category?.name || tx.type}
                              {tx.is_bookmarked && (
                                <Bookmark
                                  aria-label="Bookmarked"
                                  className="h-3 w-3 shrink-0 text-warning"
                                />
                              )}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {formatRelativeDay(tx.date)}
                              {from || to ? ` · ${from}${to ? ` → ${to}` : ""}` : ""}
                            </span>
                          </span>
                        </span>
                        <span
                          className={`tabular shrink-0 text-sm font-semibold ${
                            tx.type === "income"
                              ? "text-income"
                              : tx.type === "expense"
                                ? "text-expense"
                                : "text-ink"
                          }`}
                        >
                          {tx.type === "income" ? "+" : tx.type === "expense" ? "−" : ""}
                          {formatMoney(Math.abs(tx.amount), tx.currency)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {entity === "accounts" && (
            <Card>
              <div className="border-b border-line px-4 py-2.5 text-xs font-medium tracking-wide text-muted uppercase">
                Accounts · {accountHits.length}
              </div>
              <ul className="divide-y divide-line">
                {accountHits.map(({ account }) => (
                  <li key={account.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/accounts/${account.id}`)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-sunken"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Wallet aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink">{account.name}</span>
                          <span className="block text-xs capitalize text-muted">
                            {account.type} · {account.currency}
                          </span>
                        </span>
                      </span>
                      <span
                        className={`tabular shrink-0 text-sm font-semibold ${
                          account.current_balance < 0 ? "text-expense" : "text-ink"
                        }`}
                      >
                        {formatMoney(account.current_balance, account.currency)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {entity === "categories" && (
            <Card>
              <div className="border-b border-line px-4 py-2.5 text-xs font-medium tracking-wide text-muted uppercase">
                Categories · {categoryHits.length}
              </div>
              <ul className="divide-y divide-line">
                {categoryHits.map(({ category, total: spent, count }) => {
                  const Icon = categoryIcon(category.icon, category.name);
                  return (
                    <li key={category.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/categories/${category.id}/edit`)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-sunken"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-ink">{category.name}</span>
                            <span className="block text-xs capitalize text-muted">
                              {category.type} · {count} tx
                            </span>
                          </span>
                        </span>
                        <span className="tabular shrink-0 text-sm font-semibold text-ink">
                          {formatMoney(spent, lookups.dataset.baseCurrency, { compact: true })}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {entity === "transactions" && txHits.length > 60 && (
            <p className="text-center text-xs text-muted">
              Showing the first 60 of {txHits.length} — narrow the query to see the rest.
            </p>
          )}
        </>
      )}

      {!hasQuery && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-xs text-muted">
            <span className="font-medium text-ink">Also searchable:</span>
            <Badge tone="neutral">
              <Tag className="mr-1 inline h-3 w-3" />
              Tags
            </Badge>
            <Badge tone="neutral">
              <FolderTree className="mr-1 inline h-3 w-3" />
              Subcategories
            </Badge>
            <span>Match on notes, amounts and account names too.</span>
          </div>
        </Card>
      )}

      <Alert tone="info" title="Offline by design">
        Search never leaves this device. The index is the same rows your reports read, so results
        are complete even in airplane mode.
      </Alert>
    </div>
  );
}

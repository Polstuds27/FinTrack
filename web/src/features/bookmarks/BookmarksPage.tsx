/**
 * Bookmarks.
 *
 * The transactions you flagged for later — receipts to check, charges to
 * dispute, anything worth finding again without remembering when it happened.
 * Flagging is a local row edit, so it syncs like any other change.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bookmark, Star } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  SegmentedControl,
} from "../../components/ui";
import type { LocalTransaction } from "../../db/types";
import { formatMoney, formatRelativeDay } from "../../design/format";
import { categoryIcon } from "../../design/icons";
import { useLocalData } from "../analytics/useLocalData";
import { toggleBookmark } from "../../db/repositories";

type Sort = "recent" | "amount";

export function BookmarksPage() {
  const { dataset, ready } = useLocalData();
  const navigate = useNavigate();
  const [sort, setSort] = useState<Sort>("recent");

  const rows = useMemo(() => {
    const bookmarked = dataset.transactions.filter((tx) => tx.is_bookmarked);
    return sort === "amount"
      ? [...bookmarked].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      : [...bookmarked].sort((a, b) => b.date.localeCompare(a.date));
  }, [dataset.transactions, sort]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bookmarks"
        subtitle={`${rows.length} flagged transaction${rows.length === 1 ? "" : "s"}`}
        leading={
          <button
            type="button"
            aria-label="Back"
            onClick={() => navigate(-1)}
            className="mt-1 text-muted hover:text-ink"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        }
        tabs={
          rows.length > 1 ? (
            <SegmentedControl
              size="sm"
              options={[
                { id: "recent", label: "Most recent" },
                { id: "amount", label: "Largest first" },
              ]}
              value={sort}
              onChange={setSort}
              ariaLabel="Sort bookmarks"
            />
          ) : undefined
        }
      />

      {ready && rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Bookmark className="h-7 w-7" />}
            title="No bookmarks yet"
            description="Flag a transaction whenever you want to find it again — a charge to dispute, a receipt to file, a payment to question. Open any transaction and tap the bookmark, or use the row action in the list."
            action={
              <Button variant="primary" onClick={() => navigate("/transactions")}>
                Browse transactions
              </Button>
            }
            secondaryAction={<LinkButton to="/search">Search instead</LinkButton>}
          />
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {rows.map((tx) => (
            <Row key={tx.id} tx={tx} onOpen={() => navigate(`/transactions/${tx.id}`)} />
          ))}
        </Card>
      )}

      <Card>
        <div className="px-4 py-3 text-sm text-muted">
          Bookmarks are stored with the transaction itself, so they follow you between devices on
          the next sync and are readable while offline.
        </div>
      </Card>
    </div>
  );
}

function Row({ tx, onOpen }: { tx: LocalTransaction; onOpen: () => void }) {
  const { lookups } = useLocalData();
  const category = tx.category_id ? lookups.category.get(tx.category_id) : undefined;
  const Icon = categoryIcon(category?.icon ?? null, category?.name);
  const from = tx.from_account_id
    ? (lookups.account.get(tx.from_account_id)?.name ?? "")
    : "";
  const to = tx.to_account_id ? (lookups.account.get(tx.to_account_id)?.name ?? "") : "";

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span
          aria-hidden="true"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            tx.type === "income"
              ? "bg-income-soft text-income"
              : tx.type === "expense"
                ? "bg-expense-soft text-expense"
                : "bg-transfer-soft text-transfer"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">
            {tx.notes || category?.name || tx.type}
          </span>
          <span className="block truncate text-xs text-muted">
            {formatRelativeDay(tx.date)}
            {from || to ? ` · ${from}${to ? ` → ${to}` : ""}` : ""}
          </span>
        </span>
      </button>

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

      <button
        type="button"
        aria-label="Remove bookmark"
        title="Remove bookmark"
        onClick={() => void toggleBookmark(tx.id)}
        className="shrink-0 rounded-lg p-1.5 text-warning transition-colors hover:bg-warning-soft"
      >
        <Star className="h-4 w-4 fill-current" />
      </button>
    </div>
  );
}

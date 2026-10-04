/**
 * Accounts.
 *
 * A ledger-first list: totals across the top, then accounts grouped by type with
 * the metadata that matters per type (credit limit and utilization for cards,
 * plain balances for everything else). No permanent creation form - the editor
 * is a sheet that opens from the header (§14).
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Archive,
  ChevronRight,
  CreditCard,
  Landmark,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ConfirmOverlay,
  Dropdown,
  EmptyState,
  PageHeader,
  ProgressBar,
  Stat,
  useToast,
} from "../../components/ui";
import type { LocalAccount } from "../../db/types";
import { formatMoney, formatPercent } from "../../design/format";
import { ACCOUNT_TYPE_GROUPS, ACCOUNT_TYPE_LABELS, accountIcon } from "../../design/icons";
import { useLocalData } from "../analytics/useLocalData";
import { accountTotals, isLiability, portfolio, type AccountTotals } from "../analytics/engine";
import { periodRange, type Period } from "../analytics/period";
import { usePreferences } from "../settings/preferences";
import { deleteAccount, updateAccount } from "../../db/repositories";

export function AccountsPage() {
  const { lookups } = useLocalData();
  const { preferences, update } = usePreferences();
  const toast = useToast();
  const navigate = useNavigate();
  const [pendingDelete, setPendingDelete] = useState<LocalAccount | null>(null);
  const [busy, setBusy] = useState(false);

  const period: Period = useMemo(
    () => ({ kind: "month", anchor: new Date(), monthStartDay: preferences.monthStartDay }),
    [preferences.monthStartDay],
  );
  const range = periodRange(period);

  const totals = useMemo(
    () => accountTotals(lookups.dataset, lookups, range),
    [lookups, range],
  );
  const summary = useMemo(() => portfolio(lookups), [lookups]);

  const visible = useMemo(
    () => (preferences.showArchived ? totals : totals.filter((t) => !t.account.archived)),
    [totals, preferences.showArchived],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, AccountTotals[]>();
    for (const item of visible) {
      const list = map.get(item.account.type) ?? [];
      list.push(item);
      map.set(item.account.type, list);
    }
    return ACCOUNT_TYPE_GROUPS.map((group) => ({
      ...group,
      items: (map.get(group.key) ?? []).sort((a, b) =>
        Math.abs(b.balance) - Math.abs(a.balance),
      ),
    })).filter((group) => group.items.length > 0);
  }, [visible]);

  // Creating and editing go through the routed editor so the URL always says
  // which screen is open and the browser Back button closes it.
  const openCreate = () => navigate("/accounts/new");
  const openEdit = (account: LocalAccount) => navigate(`/accounts/${account.id}/edit`);

  async function toggleArchive(account: LocalAccount) {
    await updateAccount(account.id, { archived: !account.archived });
    toast.push({
      tone: "success",
      title: account.archived ? "Account restored" : "Account archived",
      description: account.archived
        ? "It will show on your Accounts page again."
        : "History is kept — it just leaves your default lists.",
    });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteAccount(pendingDelete.id);
      toast.push({ tone: "success", title: "Account deleted" });
      setPendingDelete(null);
    } catch (err) {
      toast.push({
        tone: "error",
        title: "Couldn't delete account",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const archivedCount = totals.filter((t) => t.account.archived).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounts"
        subtitle={`${visible.length} ${visible.length === 1 ? "account" : "accounts"} · balances in ${lookups.dataset.baseCurrency}`}
        actions={
          <>
            {archivedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void update({ showArchived: !preferences.showArchived })}
              >
                {preferences.showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
              </Button>
            )}
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Add account
            </Button>
          </>
        }
      />

      {/* Totals first: assets, liabilities, net worth. */}
      <Card>
        <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="px-4 py-3.5">
            <Stat
              label="Total assets"
              value={formatMoney(summary.assets, lookups.dataset.baseCurrency)}
              icon={<Wallet className="h-3.5 w-3.5" />}
            />
          </div>
          <div className="px-4 py-3.5">
            <Stat
              label="Total liabilities"
              tone={summary.liabilities < 0 ? "expense" : "default"}
              value={formatMoney(summary.liabilities, lookups.dataset.baseCurrency)}
              icon={<Landmark className="h-3.5 w-3.5" />}
            />
          </div>
          <div className="px-4 py-3.5">
            <Stat
              label="Net worth"
              emphasis="large"
              tone={summary.netWorth >= 0 ? "primary" : "expense"}
              value={formatMoney(summary.netWorth, lookups.dataset.baseCurrency)}
            />
          </div>
        </div>
      </Card>

      {totals.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Wallet className="h-7 w-7" />}
            title="No accounts yet"
            description="Add the cash, bank and card accounts you actually use. FinTrack recalculates balances from your transactions, so an accurate opening balance is all it needs."
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                Add your first account
              </Button>
            }
            secondaryAction={
              <Button variant="ghost" onClick={() => navigate("/settings")}>
                Change base currency
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <section key={group.key} className="card overflow-hidden">
              <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">
                  {group.label}
                </h2>
                <span className="tabular text-xs text-muted">
                  {group.items.length} ·{" "}
                  {formatMoney(
                    group.items.reduce((sum, item) => sum + item.balance, 0),
                    lookups.dataset.baseCurrency,
                  )}
                </span>
              </header>
              <ul className="divide-y divide-line">
                {group.items.map((item) => (
                  <AccountListRow
                    key={item.account.id}
                    item={item}
                    currency={lookups.dataset.baseCurrency}
                    onEdit={() => openEdit(item.account)}
                    onToggleArchive={() => void toggleArchive(item.account)}
                    onDelete={() => setPendingDelete(item.account)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}



      <ConfirmOverlay
        open={pendingDelete !== null}
        busy={busy}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete this account?"
        confirmLabel="Delete account"
        message={
          <>
            <strong>{pendingDelete?.name}</strong> will be removed from this device and your other
            devices. Accounts with transactions can only be archived.
          </>
        }
      />
    </div>
  );
}

/** One row. Credit cards get their utilization line instead of plain metadata. */
function AccountListRow({
  item,
  currency,
  onEdit,
  onToggleArchive,
  onDelete,
}: {
  item: AccountTotals;
  currency: string;
  onEdit: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  const account = item.account;
  const Icon = accountIcon(account.type);
  const isCard = account.type === "credit" || account.type === "debit";
  const liability = isLiability(account.type);
  const tone = liability ? "text-expense" : "text-ink";
  const navigate = useNavigate();

  return (
    <li className="row-link flex items-center gap-3 px-4 py-3">
      <Link to={`/accounts/${account.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-soft"
        >
          {isCard ? <CreditCard className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-ink">{account.name}</span>
            {account.archived && <Badge tone="neutral">Archived</Badge>}
          </span>
          <span className="tabular block truncate text-xs text-muted">
            {isCard && item.creditLimit !== null ? (
              <>
                {formatMoney(item.creditUsed ?? 0, account.currency)} of{" "}
                {formatMoney(item.creditLimit, account.currency)} used
                {item.utilization !== null && ` · ${formatPercent(item.utilization)}`}
              </>
            ) : (
              <>
                {ACCOUNT_TYPE_LABELS[account.type] ?? account.type} · {account.currency}
                {item.transactionCount > 0 && ` · ${item.transactionCount} this month`}
              </>
            )}
          </span>
          {isCard && item.utilization !== null && (
            <ProgressBar
              value={item.utilization}
              size="xs"
              className="mt-1.5 max-w-xs"
              tone={item.utilization > 80 ? "warning" : "primary"}
              label={`${account.name} credit utilization`}
            />
          )}
        </span>

        <span className={`tabular shrink-0 text-sm font-semibold ${tone}`}>
          {formatMoney(item.balance, currency)}
        </span>
      </Link>

      <Dropdown
        label={`Actions for ${account.name}`}
        trigger={<MoreHorizontal className="h-5 w-5" />}
        items={[
          {
            id: "open",
            label: "View history",
            icon: <ChevronRight aria-hidden="true" className="h-4 w-4" />,
            onSelect: () => navigate(`/accounts/${account.id}`),
          },
          {
            id: "edit",
            label: "Edit",
            icon: <Pencil aria-hidden="true" className="h-4 w-4" />,
            onSelect: onEdit,
          },
          {
            id: "archive",
            label: account.archived ? "Restore" : "Archive",
            icon: <Archive aria-hidden="true" className="h-4 w-4" />,
            onSelect: onToggleArchive,
          },
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            icon: <Trash2 aria-hidden="true" className="h-4 w-4" />,
            onSelect: onDelete,
          },
        ]}
      />
    </li>
  );
}
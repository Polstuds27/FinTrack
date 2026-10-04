/**
 * Credit cards.
 *
 * Their own section because the questions differ from a bank account: what have
 * I used, when does the statement close, when is it due. Balances and history
 * come from the same ledger, so nothing here is a second source of truth (§25).
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, CreditCard, Landmark, Plus, TrendingUp } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  ProgressBar,
  Stat,
} from "../../components/ui";
import { formatMoney, formatPercent } from "../../design/format";
import { useLocalData } from "../analytics/useLocalData";
import { usePreferences } from "../settings/preferences";
import { isLiability, summarize } from "../analytics/engine";
import { periodRange, type Period } from "../analytics/period";

const CARD_TYPES = new Set(["credit", "debit"]);

export function CreditCardsPage() {
  const { lookups, dataset, ready } = useLocalData();
  const { preferences } = usePreferences();
  const navigate = useNavigate();

  const cards = useMemo(
    () =>
      dataset.accounts
        .filter((account) => CARD_TYPES.has(account.type) && !account.archived)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [dataset.accounts],
  );

  const period: Period = useMemo(
    () => ({ kind: "month", anchor: new Date(), monthStartDay: preferences.monthStartDay }),
    [preferences.monthStartDay],
  );
  const range = periodRange(period);

  const totalLimit = cards.reduce((sum, card) => sum + (card.credit_limit ?? 0), 0);
  const totalUsed = cards.reduce(
    (sum, card) => sum + Math.abs(Math.min(0, card.current_balance)),
    0,
  );
  const utilization = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0;

  const monthCharges = useMemo(
    () =>
      cards.reduce((total, card) => {
        const summary = summarize(
          dataset.transactions.filter((tx) => tx.from_account_id === card.id),
          range,
          lookups.fx,
          [card.id],
        );
        return total + summary.expense;
      }, 0),
    [cards, dataset.transactions, range, lookups.fx],
  );

  const currency = lookups.dataset.baseCurrency;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Credit cards"
        subtitle={`${cards.length} active card${cards.length === 1 ? "" : "s"}`}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => navigate("/credit-cards/new")}
          >
            Add card
          </Button>
        }
      />

      {cards.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4 px-4 py-4">
            <Stat
              label="Total available credit"
              emphasis="hero"
              value={formatMoney(Math.max(0, totalLimit - totalUsed), currency)}
              caption={`of ${formatMoney(totalLimit, currency)} limit`}
              icon={<CreditCard className="h-3.5 w-3.5" />}
            />
            <div className="grid grid-cols-3 gap-x-8">
              <Stat
                label="Used"
                tone={utilization > 80 ? "expense" : "default"}
                value={formatMoney(totalUsed, currency)}
              />
              <Stat label="Utilization" value={formatPercent(utilization)} />
              <Stat
                label="This month"
                tone="expense"
                value={formatMoney(monthCharges, currency, { compact: true })}
              />
            </div>
          </div>
          <div className="px-4 pb-4">
            <ProgressBar
              value={utilization}
              tone={utilization > 80 ? "warning" : "primary"}
              label="Overall credit utilization"
            />
            <p className="mt-1.5 text-xs text-muted">
              Staying below 30% of your combined limit is generally easiest on your score.
            </p>
          </div>
        </Card>
      )}

      {ready && cards.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CreditCard className="h-7 w-7" />}
            title="No credit cards yet"
            description="Add one and FinTrack tracks its balance, statement day, payment due date and utilization — then shows everything you owe in one place on this screen."
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate("/credit-cards/new")}>
                Add a card
              </Button>
            }
            secondaryAction={<LinkButton to="/accounts">See all accounts</LinkButton>}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {cards.map((card) => (
            <Card key={card.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => navigate(`/credit-cards/${card.id}`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <CreditCard aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">{card.name}</span>
                  </p>
                  <p className="tabular mt-0.5 text-xs text-muted">
                    {card.currency} · {card.credit_limit ? `${formatMoney(card.credit_limit, card.currency)} limit` : "No limit set"}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/credit-cards/${card.id}/edit`)}
                  className="shrink-0 text-xs font-medium text-primary hover:underline"
                >
                  Edit
                </button>
              </div>

              <div className="mt-3 flex items-baseline justify-between gap-3">
                <span className="tabular text-title font-semibold text-expense">
                  {formatMoney(Math.abs(Math.min(0, card.current_balance)), card.currency)}
                </span>
                <span className="tabular text-xs text-muted">
                  {card.credit_limit
                    ? `${formatMoney(Math.max(0, card.credit_limit + Math.min(0, card.current_balance)), card.currency)} available`
                    : "Set a limit to track utilization"}
                </span>
              </div>

              {card.credit_limit ? (
                <ProgressBar
                  value={
                    (Math.abs(Math.min(0, card.current_balance)) / card.credit_limit) * 100
                  }
                  size="sm"
                  tone={
                    (Math.abs(Math.min(0, card.current_balance)) / card.credit_limit) * 100 > 80
                      ? "warning"
                      : "primary"
                  }
                  className="mt-2"
                  label={`${card.name} credit utilization`}
                />
              ) : null}

              {(card.statement_day || card.due_day) && (
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
                  {card.statement_day && (
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <TrendingUp aria-hidden="true" className="h-3.5 w-3.5" />
                      Statement on day {card.statement_day}
                    </div>
                  )}
                  {card.due_day && (
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
                      Payment due day {card.due_day}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Alert tone="info" title="Where the balance comes from">
        Every swipe is a transaction against the card's account. That means the number here is
        always your real ledger balance, not a remembered total — including charges recorded on
        this device while offline.
      </Alert>

      <Card>
        <CardHeader
          title="Loan & installment accounts"
          icon={<Landmark className="h-4 w-4" />}
          action={<LinkButton to="/accounts">Open accounts</LinkButton>}
        />
        <ul className="divide-y divide-line">
          {dataset.accounts
            .filter((account) => isLiability(account.type) && !CARD_TYPES.has(account.type))
            .map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => navigate(`/accounts/${account.id}`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-medium text-ink">{account.name}</p>
                  <p className="text-xs text-muted">{account.currency}</p>
                </button>
                <span className="tabular text-sm font-semibold text-expense">
                  {formatMoney(Math.abs(account.current_balance), account.currency)}
                </span>
              </li>
            ))}
          {dataset.accounts.filter((account) => isLiability(account.type) && !CARD_TYPES.has(account.type))
            .length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">
              No loan or deposit accounts to show here yet.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

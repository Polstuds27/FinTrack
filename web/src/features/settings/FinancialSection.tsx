/**
 * `/settings/financial` — the conventions your reports are built on.
 *
 * The month-start day matters: budgets, the overview and every "this month"
 * figure are cut at that day rather than on the 1st, so reports match how you
 * actually think about a month.
 */
import { Alert, Input, SegmentedControl } from "../../components/ui";
import { formatMoney, startOfMonth, endOfMonth } from "../../design/format";
import { usePreferences } from "./preferences";
import { Panel, ToggleRow } from "./Panel";

const PAGE_SIZES = [10, 25, 50, 100];

export function FinancialSection() {
  const { preferences, update } = usePreferences();

  const monthStart = startOfMonth(new Date(), preferences.monthStartDay);
  const monthEnd = endOfMonth(new Date(), preferences.monthStartDay);
  const currency = preferences.baseCurrency;

  return (
    <div className="space-y-4">
      <Panel
        title="Financial month"
        description="Where one month ends and the next begins."
      >
        <Input
          label="Month starts on day"
          type="number"
          min={1}
          max={28}
          value={preferences.monthStartDay}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (value >= 1 && value <= 28) void update({ monthStartDay: value });
          }}
          hint="Between 1 and 28 so every month has the same length. Use 25 if you're paid on the 25th."
        />
        <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-sm text-muted">
          This month runs{" "}
          <span className="font-medium text-ink">
            {monthStart.toLocaleDateString(undefined, { day: "numeric", month: "short" })} –{" "}
            {monthEnd.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </span>
          .
        </p>
      </Panel>

      <Panel title="Number formatting" description="How amounts are written across the app.">
        <ToggleRow
          id="fin-cents"
          label="Show cents"
          description="Off rounds to whole units in every table and chart."
          checked={preferences.showCents}
          onChange={(next) => void update({ showCents: next })}
        />
        <ToggleRow
          id="fin-confirm"
          label="Confirm destructive actions"
          description="Ask before deleting something that can't be restored."
          checked={preferences.confirmDestructive}
          onChange={(next) => void update({ confirmDestructive: next })}
        />
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">
            Example
          </p>
          <p className="tabular text-title text-ink">
            {formatMoney(1234.56, currency, {
              decimals: preferences.showCents ? 2 : 0,
            })}
          </p>
        </div>
      </Panel>

      <Panel title="Lists" description="How many rows load before you scroll.">
        <SegmentedControl
          size="sm"
          options={PAGE_SIZES.map((size) => ({ id: String(size), label: `${size}` }))}
          value={String(preferences.pageSize)}
          onChange={(next) => void update({ pageSize: Number(next) })}
          ariaLabel="Rows per page"
        />
        <p className="mt-2 text-xs text-muted">
          Applies to the transaction list. Everything is paginated from the local database, so
          larger pages cost nothing offline.
        </p>
      </Panel>

      <Alert tone="info" title="Changing the month start re-cuts history">
        Past reports are recomputed on the fly from the same transactions — nothing is rewritten.
        The 12th of last month simply moves into a different bucket.
      </Alert>
    </div>
  );
}

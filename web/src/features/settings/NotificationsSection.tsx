/**
 * `/settings/notifications` — what reaches the notification centre.
 *
 * The filters are device-level: they decide which alerts are *shown* here.
 * The server keeps generating them either way, so turning something off on one
 * phone doesn't switch off alerting for your account.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { BellRing, CalendarClock, CircleAlert, PiggyBank, RefreshCw, Target } from "lucide-react";
import { ApiError, apiFetch } from "../../api/client";
import { Alert, Button, useToast } from "../../components/ui";
import { usePreferences } from "./preferences";
import { Panel, ToggleRow } from "./Panel";

export function NotificationsSection() {
  const { preferences, update } = usePreferences();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runChecks() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ budgets: number; debts: number; goals: number }>(
        "/notifications/checks/",
        { method: "POST", body: JSON.stringify({}) },
      );
      const total = result.budgets + result.debts + result.goals;
      toast.push({
        tone: total > 0 ? "info" : "success",
        title: total > 0 ? `${total} new alert${total === 1 ? "" : "s"}` : "Nothing new",
        description: `${result.budgets} budget · ${result.debts} debt · ${result.goals} goal`,
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't run the checks. They also run on a schedule while you're signed in.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Alert checks"
        description="FinTrack watches budgets, debts and goals, then posts an alert when something needs attention."
        footer={
          <>
            <Link
              to="/notifications"
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-primary hover:underline"
            >
              Open notifications
            </Link>
            <Button
              variant="primary"
              size="sm"
              icon={<RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />}
              loading={busy}
              onClick={() => void runChecks()}
            >
              Check now
            </Button>
          </>
        }
      >
        {error && (
          <Alert tone="warning" title="Couldn't run the checks">
            {error}
          </Alert>
        )}
        <ul className="space-y-2 text-sm text-muted">
          <li className="flex items-start gap-2">
            <PiggyBank aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            A budget crosses the alert threshold you set on it.
          </li>
          <li className="flex items-start gap-2">
            <CalendarClock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            A debt falls due, or passes its due date.
          </li>
          <li className="flex items-start gap-2">
            <Target aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-income" />
            A savings goal drifts off the pace needed for its target date.
          </li>
        </ul>
      </Panel>

      <Panel
        title="Show on this device"
        description="Choose which kinds appear in the notification centre here."
      >
        <ToggleRow
          id="notify-budgets"
          label="Budget alerts"
          description="Threshold and over-limit warnings."
          checked={preferences.notifyBudgets}
          onChange={(next) => void update({ notifyBudgets: next })}
        />
        <ToggleRow
          id="notify-debts"
          label="Debt reminders"
          description="Due and overdue balances."
          checked={preferences.notifyDebts}
          onChange={(next) => void update({ notifyDebts: next })}
        />
        <ToggleRow
          id="notify-goals"
          label="Goal nudges"
          description="Pace warnings for savings targets."
          checked={preferences.notifyGoals}
          onChange={(next) => void update({ notifyGoals: next })}
        />
        <ToggleRow
          id="notify-other"
          label="Everything else"
          description="Sync problems, generated transactions and system messages."
          checked={preferences.notifyOther}
          onChange={(next) => void update({ notifyOther: next })}
        />
      </Panel>

      <Alert tone="info" title="Alerts never block a transaction">
        Crossing a threshold puts the fact in front of you. It never stops a save, and it never
        changes a number in your ledger.
      </Alert>

      <p className="flex items-center gap-1.5 text-xs text-muted">
        <BellRing aria-hidden="true" className="h-3.5 w-3.5" />
        Push notifications to your home screen are not configured yet — the notification centre is
        the supported surface.
      </p>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" />
        These preferences apply to this device only.
      </p>
    </div>
  );
}

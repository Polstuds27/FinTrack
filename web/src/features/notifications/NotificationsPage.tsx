/**
 * Notifications.
 *
 * Alerts about budgets nearing their limit, debts coming due and goals drifting
 * off schedule. They are cached locally, so the history stays readable without
 * a connection; refreshing needs one.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  BellOff,
  CalendarClock,
  CircleAlert,
  Info,
  RefreshCw,
  Target,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  SegmentedControl,
} from "../../components/ui";
import type { LocalNotification } from "../../db/types";
import { formatRelativeTime } from "../../design/format";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db";
import { markAllRead, markRead, refreshNotifications } from "./repository";
import { usePreferences } from "../settings/preferences";

type Filter = "all" | "unread";

const LEVEL_ICON = {
  info: Info,
  warning: CircleAlert,
  critical: CircleAlert,
} as const;

/** Device-level visibility; server-side alerting is unaffected. */
function isVisible(row: LocalNotification, prefs: ReturnType<typeof usePreferences>["preferences"]): boolean {
  if (row.kind === "budget") return prefs.notifyBudgets;
  if (row.kind === "debt") return prefs.notifyDebts;
  if (row.kind === "goal") return prefs.notifyGoals;
  return prefs.notifyOther;
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const { preferences } = usePreferences();
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const rows = useLiveQuery(
    async () => (await db.notifications.toArray()).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [],
    undefined,
  );

  const notifications: LocalNotification[] = (rows ?? []).filter((row) => isVisible(row, preferences));
  const unread = notifications.filter((row) => !row.is_read).length;
  const visible = filter === "unread" ? notifications.filter((row) => !row.is_read) : notifications;

  const refresh = useCallback(async () => {
    setBusy(true);
    setSyncError(null);
    try {
      await refreshNotifications();
      setLastRefresh(new Date());
    } catch (error) {
      setSyncError(
        error instanceof Error
          ? error.message
          : "Couldn't reach the server. Showing what's saved on this device.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        subtitle={
          notifications.length > 0
            ? `${unread} unread · ${notifications.length} total`
            : "Budget, debt and goal alerts"
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />}
            loading={busy}
            onClick={() => void refresh()}
          >
            Refresh
          </Button>
        }
        tabs={
          notifications.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                size="sm"
                options={[
                  { id: "all", label: `All (${notifications.length})` },
                  { id: "unread", label: `Unread (${unread})`, tone: unread > 0 ? "expense" : undefined },
                ]}
                value={filter}
                onChange={setFilter}
                ariaLabel="Notification filter"
              />
              {unread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void markAllRead();
                  }}
                >
                  Mark all read
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      {syncError && (
        <Alert tone="warning" title="Couldn't refresh">
          {syncError} Notifications are still readable from the copy stored on this device.
        </Alert>
      )}

      {lastRefresh && !syncError && (
        <p className="text-xs text-muted">
          Last refreshed {formatRelativeTime(lastRefresh.toISOString())}
        </p>
      )}

      {notifications.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Bell className="h-7 w-7" />}
            title="Nothing to worry about yet"
            description="FinTrack raises an alert when a budget crosses its threshold, a debt falls due, or a savings goal drifts off schedule. Run the checks from the button below, or wait for the scheduled run."
            action={
              <Button variant="primary" onClick={() => void refresh()}>
                Check for alerts
              </Button>
            }
            secondaryAction={<LinkButton to="/budgets">Open budgets</LinkButton>}
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BellOff className="h-7 w-7" />}
            title="All caught up"
            description="Every notification has been read. Switch back to All if you want to look through the history."
            action={
              <Button variant="secondary" onClick={() => setFilter("all")}>
                Show all
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {visible.map((row) => (
            <NotificationRow
              key={row.id}
              row={row}
              onOpen={() => void markRead(row.id)}
              onNavigate={() => {
                void markRead(row.id);
                navigate(targetFor(row));
              }}
            />
          ))}
        </Card>
      )}

      <Alert tone="info" title="Alerts are advisory, never blocking">
        Crossing a budget threshold or a debt due date never stops a transaction from being saved.
        It simply puts the fact in front of you.
      </Alert>
    </div>
  );
}

/** Best-effort deep link; unknown kinds stay on this page. */
function targetFor(row: LocalNotification): string {
  const kind = row.kind.toLowerCase();
  if (kind.includes("budget")) return "/budgets";
  if (kind.includes("debt")) return "/debts";
  if (kind.includes("goal")) return "/goals";
  if (kind.includes("recurring")) return "/recurring";
  if (kind.includes("installment")) return "/installments";
  if (kind.includes("sync")) return "/sync/conflicts";
  return "/notifications";
}

function NotificationRow({
  row,
  onOpen,
  onNavigate,
}: {
  row: LocalNotification;
  onOpen: () => void;
  onNavigate: () => void;
}) {
  const Icon =
    row.kind.includes("goal")
      ? Target
      : row.kind.includes("due") || row.kind.includes("debt")
        ? CalendarClock
        : LEVEL_ICON[row.level] ?? Info;

  const tone =
    row.level === "critical"
      ? "bg-expense-soft text-expense"
      : row.level === "warning"
        ? "bg-warning-soft text-warning"
        : "bg-primary-soft-bg text-primary";

  return (
    <div className={`flex items-start gap-3 px-4 py-3 ${row.is_read ? "opacity-70" : ""}`}>
      <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-4 w-4" />
      </span>

      <button type="button" onClick={onNavigate} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-ink">{row.title}</span>
          {!row.is_read && <Badge tone="primary">New</Badge>}
        </span>
        <span className="mt-0.5 block text-sm text-muted">{row.body}</span>
        <span className="mt-1 block text-xs text-muted">{formatRelativeTime(row.created_at)}</span>
      </button>

      {!row.is_read && (
        <Button variant="ghost" size="sm" onClick={onOpen} aria-label={`Mark "${row.title}" as read`}>
          Mark read
        </Button>
      )}
    </div>
  );
}

/**
 * `/settings/sync` — queue health and manual control.
 *
 * Everything shown here comes from the real outbox and conflict tables, so the
 * numbers are the ones the engine will act on next run.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, CloudUpload, RefreshCw, WifiOff } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { Badge, Button, Card, DetailRow, Divider, LinkButton } from "../../components/ui";
import { formatDateTime, formatRelativeTime } from "../../design/format";
import { db } from "../../db";
import { pendingMutations, outboxTotal, parkedEntries, retryMutation, retryAllParked } from "../../sync/outbox";
import { useSync } from "../../sync/SyncContext";
import { useAuth } from "../../auth/AuthContext";
import type { OutboxEntry } from "../../db/types";
import { Panel } from "./Panel";

const STATUS_TONE = {
  idle: "income",
  syncing: "primary",
  offline: "warning",
  "api-unavailable": "warning",
  "signed-out": "neutral",
  error: "expense",
} as const;

export function SyncSection() {
  const { status, pendingCount, conflicts, lastSyncedAt, syncNow } = useSync();
  const { flushCredentials } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<OutboxEntry[]>([]);
  // Entries the server rejected (or that stopped returning results) leave the
  // push batch but are never deleted — they need their error and a retry.
  const [parked, setParked] = useState<OutboxEntry[]>([]);
  // Signed out, the owner filter hides everything — but the rows are still
  // held on this device, so count them separately instead of claiming zero.
  const [held, setHeld] = useState(0);

  // The stored token is dead (rotation fails): flush it and land on a real
  // sign-in form. A plain link would bounce straight back — the stale token
  // keeps `isAuthenticated` true and `/login` redirects authenticated users.
  function reSignIn() {
    flushCredentials();
    navigate("/login", { replace: true });
  }

  const conflictRows = useLiveQuery(async () => db.conflicts.toArray(), [], undefined);

  useEffect(() => {
    let cancelled = false;
    void pendingMutations(20).then((rows) => {
      if (!cancelled) setQueue(rows);
    });
    void parkedEntries(20).then((rows) => {
      if (!cancelled) setParked(rows);
    });
    if (status === "signed-out") {
      void outboxTotal().then((total) => {
        if (!cancelled) setHeld(total);
      });
    } else if (!cancelled) {
      setHeld(0);
    }
    return () => {
      cancelled = true;
    };
  }, [pendingCount, status]);

  async function retryOne(id: string) {
    setBusy(true);
    try {
      await retryMutation(id);
      await syncNow();
    } finally {
      setBusy(false);
    }
  }

  async function retryParked() {
    setBusy(true);
    try {
      await retryAllParked();
      await syncNow();
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setBusy(true);
    try {
      await syncNow();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Connection"
        description="This device pushes local changes and pulls server changes on a 30-second cycle."
        footer={
          <>
            <LinkButton to="/sync/conflicts">
              Conflicts ({(conflictRows ?? conflicts).length})
            </LinkButton>
            <Button
              variant="primary"
              size="sm"
              icon={<RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />}
              loading={busy}
              onClick={() => void run()}
            >
              Sync now
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status}</Badge>
          <span className="text-sm text-muted">
            {status === "signed-out" && held > 0 ? (
              <>
                {held} change{held === 1 ? "" : "s"} held on this device —{" "}
                <button
                  type="button"
                  onClick={reSignIn}
                  className="font-medium text-primary hover:underline"
                >
                  sign in to send
                </button>
              </>
            ) : parked.length > 0 ? (
              <>
                {pendingCount} change{pendingCount === 1 ? "" : "s"} waiting to be pushed ·{" "}
                {parked.length} rejected, see below
              </>
            ) : (
              <>
                {pendingCount} change{pendingCount === 1 ? "" : "s"} waiting to be pushed
              </>
            )}
          </span>
        </div>
        <Divider />
        <dl className="space-y-0.5">
          <DetailRow label="Last synced">
            {lastSyncedAt ? formatDateTime(lastSyncedAt) : "Never on this device"}
          </DetailRow>
          <DetailRow label="Last attempt">
            {lastSyncedAt ? formatRelativeTime(lastSyncedAt) : "—"}
          </DetailRow>
          <DetailRow label="Conflicts waiting">
            {(conflictRows ?? conflicts).length}
          </DetailRow>
        </dl>
        {status === "offline" && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
            <WifiOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            You're offline. Everything you enter is stored on this device and will sync
            automatically when the connection returns.
          </p>
        )}
        {status === "api-unavailable" && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
            <WifiOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            Your device is online but the server isn't answering. Changes stay queued and the
            app keeps retrying with backoff — nothing to do but wait.
          </p>
        )}
        {status === "error" && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-expense-soft px-3 py-2 text-sm text-expense">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            The last sync failed. Your changes are safe locally — try again, or open conflicts if
            the server rejected an edit.
          </p>
        )}
      </Panel>

      <Panel title="Outbox" description="Mutations waiting to be sent, newest first.">
        {queue.length === 0 && parked.length === 0 ? (
          <p className="text-sm text-muted">
            {status === "signed-out" && held > 0 ? (
              <>
                {held} change{held === 1 ? " is" : "s are"} held on this device. Nothing was
                discarded —{" "}
                <button
                  type="button"
                  onClick={reSignIn}
                  className="font-medium text-primary hover:underline"
                >
                  sign in
                </button>{" "}
                to send {held === 1 ? "it" : "them"}.
              </>
            ) : (
              "Nothing pending — every local edit has been acknowledged by the server."
            )}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {queue.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink">
                    {entry.op} · {entry.entity}
                  </span>
                  <span className="tabular block text-xs text-muted">
                    {entry.entity_id.slice(0, 8)} · {formatRelativeTime(entry.created_at)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge
                    tone={
                      entry.status === "conflict"
                        ? "expense"
                        : entry.status === "failed"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {entry.status}
                  </Badge>
                  {entry.attempts > 0 && (
                    <span className="tabular text-xs text-muted">{entry.attempts} tries</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {parked.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">
                {parked.length} rejected {parked.length === 1 ? "change" : "changes"} — the
                server refused {parked.length === 1 ? "it" : "them"}, so{" "}
                {parked.length === 1 ? "it stays" : "they stay"} here instead of silently
                disappearing.
              </p>
              <Button
                variant="ghost"
                size="sm"
                icon={<RefreshCw className="h-4 w-4" />}
                loading={busy}
                onClick={() => void retryParked()}
              >
                Retry all
              </Button>
            </div>
            <ul className="mt-1 divide-y divide-line">
              {parked.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">
                      {entry.op} · {entry.entity}
                    </span>
                    <span className="tabular block text-xs text-muted">
                      {entry.entity_id.slice(0, 8)} · {formatRelativeTime(entry.created_at)}
                    </span>
                    {entry.last_error && (
                      <span className="mt-0.5 block truncate text-xs text-expense">
                        {entry.last_error}
                      </span>
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={busy}
                    onClick={() => void retryOne(entry.id)}
                  >
                    Retry
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <Card className="flex items-start gap-3 p-4">
        <CloudUpload aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">How offline editing works</p>
          <p className="mt-0.5 text-xs text-muted">
            Writes land in IndexedDB first and queue a mutation. The engine pushes them in order,
            retries on failure, and surfaces disagreements as conflicts you resolve yourself —
            never by silently overwriting one side.
          </p>
          <Link to="/sync/conflicts" className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
            Review conflicts
          </Link>
        </div>
      </Card>
    </div>
  );
}

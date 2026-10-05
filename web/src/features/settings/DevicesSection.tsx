/**
 * `/settings/devices` — sessions issued to your account.
 *
 * Each row is an outstanding refresh token, which is what a "device" really is
 * here. Revoking one invalidates it immediately on the next request.
 */
import { useCallback, useEffect, useState } from "react";
import { LogOut, MonitorSmartphone, RefreshCw } from "lucide-react";
import { ApiError, apiFetch } from "../../api/client";
import { Alert, Badge, Button, Card, EmptyState, useToast } from "../../components/ui";
import { formatDateTime } from "../../design/format";
import { getAccessToken } from "../../api/client";
import { Panel } from "./Panel";

interface Session {
  /** simplejwt's `OutstandingToken.id` is a `BigAutoField`, i.e. a number. */
  id: string | number;
  created_at: string;
  expires_at: string;
}

/** Short, sortable-looking label that never assumes the id is a string. */
function sessionLabel(id: string | number): string {
  return String(id).slice(0, 8);
}

export function DevicesSection() {
  const toast = useToast();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<Session[] | Record<string, unknown>>("/auth/sessions/");
      setSessions(Array.isArray(data) ? data.filter((row) => row != null) : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load sessions.");
      setSessions((current) => current ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(id: Session["id"]) {
    setBusy(true);
    try {
      await apiFetch("/auth/sessions/", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      setSessions((current) => (current ?? []).filter((row) => row.id !== id));
      toast.push({ tone: "success", title: "Session revoked" });
    } catch (err) {
      toast.push({
        tone: "error",
        title: "Couldn't revoke session",
        description: err instanceof ApiError ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const currentToken = getAccessToken();

  return (
    <div className="space-y-4">
      <Panel
        title="Active sessions"
        description="Every browser or phone that can refresh a token for your account."
        footer={
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />}
            loading={busy}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        }
      >
        {error && (
          <Alert tone="warning" title="Couldn't load sessions">
            {error}
          </Alert>
        )}

        {sessions === null ? (
          <p className="text-sm text-muted">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <EmptyState
            compact
            icon={<MonitorSmartphone className="h-6 w-6" />}
            title={error ? "Sessions unavailable" : "No other sessions"}
            description={
              error
                ? "You appear to be signed out on the server, or the request failed."
                : "Sign in on another device and it will appear here."
            }
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Try again
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-ink">
                    <MonitorSmartphone aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
                    <span className="tabular truncate">Session {sessionLabel(session.id)}</span>
                  </p>
                  <p className="tabular mt-0.5 text-xs text-muted">
                    Started {formatDateTime(session.created_at)} · expires{" "}
                    {formatDateTime(session.expires_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {currentToken && session.id && (
                    <Badge tone="neutral">Active</Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<LogOut className="h-3.5 w-3.5" />}
                    disabled={busy}
                    onClick={() => void revoke(session.id)}
                  >
                    Revoke
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Card className="p-4">
        <p className="text-sm text-muted">
          Revoking a session blacklists its refresh token. The device is signed out the next time
          it tries to renew — this device included, if you revoke your own.
        </p>
      </Card>
    </div>
  );
}

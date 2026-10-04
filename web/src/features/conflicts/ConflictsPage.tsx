/**
 * Sync conflicts.
 *
 * Reached from the header badge and the account menu at `/sync/conflicts`. A
 * conflict means this device and the server both changed the same row while the
 * device was offline; nothing is lost until the user picks a side, and both
 * copies are shown side by side so the choice is informed (§9).
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, CircleCheck, CloudSync, ShieldAlert } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  useToast,
} from "../../components/ui";
import type { ConflictEntry } from "../../db/types";
import { formatDate } from "../../design/format";
import { useSync } from "../../sync/SyncContext";
import { resolveWithLocal, resolveWithServer } from "../../sync/syncEngine";

export function ConflictsPage() {
  const { conflicts, syncNow, pendingCount } = useSync();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function resolve(conflict: ConflictEntry, side: "server" | "local") {
    setBusy(conflict.id);
    try {
      if (side === "server") {
        await resolveWithServer(conflict.id);
        toast.push({
          tone: "success",
          title: "Kept the server version",
          description: "Your local edit for this row was discarded.",
        });
      } else {
        await resolveWithLocal(conflict.id);
        toast.push({
          tone: "success",
          title: "Kept your version",
          description: "It will be pushed to the server on the next sync.",
        });
      }
      void queryClient.invalidateQueries();
      void syncNow();
    } catch (err) {
      toast.push({
        tone: "error",
        title: "Couldn't resolve conflict",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sync conflicts"
        subtitle={`${conflicts.length} row${conflicts.length === 1 ? "" : "s"} need a decision`}
        actions={
          <Button variant="secondary" size="sm" icon={<CloudSync className="h-4 w-4" />} loading={busy === "__sync"} onClick={() => void syncNow()}>
            Sync now
          </Button>
        }
      />

      <Alert tone="info" title="Nothing here is lost">
        A conflict means both this device and your server copy changed the same record while you
        were offline. Pick the version to keep — the other one is discarded for that row only, and
        everything else keeps syncing normally.
      </Alert>

      {conflicts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CircleCheck className="h-7 w-7" />}
            title="No sync conflicts"
            description="Every change you make on this device has been accepted by the server. Conflicts show up here if an edit races ahead while you're offline."
            action={
              <Button variant="secondary" icon={<CloudSync className="h-4 w-4" />} onClick={() => void syncNow()}>
                Run a sync
              </Button>
            }
            secondaryAction={
              pendingCount > 0 ? <Badge tone="warning">{pendingCount} changes waiting</Badge> : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {conflicts.map((conflict) => (
            <Card key={conflict.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <span className="capitalize">{conflict.entity.replace(/s$/, "")}</span>
                    <span className="font-mono text-xs text-faint">{conflict.entity_id.slice(0, 8)}</span>
                  </span>
                }
                subtitle={formatDate(conflict.created_at, "medium")}
                icon={<ShieldAlert className="h-4 w-4" />}
                action={<Badge tone="warning">{conflict.op}</Badge>}
              />
              <div className="space-y-3 px-4 py-3">
                <p className="text-sm text-ink">{conflict.message}</p>
                <p className="text-xs text-muted">
                  Server version {conflict.server_version} · local operation "{conflict.op}"
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-line bg-surface-sunken p-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                      <ArrowDownToLine aria-hidden="true" className="h-3.5 w-3.5" />
                      Server copy
                    </p>
                    <p className="line-clamp-3 text-xs break-all text-ink-soft">
                      {conflict.payload ? JSON.stringify(conflict.payload).slice(0, 220) : "Not cached on this device"}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2 w-full"
                      loading={busy === conflict.id}
                      onClick={() => void resolve(conflict, "server")}
                    >
                      Use server version
                    </Button>
                  </div>

                  <div className="rounded-lg border border-line bg-surface-sunken p-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                      <ArrowUpFromLine aria-hidden="true" className="h-3.5 w-3.5" />
                      Your edit
                    </p>
                    <p className="line-clamp-3 text-xs break-all text-ink-soft">
                      {conflict.op === "delete"
                        ? "You deleted this row on this device."
                        : "The pending change queued in your outbox."}
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      className="mt-2 w-full"
                      loading={busy === conflict.id}
                      onClick={() => void resolve(conflict, "local")}
                    >
                      Keep my version
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

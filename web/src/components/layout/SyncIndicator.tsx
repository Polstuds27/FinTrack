import { CircleAlert, CloudOff, CloudSync, RefreshCw, WifiOff, type LucideIcon } from "lucide-react";
import { useSync } from "../../sync/SyncContext";
import { syncVisual, type SyncVisual } from "../../sync/status";
import { formatRelativeTime } from "../../design/format";
import { IconButton } from "../ui/Button";

const PRESENTATION: Record<SyncVisual, { Icon: LucideIcon; className: string }> = {
  synced: { Icon: CloudSync, className: "text-income" },
  syncing: { Icon: RefreshCw, className: "text-primary animate-spin-slow" },
  offline: { Icon: WifiOff, className: "text-muted" },
  "api-unavailable": { Icon: CloudOff, className: "text-warning" },
  pending: { Icon: CloudSync, className: "text-warning" },
  conflict: { Icon: CircleAlert, className: "text-expense" },
  error: { Icon: CircleAlert, className: "text-expense" },
  "signed-out": { Icon: CloudSync, className: "text-muted" },
};

/** Labels name the required states: online/synced, syncing, offline, unsynced, failed, expired. */
function visualLabel(visual: SyncVisual, pendingCount: number): string {
  switch (visual) {
    case "synced":
      return "Online · Synced";
    case "syncing":
      return "Syncing changes…";
    case "offline":
      return "Offline · Changes saved locally";
    case "api-unavailable":
      return "Server unreachable · Will retry";
    case "pending":
      return `Unsynced changes: ${pendingCount}`;
    case "conflict":
      return "Needs attention";
    case "error":
      return "Sync failed · Tap to retry";
    case "signed-out":
      return pendingCount > 0 ? "Session expired · Sign in to sync" : "Local only";
  }
}

/**
 * The sync indicator answers one question for the user: *is my money safe?*
 * It never exposes queues, sequence numbers or retry counts (§6/§47).
 */
export function SyncIndicator({ compact = false }: { compact?: boolean }) {
  const { status, pendingCount, conflicts, lastSyncedAt, syncNow } = useSync();
  const visual = syncVisual(status, pendingCount, conflicts.length);
  const { Icon, className } = PRESENTATION[visual];
  const label = visualLabel(visual, pendingCount);

  const detail =
    visual === "offline"
      ? "Saved on this device. It will sync when you're back online."
      : visual === "api-unavailable"
        ? "Your connection is up but FinTrack can't reach the server. Retrying automatically — changes stay queued."
        : visual === "conflict"
        ? `${conflicts.length} ${conflicts.length === 1 ? "record needs" : "records need"} your attention.`
        : visual === "pending"
          ? `${pendingCount} ${pendingCount === 1 ? "change" : "changes"} waiting to sync.`
          : visual === "syncing"
            ? "Uploading your latest changes."
            : visual === "error"
              ? "Tap to try again — your local data is safe."
              : visual === "signed-out"
                ? pendingCount > 0
                  ? "Your session expired with unsynced changes held safely. Sign in to send them."
                  : "Sign in to sync this device."
                : lastSyncedAt
                  ? `Last synced ${formatRelativeTime(lastSyncedAt)}.`
                  : "Everything is up to date.";

  return (
    <div className="flex items-center gap-2">
      <IconButton
        label={visual === "syncing" ? "Syncing" : visual === "error" ? "Retry sync" : "Sync now"}
        onClick={() => void syncNow()}
        disabled={status === "syncing"}
        className={className}
      >
        <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
      </IconButton>
      {!compact && (
        <span className="hidden text-xs text-muted lg:inline" title={detail}>
          <span className={`font-medium ${className}`}>{label}</span>
        </span>
      )}
    </div>
  );
}

/** Verbose variant used in Settings, where the explanation has room to breathe. */
export function SyncStatusPanel() {
  const { status, pendingCount, conflicts, lastSyncedAt, syncNow } = useSync();
  const visual = syncVisual(status, pendingCount, conflicts.length);
  const { Icon, className } = PRESENTATION[visual];
  const label = visualLabel(visual, pendingCount);

  const detail =
    visual === "offline"
      ? "You're offline. Your changes are saved on this device and will sync automatically when you're back online."
      : visual === "api-unavailable"
        ? "Your device is online but the FinTrack server isn't answering. Your changes stay queued and sync resumes on its own — no need to keep tapping."
        : visual === "conflict"
        ? "Some records were changed on another device while you had unsynced edits. Review them to pick which version to keep."
        : visual === "pending"
          ? `${pendingCount} local ${pendingCount === 1 ? "change is" : "changes are"} queued for upload.`
          : visual === "error"
            ? "We couldn't reach the server. Your local data is safe and the next attempt will retry automatically — or tap the button to try now."
            : visual === "signed-out"
              ? pendingCount > 0
                ? "Your session expired with unsynced changes held safely. Sign in to send them — nothing was discarded."
                : "Sign in to back up this device and sync across your devices."
              : lastSyncedAt
                ? `Last synced ${formatRelativeTime(lastSyncedAt)}. Everything is up to date.`
                : "Everything is up to date.";

  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
      <span
        aria-hidden="true"
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-sunken ${className}`}
      >
        <Icon className={`h-5 w-5 ${visual === "syncing" ? "animate-spin-slow" : ""}`} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted">{detail}</p>
      </div>
      <IconButton label="Sync now" onClick={() => void syncNow()} disabled={status === "syncing"}>
        <RefreshCw className={`h-4 w-4 ${status === "syncing" ? "animate-spin" : ""}`} />
      </IconButton>
    </div>
  );
}

import { CircleAlert, CloudSync, RefreshCw, WifiOff, type LucideIcon } from "lucide-react";
import { useSync } from "../../sync/SyncContext";
import { formatRelativeTime } from "../../design/format";
import { IconButton } from "../ui/Button";

export type SyncVisual = "synced" | "syncing" | "offline" | "pending" | "conflict" | "error" | "signed-out";

const PRESENTATION: Record<SyncVisual, { label: string; Icon: LucideIcon; className: string }> = {
  synced: { label: "Synced", Icon: CloudSync, className: "text-income" },
  syncing: { label: "Syncing", Icon: RefreshCw, className: "text-primary animate-spin-slow" },
  offline: { label: "Offline", Icon: WifiOff, className: "text-muted" },
  pending: { label: "Changes saved", Icon: CloudSync, className: "text-warning" },
  conflict: { label: "Needs attention", Icon: CircleAlert, className: "text-expense" },
  error: { label: "Sync issue", Icon: CircleAlert, className: "text-expense" },
  "signed-out": { label: "Local only", Icon: CloudSync, className: "text-muted" },
};

export function syncVisual(
  status: ReturnType<typeof useSync>["status"],
  pendingCount: number,
  conflictCount: number,
): SyncVisual {
  if (status === "syncing") return "syncing";
  if (status === "offline") return "offline";
  if (conflictCount > 0) return "conflict";
  if (pendingCount > 0) return "pending";
  if (status === "error") return "error";
  if (status === "signed-out") return "signed-out";
  return "synced";
}

/**
 * The sync indicator answers one question for the user: *is my money safe?*
 * It never exposes queues, sequence numbers or retry counts (§6/§47).
 */
export function SyncIndicator({ compact = false }: { compact?: boolean }) {
  const { status, pendingCount, conflicts, lastSyncedAt, syncNow } = useSync();
  const visual = syncVisual(status, pendingCount, conflicts.length);
  const { label, Icon, className } = PRESENTATION[visual];

  const detail =
    visual === "offline"
      ? "Saved on this device. It will sync when you're back online."
      : visual === "conflict"
        ? `${conflicts.length} ${conflicts.length === 1 ? "record needs" : "records need"} your attention.`
        : visual === "pending"
          ? `${pendingCount} ${pendingCount === 1 ? "change" : "changes"} waiting to sync.`
          : visual === "syncing"
            ? "Uploading your latest changes."
            : visual === "signed-out"
              ? "Sign in to sync this device."
              : lastSyncedAt
                ? `Last synced ${formatRelativeTime(lastSyncedAt)}.`
                : "Everything is up to date.";

  return (
    <div className="flex items-center gap-2">
      <IconButton
        label={visual === "syncing" ? "Syncing" : "Sync now"}
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
  const { label, Icon, className } = PRESENTATION[visual];

  const detail =
    visual === "offline"
      ? "You're offline. Your changes are saved on this device and will sync automatically when you're back online."
      : visual === "conflict"
        ? "Some records were changed on another device while you had unsynced edits. Review them to pick which version to keep."
        : visual === "pending"
          ? `${pendingCount} local ${pendingCount === 1 ? "change is" : "changes are"} queued for upload.`
          : visual === "error"
            ? "We couldn't reach the server. Your local data is safe and the next attempt will retry automatically."
            : visual === "signed-out"
              ? "Sign in to back up this device and sync across your devices."
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

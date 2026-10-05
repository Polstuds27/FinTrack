/**
 * Persistent connection + update banner.
 *
 * Fixed to the bottom of the viewport (above the mobile bottom nav) so it is
 * visible on every screen without pushing content around. Being offline is not
 * an error — it is a supported state — so the copy says what happens to the
 * work rather than apologising for the connection.
 */
import { useEffect, useState } from "react";
import { CloudUpload, RefreshCw, WifiOff, X } from "lucide-react";
import { subscribeToUpdate, type UpdateHandle } from "../../app/pwa";
import { useSync } from "../../sync/SyncContext";

export function NetworkBanner() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [update, setUpdate] = useState<UpdateHandle | null>(null);
  /** Per-drop dismissal: the notice comes back the next time the connection drops. */
  const [offlineDismissed, setOfflineDismissed] = useState(false);
  const { pendingCount } = useSync();

  useEffect(() => {
    const on = () => {
      setOnline(true);
      setOfflineDismissed(false);
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => subscribeToUpdate(setUpdate), []);

  if (update) {
    return (
      <div
        role="status"
        className="fixed inset-x-3 bottom-20 z-[45] flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-surface px-3 py-2.5 shadow-lg backdrop-blur sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm lg:bottom-4"
      >
        <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
          <CloudUpload aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0">A new version of FinTrack is ready.</span>
        </span>
        <button
          type="button"
          onClick={update.apply}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-contrast transition-colors hover:bg-primary-hover"
        >
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          Update
        </button>
      </div>
    );
  }

  if (online || offlineDismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-20 z-[45] flex items-start gap-2.5 rounded-xl border border-warning/50 bg-warning-soft px-3 py-2.5 shadow-lg sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm lg:bottom-4"
    >
      <WifiOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          Offline — your changes are saved on this device and will sync automatically
        </p>
        {pendingCount > 0 && (
          <p className="mt-0.5 text-xs text-muted">
            {pendingCount} change{pendingCount === 1 ? "" : "s"} waiting to be sent.
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss offline notice"
        onClick={() => setOfflineDismissed(true)}
        className="-mr-1.5 -mt-1.5 shrink-0 rounded p-2 text-warning/70 transition-colors hover:bg-warning/10 hover:text-warning"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}

import { useState } from "react";
import { CACHE_CLAIM_ERROR, eraseDeviceData, getLastWipeFailure } from "../../auth/AuthContext";
import { Button } from "../../components/ui/Button";

/**
 * Escape hatch for the one sign-in failure the user can fix themselves: the
 * local cache can't be wiped (locked or corrupt IndexedDB), so sign-in
 * aborts with CACHE_CLAIM_ERROR even though the credentials were accepted.
 * Two taps — the second confirms the destruction of any unsynced changes —
 * then the device is erased and reloaded into a clean sign-in.
 */
export function CacheClaimRecovery({ error }: { error: string | null }) {
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  if (error !== CACHE_CLAIM_ERROR) return null;
  const detail = getLastWipeFailure();
  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface-sunken px-4 py-3">
      <p className="text-sm text-muted">
        {confirming
          ? "This erases everything on this device that hasn't synced yet. Anything already on the server downloads again after you sign in."
          : "Still stuck after closing other tabs? The on-device database itself may be damaged."}
      </p>
      {detail && (
        <div className="rounded-lg bg-surface px-3 py-2">
          <p className="text-xs text-muted">
            Technical detail ({detail.name}): {detail.message || "no message"}
          </p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(`FinTrack wipe failure — ${detail.name}: ${detail.message}`)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
            className="mt-1 text-xs font-medium text-primary hover:underline"
          >
            {copied ? "Copied — paste it to support" : "Copy this error"}
          </button>
        </div>
      )}
      <Button
        type="button"
        variant={confirming ? "danger" : "ghost"}
        size="sm"
        block
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          void eraseDeviceData().catch(() => setFailed(true));
        }}
      >
        {confirming ? "Yes, erase this device and reload" : "Erase this device's data"}
      </Button>
      {failed && (
        <p role="alert" className="text-xs text-expense">
          Couldn&apos;t erase automatically — clear the browser&apos;s site data for FinTrack manually, then reopen it.
        </p>
      )}
    </div>
  );
}

/**
 * Timestamp tracing for sync debugging. Off by default — enable in the dev
 * console with `localStorage.setItem("fintrack_sync_debug", "1")` and watch
 * each mutation's birth moment travel:
 * local created_at → outbox client_timestamp → Neon created_at → pull → Dexie.
 * Never enabled in production builds by default; this is a diagnostic tap.
 */
export function syncDebug(...args: unknown[]): void {
  try {
    if (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("fintrack_sync_debug") === "1"
    ) {
      console.debug("[fintrack:sync]", ...args);
    }
  } catch {
    /* diagnostics must never break sync */
  }
}

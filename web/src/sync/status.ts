import type { SyncState } from "./syncEngine";

export type SyncVisual =
  | "synced"
  | "syncing"
  | "offline"
  | "api-unavailable"
  | "pending"
  | "conflict"
  | "error"
  | "signed-out";

/**
 * Pure connection/sync → display mapping, kept free of React and Dexie so it
 * is unit-testable. Precedence: an in-flight cycle first, then anything that
 * blocks progress (transport, conflicts, queue), then terminal states.
 */
export function syncVisual(
  status: SyncState,
  pendingCount: number,
  conflictCount: number,
): SyncVisual {
  if (status === "syncing") return "syncing";
  if (status === "offline") return "offline";
  if (status === "api-unavailable") return "api-unavailable";
  if (conflictCount > 0) return "conflict";
  if (pendingCount > 0) return "pending";
  if (status === "error") return "error";
  if (status === "signed-out") return "signed-out";
  return "synced";
}

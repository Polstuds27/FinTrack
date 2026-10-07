import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { ownerKey } from "../auth/owner";
import { db } from "../db";
import type { ConflictEntry } from "../db/types";
import { outboxCount, getMeta, setMeta } from "./outbox";
import { runSync, type SyncState } from "./syncEngine";

const BASE_SYNC_INTERVAL_MS = 30_000;
const MAX_SYNC_INTERVAL_MS = 300_000;

/** Persisted so "last synced" survives reloads — React state alone forgets. */
const LAST_SYNC_KEY = "last_sync_at";

interface SyncContextValue {
  status: SyncState;
  pendingCount: number;
  conflicts: ConflictEntry[];
  lastSyncedAt: Date | null;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, email } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SyncState>("idle");
  const [pendingCount, setPendingCount] = useState(0);
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Checkpoints are keyed per account: the same canonical form the owner stamp
  // uses, so a case difference can't silently restart (or mislabel) a cursor.
  const accountKey = email ? ownerKey(email) : "anonymous";

  const runCycle = useCallback(async (): Promise<SyncState> => {
    if (!isAuthenticated) {
      setStatus("signed-out");
      // Signed out is still a state the Sync screen reports on: refresh the
      // numbers so it shows this device's held queue, not a stale snapshot.
      setPendingCount(await outboxCount());
      setConflicts(await db.conflicts.toArray());
      return "signed-out";
    }
    // The indicator's "Syncing…" state never appeared before: no code path
    // ever set it. Emit it here so the UI reflects an in-flight cycle.
    setStatus((current) => (current === "syncing" ? current : "syncing"));
    const next = await runSync(accountKey);
    setStatus(next);
    // Counts refresh on EVERY outcome, not just success: after an offline or
    // failed cycle the queued changes are exactly what the user must see, and
    // a partial push still changed local rows that queries should refetch.
    setPendingCount(await outboxCount());
    setConflicts(await db.conflicts.toArray());
    if (next === "idle") {
      const now = new Date();
      setLastSyncedAt(now);
      // Stored UTC ISO; display localises to Asia/Manila in `formatDateTime`.
      await setMeta(LAST_SYNC_KEY, now.toISOString());
      void queryClient.invalidateQueries();
    } else if (next === "error") {
      void queryClient.invalidateQueries();
    }
    return next;
  }, [accountKey, isAuthenticated, queryClient]);

  const syncNow = useCallback(async () => {
    await runCycle();
  }, [runCycle]);

  // Restored timestamp first: React state forgets across reloads, the meta
  // table doesn't.
  useEffect(() => {
    void getMeta(LAST_SYNC_KEY).then((value) => {
      if (value) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) setLastSyncedAt(parsed);
      }
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setStatus("signed-out");
      return;
    }
    void runCycle();
  }, [isAuthenticated, runCycle]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const onOnline = () => void syncNow();
    // `offline` fires reliably even when `navigator.onLine` is stale, so the
    // indicator flips immediately instead of waiting for the next attempt.
    const onOffline = () => {
      setStatus("offline");
      void outboxCount().then(setPendingCount);
    };
    // Returning to the tab (or the installed PWA) resumes sync without
    // requiring a reload — the interval alone could leave a returning user
    // staring at stale state.
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    // Backoff, not a hammer: consecutive failures double the delay
    // (30s → 60s → 120s → … capped at 5min) and any success resets it. While
    // offline the early return costs nothing; while the API is down this
    // stops the client from pointlessly knocking every 30 seconds.
    let cancelled = false;
    let timer = 0;
    let failures = 0;
    const loop = async () => {
      if (cancelled) return;
      const outcome = await runCycle();
      if (cancelled) return;
      failures = outcome === "idle" ? 0 : failures + 1;
      const delay = Math.min(BASE_SYNC_INTERVAL_MS * 2 ** failures, MAX_SYNC_INTERVAL_MS);
      timer = window.setTimeout(loop, delay);
    };
    timer = window.setTimeout(loop, BASE_SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isAuthenticated, runCycle, syncNow]);

  const value = useMemo(
    () => ({ status, pendingCount, conflicts, lastSyncedAt, syncNow }),
    [status, pendingCount, conflicts, lastSyncedAt, syncNow],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used inside SyncProvider");
  return ctx;
}
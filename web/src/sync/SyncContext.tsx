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
import { outboxCount } from "./outbox";
import { runSync, type SyncState } from "./syncEngine";

const SYNC_INTERVAL_MS = 30_000;

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

  const syncNow = useCallback(async () => {
    if (!isAuthenticated) {
      setStatus("signed-out");
      return;
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
      setLastSyncedAt(new Date());
      void queryClient.invalidateQueries();
    } else if (next === "error") {
      void queryClient.invalidateQueries();
    }
  }, [accountKey, isAuthenticated, queryClient]);

  useEffect(() => {
    if (!isAuthenticated) {
      setStatus("signed-out");
      return;
    }
    void syncNow();
  }, [isAuthenticated, syncNow]);

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
    // requiring a reload — the 30s interval alone could leave a returning user
    // staring at stale state.
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [isAuthenticated, syncNow]);

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
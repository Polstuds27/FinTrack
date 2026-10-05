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
    const next = await runSync(accountKey);
    setStatus(next);
    if (next === "idle") {
      setLastSyncedAt(new Date());
      setPendingCount(await outboxCount());
      setConflicts(await db.conflicts.toArray());
      void queryClient.invalidateQueries();
    }
  }, [accountKey, queryClient]);

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
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    return () => {
      window.removeEventListener("online", onOnline);
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
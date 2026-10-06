import { apiFetch, ApiError, getAccessToken, isOfflineError } from "../api/client";
import { recalcBalances } from "../db/balances";
import { db, tableFor } from "../db";
import type { EntityName, LocalTransaction, OutboxEntry, PushResult, SyncChange } from "../db/types";
import { fromServer, normalizeEntityName } from "./mapping";
import {
  getCheckpoint,
  getClientId,
  MAX_ATTEMPTS,
  pendingMutations,
  setCheckpoint,
} from "./outbox";

export type SyncState = "idle" | "syncing" | "offline" | "signed-out" | "error";

const MAX_PUSH_ROUNDS = 5;
const MAX_PULL_ROUNDS = 10;

let inFlight: Promise<SyncState> | null = null;

async function patchRow(entity: EntityName, id: string, patch: object): Promise<void> {
  await tableFor(entity).update(id, patch as never);
}

async function putRow(entity: EntityName, row: object): Promise<void> {
  await tableFor(entity).put(row as never);
}

function describeError(result: PushResult): string {
  return result.error ? `${result.error.code}: ${result.error.message}` : "Rejected by server";
}

/** Reject permanently only for validation problems; everything else is retried. */
function isPermanent(result: PushResult): boolean {
  return result.error?.code === "invalid" || result.error?.code === "unknown_entity";
}

async function pushRound(clientId: string): Promise<boolean> {
  const batch = await pendingMutations();
  if (batch.length === 0) return false;

  let results: PushResult[];
  try {
    ({ results } = await apiFetch<{ results: PushResult[] }>("/sync/push/", {
      method: "POST",
      body: JSON.stringify({
        client_id: clientId,
        mutations: batch.map((entry: OutboxEntry) => ({
          client_mutation_id: entry.id,
          entity: entry.entity,
          entity_id: entry.entity_id,
          op: entry.op,
          base_version: entry.base_version,
          payload: entry.payload,
          client_timestamp: entry.created_at,
        })),
      }),
    }));
  } catch (error) {
    // The batch never reached the server: nothing is confirmed, nothing is
    // lost. Record the attempt so a permanently unreachable backend parks the
    // entries instead of spinning them forever, then abort the cycle — pulling
    // over a dead connection would only move the cursor past unseen changes.
    // Idempotency keys (`client_mutation_id`) make the eventual retry safe.
    const message = error instanceof Error ? error.message : "Push failed before reaching the server";
    for (const entry of batch) {
      await db.outbox.update(entry.id, {
        status: entry.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending",
        attempts: entry.attempts + 1,
        last_error: message,
      });
    }
    throw error;
  }
  const byId = new Map(results.map((result) => [result.client_mutation_id, result]));

  for (const entry of batch) {
    const result = byId.get(entry.id);
    if (!result) {
      await db.outbox.update(entry.id, {
        status: "pending",
        attempts: entry.attempts + 1,
        last_error: "No result returned for this mutation",
      });
      continue;
    }

    if (result.status === "accepted") {
      const version = result.server_version ?? entry.base_version;
      await patchRow(entry.entity, entry.entity_id, { version, sync_status: "synced" });
      await db.outbox.delete(entry.id);
      if (entry.entity === "transactions") await recalcBalances();
      continue;
    }

    if (result.status === "conflict") {
      await db.outbox.update(entry.id, {
        status: "conflict",
        last_error: describeError(result),
        server_version: result.server_version ?? null,
      });
      await recordConflict(
        entry.entity,
        entry.entity_id,
        entry.op,
        result.server_version ?? entry.base_version,
        null,
        describeError(result),
      );
      continue;
    }

    const permanent = isPermanent(result);
    await db.outbox.update(entry.id, {
      status: permanent ? "failed" : "pending",
      attempts: entry.attempts + 1,
      last_error: describeError(result),
    });
    if (permanent) {
      await patchRow(entry.entity, entry.entity_id, { sync_status: "failed" });
    }
  }
  return true;
}

async function recordConflict(
  entity: EntityName,
  entityId: string,
  op: SyncChange["op"],
  serverVersion: number,
  payload: Record<string, unknown> | null,
  message: string,
): Promise<void> {
  const existing = await db.conflicts.where("entity_id").equals(entityId).first();
  if (existing) {
    await db.conflicts.update(existing.id, {
      server_version: serverVersion,
      payload,
      message,
    });
    return;
  }
  await db.conflicts.add({
    id: crypto.randomUUID(),
    entity,
    entity_id: entityId,
    op,
    server_version: serverVersion,
    payload,
    message,
    created_at: new Date().toISOString(),
  });
}

async function applyChange(change: SyncChange): Promise<void> {
  const entity = normalizeEntityName(change.entity);
  if (!entity) return;
  const existing = (await tableFor(entity).get(change.entity_id)) as LocalTransaction | undefined;

  if (change.op === "delete") {
    if (existing) {
      const deletedAt =
        typeof change.payload?.deleted_at === "string"
          ? change.payload.deleted_at
          : new Date().toISOString();
      await patchRow(entity, change.entity_id, {
        deleted_at: deletedAt,
        version: change.version,
        sync_status: "synced",
        updated_at: new Date().toISOString(),
      });
    }
    if (entity === "transactions") await recalcBalances();
    return;
  }

  if (!change.payload) return;

  const queued = await db.outbox
    .where("entity_id")
    .equals(change.entity_id)
    .filter((entry) => entry.status === "pending" || entry.status === "failed")
    .count();

  if (queued > 0 && existing && change.version > existing.version) {
    // Server moved ahead while this device still has unsynced edits.
    await recordConflict(
      entity,
      change.entity_id,
      change.op,
      change.version,
      change.payload,
      "Server changed this record while you had unsynced edits",
    );
    for (const entry of await db.outbox.where("entity_id").equals(change.entity_id).toArray()) {
      await db.outbox.update(entry.id, {
        status: "conflict",
        server_version: change.version,
        last_error: "Server changed this record while you had unsynced edits",
      });
    }
    return;
  }

  const row = fromServer(entity, change.payload, change.version, null);
  const merged = { ...(existing ?? {}), ...row } as LocalTransaction;
  await putRow(entity, merged);
  if (entity === "transactions") await recalcBalances();
}

async function pullRound(clientId: string, accountKey: string): Promise<boolean> {
  const sinceSeq = await getCheckpoint(accountKey);
  const data = await apiFetch<{ server_seq: number; has_more: boolean; changes: SyncChange[] }>(
    "/sync/pull/",
    { method: "POST", body: JSON.stringify({ client_id: clientId, since_seq: sinceSeq }) },
  );

  for (const change of data.changes) {
    await applyChange(change);
  }
  await setCheckpoint(accountKey, data.server_seq);
  return data.has_more;
}

async function runSyncInternal(accountKey: string): Promise<SyncState> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  if (!getAccessToken()) return "signed-out";

  try {
    const clientId = await getClientId();
    for (let round = 0; round < MAX_PUSH_ROUNDS; round += 1) {
      const pushed = await pushRound(clientId);
      if (!pushed) break;
    }
    for (let round = 0; round < MAX_PULL_ROUNDS; round += 1) {
      const more = await pullRound(clientId, accountKey);
      if (!more) break;
    }
    return "idle";
  } catch (error) {
    // 401 means the session can't proceed — the queue stays intact so signing
    // back in resumes exactly where this left off. Anything that failed below
    // the HTTP layer is OFFLINE (device, DNS, timeout, refused), never a
    // rejection: the changes are unconfirmed, not wrong.
    if (error instanceof ApiError && error.status === 401) return "signed-out";
    if (isOfflineError(error)) return "offline";
    return "error";
  }
}

/** Run a full push+pull cycle. Concurrent calls share the in-flight promise. */
export function runSync(accountKey: string): Promise<SyncState> {
  if (inFlight) return inFlight;
  inFlight = runSyncInternal(accountKey).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Drop the queued mutation for a row and adopt the server version. */
export async function resolveWithServer(conflictId: string): Promise<void> {
  const conflict = await db.conflicts.get(conflictId);
  if (!conflict) return;
  await db.outbox.where("entity_id").equals(conflict.entity_id).delete();
  await db.conflicts.delete(conflictId);

  if (conflict.payload) {
    const row = fromServer(conflict.entity, conflict.payload, conflict.server_version, null);
    await putRow(conflict.entity, row);
  } else {
    await patchRow(conflict.entity, conflict.entity_id, {
      version: conflict.server_version,
      sync_status: "synced",
    });
  }
  await recalcBalances();
}

/** Keep the local edit: rebase it on the server version and queue a retry. */
export async function resolveWithLocal(conflictId: string): Promise<void> {
  const conflict = await db.conflicts.get(conflictId);
  if (!conflict) return;
  const entries = await db.outbox.where("entity_id").equals(conflict.entity_id).toArray();
  for (const entry of entries) {
    await db.outbox.update(entry.id, {
      base_version: conflict.server_version,
      status: "pending",
      last_error: null,
    });
  }
  await patchRow(conflict.entity, conflict.entity_id, { sync_status: "pending" });
  await db.conflicts.delete(conflictId);
}
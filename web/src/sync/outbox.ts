import { signedInOwner } from "../auth/owner";
import { db } from "../db";
import type { EntityName, OutboxEntry } from "../db/types";
import { toServerPayload, type PayloadObject } from "./mapping";

/** Transient failures are retried with backoff; beyond this a mutation is parked. */
export const MAX_ATTEMPTS = 5;

type Json = PayloadObject;

/**
 * The queue belongs to the account that wrote it. IndexedDB is shared by every
 * account that signs in on this profile, so a queued change is only readable,
 * countable and sendable while it is stamped for the one signed in now —
 * leftovers from another account stay put instead of travelling under this
 * session.
 */
function ownedByCurrentAccount(entry: OutboxEntry): boolean {
  const owner = signedInOwner();
  return owner !== null && entry.owner === owner;
}

/** Queue a local change for the server. Coalesces with an unsent entry per row. */
export async function enqueueMutation(
  entity: EntityName,
  entityId: string,
  op: OutboxEntry["op"],
  row: object | null,
  baseVersion: number,
): Promise<void> {
  const owner = signedInOwner();
  const pending = await db.outbox
    .where("entity_id")
    .equals(entityId)
    .filter((entry) => entry.status !== "conflict" && entry.op !== "delete")
    .first();

  if (pending) {
    if (pending.owner && owner && pending.owner !== owner) {
      // Queued by an account that isn't signed in: drop it rather than merge
      // this account's values into someone else's mutation.
      await db.outbox.delete(pending.id);
    } else {
      // Same row already queued: keep the original create/insert and merge the new values.
      const mergedOp = pending.op === "create" ? "create" : op;
      await db.outbox.update(pending.id, {
        op: mergedOp,
        payload: row ? { ...pending.payload, ...toServerPayload(entity, row as Json) } : {},
        status: "pending",
        last_error: null,
        owner: owner ?? pending.owner ?? null,
      });
      return;
    }
  }

  await db.outbox.add({
    id: crypto.randomUUID(),
    entity,
    entity_id: entityId,
    op,
    base_version: baseVersion,
    payload: row ? toServerPayload(entity, row as Json) : {},
    status: "pending",
    attempts: 0,
    last_error: null,
    server_version: null,
    created_at: new Date().toISOString(),
    owner,
  });
}

export async function pendingMutations(limit = 50): Promise<OutboxEntry[]> {
  const entries = await db.outbox
    .filter(
      (entry) =>
        ownedByCurrentAccount(entry) &&
        (entry.status === "pending" ||
          (entry.status === "failed" && entry.attempts < MAX_ATTEMPTS)),
    )
    .sortBy("created_at");
  return entries.slice(0, limit);
}

export async function outboxCount(): Promise<number> {
  return db.outbox.filter(ownedByCurrentAccount).count();
}

/**
 * Every queued row regardless of owner. Signed out, the engine can send
 * nothing — but the rows are still held on the device, and the Sync screen
 * must say so instead of reporting a stale (or zero) "waiting" count.
 */
export async function outboxTotal(): Promise<number> {
  return db.outbox.count();
}

export async function conflictEntries(): Promise<OutboxEntry[]> {
  return db.outbox
    .filter((entry) => ownedByCurrentAccount(entry) && entry.status === "conflict")
    .sortBy("created_at");
}

export async function getMeta(key: string): Promise<string | null> {
  const row = await db.meta.get(key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

/** Stable per-browser identifier so the server can track a pull checkpoint. */
export async function getClientId(): Promise<string> {
  const existing = await getMeta("client_id");
  if (existing) return existing;
  const clientId = `web-${crypto.randomUUID()}`;
  await setMeta("client_id", clientId);
  return clientId;
}

/** Per-account checkpoint: switching users must not reuse the previous cursor. */
export async function getCheckpoint(accountKey: string): Promise<number> {
  return Number((await getMeta(`last_seq:${accountKey}`)) ?? 0);
}

export async function setCheckpoint(accountKey: string, seq: number): Promise<void> {
  await setMeta(`last_seq:${accountKey}`, String(seq));
}
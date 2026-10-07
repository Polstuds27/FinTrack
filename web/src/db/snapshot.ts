import { db, tableFor } from "./index";
import { enqueueMutation } from "../sync/outbox";
import type { EntityName } from "./types";

/**
 * Restore a JSON snapshot (the shape `exportSnapshot` writes) into this
 * device and queue everything for upload, so the server converges on it.
 *
 * Rules, in order of safety:
 * - Rows are matched by id; nothing is ever duplicated.
 * - The local version counter and base_version always come from THIS device's
 *   row, never the file — so a stale backup against a moved-on server becomes
 *   a reviewable conflict, not a silent overwrite.
 * - `created_at` comes from the file when present (the mirror), else now.
 * - Notifications are skipped: REST cache, not synced data.
 * - The `profile` key is deliberately never imported: identity belongs to the
 *   live session, and a file must not overwrite who this device is signed in
 *   as (that would re-open the cross-account mix-up). It is exported so the
 *   snapshot stays a complete backup.
 * - Attribution flows through `enqueueMutation`, so imports land in the
 *   signed-in account's queue like any other local edit.
 */
const SYNCED_ENTITIES: EntityName[] = [
  "accounts",
  "account_groups",
  "categories",
  "tags",
  "transactions",
  "budgets",
  "recurring",
  "installments",
  "debts",
  "savings_goals",
  "exchange_rates",
];

export interface SnapshotPreview {
  perEntity: Array<{ entity: EntityName; fresh: number; overwrite: number }>;
  errors: string[];
  total: number;
}

interface SnapshotFile {
  [key: string]: unknown;
}

function rowsOf(file: SnapshotFile, entity: EntityName): Array<Record<string, unknown>> {
  const value = file[entity];
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null) : [];
}

function rowId(row: Record<string, unknown>): string | null {
  return typeof row.id === "string" && row.id.length > 0 ? row.id : null;
}

/** Count what an import would do, without writing anything. */
export async function previewSnapshotImport(file: SnapshotFile): Promise<SnapshotPreview> {
  const perEntity: SnapshotPreview["perEntity"] = [];
  const errors: string[] = [];
  for (const entity of SYNCED_ENTITIES) {
    if (!(entity in file)) continue;
    if (!Array.isArray(file[entity])) {
      errors.push(`"${entity}" is not a list — skipped.`);
      continue;
    }
    let fresh = 0;
    let overwrite = 0;
    for (const row of rowsOf(file, entity)) {
      const id = rowId(row);
      if (!id) {
        errors.push(`"${entity}" has a row without an id — skipped.`);
        continue;
      }
      const existing = await tableFor(entity).get(id);
      if (existing) overwrite += 1;
      else fresh += 1;
    }
    if (fresh > 0 || overwrite > 0) perEntity.push({ entity, fresh, overwrite });
  }
  return { perEntity, errors, total: perEntity.reduce((sum, e) => sum + e.fresh + e.overwrite, 0) };
}

export interface SnapshotImportResult {
  restored: number;
  queued: number;
  errors: string[];
}

/** Write the snapshot into Dexie and queue every row for upload. */
export async function importSnapshot(file: SnapshotFile): Promise<SnapshotImportResult> {
  const now = new Date().toISOString();
  let restored = 0;
  let queued = 0;
  const errors: string[] = [];

  for (const entity of SYNCED_ENTITIES) {
    if (!(entity in file)) continue;
    if (!Array.isArray(file[entity])) {
      errors.push(`"${entity}" is not a list — skipped.`);
      continue;
    }
    const table = tableFor(entity);
    for (const row of rowsOf(file, entity)) {
      const id = rowId(row);
      if (!id) {
        errors.push(`"${entity}" has a row without an id — skipped.`);
        continue;
      }
      const stamp = typeof row.created_at === "string" ? row.created_at : now;
      const updated = typeof row.updated_at === "string" ? row.updated_at : now;
      const existing = (await table.get(id)) as { version?: unknown } | undefined;
      if (existing) {
        const version = typeof existing.version === "number" ? existing.version : 0;
        await table.put({ ...row, version, sync_status: "pending", created_at: stamp, updated_at: updated } as never);
        const op = row.deleted_at ? "delete" : "update";
        await enqueueMutation(entity, id, op, op === "delete" ? null : row, version);
      } else {
        const version = typeof row.version === "number" ? row.version : 0;
        await table.put({ ...row, version, sync_status: "pending", created_at: stamp, updated_at: updated } as never);
        await enqueueMutation(entity, id, row.deleted_at ? "delete" : "create", row.deleted_at ? null : row, version);
      }
      restored += 1;
      queued += 1;
    }
  }
  await db.meta.put({ key: "last_snapshot_import", value: now });
  return { restored, queued, errors };
}

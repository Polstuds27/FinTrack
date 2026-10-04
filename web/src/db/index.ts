import Dexie, { type EntityTable, type Table } from "dexie";
import type {
  ConflictEntry,
  EntityName,
  LocalAccount,
  LocalAccountGroup,
  LocalAttachment,
  LocalBudget,
  LocalCategory,
  LocalDebt,
  LocalExchangeRate,
  LocalInstallment,
  LocalNotification,
  LocalRecurring,
  LocalRow,
  LocalSavingsGoal,
  LocalTag,
  LocalTransaction,
  MetaEntry,
  OutboxEntry,
} from "./types";

export class FinDB extends Dexie {
  accounts!: EntityTable<LocalAccount, "id">;
  account_groups!: EntityTable<LocalAccountGroup, "id">;
  budgets!: EntityTable<LocalBudget, "id">;
  categories!: EntityTable<LocalCategory, "id">;
  debts!: EntityTable<LocalDebt, "id">;
  exchange_rates!: EntityTable<LocalExchangeRate, "id">;
  installments!: EntityTable<LocalInstallment, "id">;
  recurring!: EntityTable<LocalRecurring, "id">;
  savings_goals!: EntityTable<LocalSavingsGoal, "id">;
  tags!: EntityTable<LocalTag, "id">;
  transactions!: EntityTable<LocalTransaction, "id">;
  attachments!: EntityTable<LocalAttachment, "id">;
  notifications!: EntityTable<LocalNotification, "id">;
  outbox!: EntityTable<OutboxEntry, "id">;
  conflicts!: EntityTable<ConflictEntry, "id">;
  meta!: EntityTable<MetaEntry, "key">;

  constructor() {
    super("fintrack");

    this.version(1).stores({
      accounts: "id, type, sync_status, updated_at",
      categories: "id, type, parent_id, sync_status, updated_at",
      transactions: "id, type, from_account_id, to_account_id, category_id, date, sync_status, updated_at",
    });

    this.version(2)
      .stores({
        accounts: "id, type, sync_status, updated_at",
        categories: "id, type, parent_id, sync_status, updated_at",
        transactions: "id, type, from_account_id, to_account_id, category_id, date, sync_status, updated_at",
        outbox: "id, entity, entity_id, status, created_at",
        conflicts: "id, entity, entity_id, created_at",
        meta: "key",
      })
      .upgrade(async (tx) => {
        // Rows written by the phase-4 stub were never pushed to the server,
        // so queue them for sync instead of pretending they are current.
        const names = ["accounts", "categories", "transactions"] as const;
        for (const name of names) {
          const rows = await tx.table(name).toArray();
          for (const row of rows) {
            row.sync_status = "pending";
            await tx.table(name).put(row);
            await tx
              .table("outbox")
              .put({
                id: crypto.randomUUID(),
                entity: name,
                entity_id: row.id,
                op: "create",
                base_version: 0,
                payload: { ...row },
                status: "pending",
                attempts: 0,
                last_error: null,
                server_version: null,
                created_at: new Date().toISOString(),
              });
          }
        }
      });

    /**
     * v3 adds every planning/multi-currency table so the UI renders fully from
     * IndexedDB, plus the two REST-only caches (attachments, notifications).
     * Existing rows keep their ids; new columns are filled by the sync engine on
     * the next pull, so nothing here needs backfilling.
     */
    this.version(3)
      .stores({
        accounts: "id, group_id, type, archived, sync_status, updated_at",
        account_groups: "id, sync_status, updated_at",
        budgets: "id, category_id, period, start_date, sync_status, updated_at",
        categories: "id, type, parent_id, sync_status, updated_at",
        debts: "id, direction, due_date, sync_status, updated_at",
        exchange_rates: "id, base_currency, quote_currency, date, [base_currency+quote_currency]",
        installments: "id, from_account_id, category_id, start_date, sync_status, updated_at",
        recurring: "id, type, from_account_id, to_account_id, category_id, next_run_at, enabled, sync_status, updated_at",
        savings_goals: "id, linked_account_id, target_date, sync_status, updated_at",
        tags: "id, sync_status, updated_at",
        transactions: "id, type, from_account_id, to_account_id, category_id, recurring_id, installment_id, date, is_bookmarked, sync_status, updated_at",
        attachments: "id, transaction_id, upload_state, created_at",
        notifications: "id, is_read, created_at",
        outbox: "id, entity, entity_id, status, created_at",
        conflicts: "id, entity, entity_id, created_at",
        meta: "key",
      })
      .upgrade(async (tx) => {
        const stamps = {
          group_id: null,
          statement_day: null,
          due_day: null,
        };
        await tx
          .table("accounts")
          .toCollection()
          .modify((account: Record<string, unknown>) => Object.assign(account, stamps));
        // Transactions gain two optional back-references plus their tag array.
        await tx
          .table("transactions")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (!Array.isArray(row.tag_ids)) row.tag_ids = [];
            if (row.recurring_id === undefined) row.recurring_id = null;
            if (row.installment_id === undefined) row.installment_id = null;
          });
      });
  }
}

export const db = new FinDB();

export type LocalTable = Table<LocalRow, string>;

/** Maps a plural table name to its Dexie table. */
export function tableFor(entity: EntityName): LocalTable {
  switch (entity) {
    case "accounts":
      return db.accounts as LocalTable;
    case "account_groups":
      return db.account_groups as LocalTable;
    case "budgets":
      return db.budgets as LocalTable;
    case "categories":
      return db.categories as LocalTable;
    case "debts":
      return db.debts as LocalTable;
    case "exchange_rates":
      return db.exchange_rates as LocalTable;
    case "installments":
      return db.installments as LocalTable;
    case "recurring":
      return db.recurring as LocalTable;
    case "savings_goals":
      return db.savings_goals as LocalTable;
    case "tags":
      return db.tags as LocalTable;
    case "transactions":
      return db.transactions as LocalTable;
  }
}

/** True for entities that travel through the sync protocol. */
export function isSyncedEntity(entity: string): entity is EntityName {
  return entity in ENTITY_TABLES;
}

const ENTITY_TABLES: Record<string, true> = {
  accounts: true,
  account_groups: true,
  budgets: true,
  categories: true,
  debts: true,
  exchange_rates: true,
  installments: true,
  recurring: true,
  savings_goals: true,
  tags: true,
  transactions: true,
};

/** Wipes user data. Used by sign-out and by full JSON restore. */
export async function clearAllData(): Promise<void> {
  const tables = [
    db.accounts,
    db.account_groups,
    db.budgets,
    db.categories,
    db.debts,
    db.exchange_rates,
    db.installments,
    db.recurring,
    db.savings_goals,
    db.tags,
    db.transactions,
    db.attachments,
    db.notifications,
    db.outbox,
    db.conflicts,
  ];
  await db.transaction("rw", tables, async () => {
    for (const table of tables) await table.clear();
    // `meta` keeps only the client id; checkpoints are per-user and must reset.
    const stale = await db.meta.where("key").startsWith("last_seq:").primaryKeys();
    await db.meta.bulkDelete(stale);
  });
}

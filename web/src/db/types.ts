export type SyncStatus = "synced" | "pending" | "failed";

/**
 * Plural table/entity names, matching the server sync entity aliases
 * (`ENTITY_ALIASES` in api/apps/sync/views.py).
 */
export type EntityName =
  | "accounts"
  | "account_groups"
  | "budgets"
  | "categories"
  | "debts"
  | "exchange_rates"
  | "installments"
  | "recurring"
  | "savings_goals"
  | "tags"
  | "transactions";

/** Fields every synced row carries. */
interface SyncFields {
  version: number;
  deleted_at: string | null;
  sync_status: SyncStatus;
  updated_at: string;
}

export interface LocalAccount extends SyncFields {
  id: string;
  group_id: string | null;
  name: string;
  type: string;
  currency: string;
  opening_balance: number;
  /** Server-derived cache; `recalcBalances()` keeps it honest offline. */
  current_balance: number;
  credit_limit: number | null;
  statement_day: number | null;
  due_day: number | null;
  archived: boolean;
}

export interface LocalAccountGroup extends SyncFields {
  id: string;
  name: string;
}

export interface LocalCategory extends SyncFields {
  id: string;
  name: string;
  parent_id: string | null;
  type: "income" | "expense";
  icon: string | null;
  color: string | null;
  is_custom: boolean;
}

export interface LocalTag extends SyncFields {
  id: string;
  name: string;
}

export interface LocalTransaction extends SyncFields {
  id: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  currency: string;
  fx_rate: number;
  from_account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  date: string;
  notes: string;
  is_bookmarked: boolean;
  tag_ids: string[];
  recurring_id: string | null;
  installment_id: string | null;
  /** Ledger entry also acts as a goal contribution. */
  savings_goal_id: string | null;
  /** Ledger entry also acts as a debt payment. */
  debt_id: string | null;
}

export interface LocalBudget extends SyncFields {
  id: string;
  category_id: string | null;
  amount: number;
  period: "weekly" | "monthly" | "yearly";
  start_date: string;
  /** Percentage of the budget that triggers a notification. */
  alert_threshold: number;
}

export interface LocalRecurring extends SyncFields {
  id: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  currency: string;
  from_account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  next_run_at: string;
  last_run_at: string | null;
  end_at: string | null;
  enabled: boolean;
  notes: string;
}

export interface LocalInstallment extends SyncFields {
  id: string;
  total_amount: number;
  parts_count: number;
  currency: string;
  from_account_id: string | null;
  category_id: string | null;
  start_date: string;
  frequency: "weekly" | "monthly" | "quarterly";
  notes: string;
}

export interface LocalDebt extends SyncFields {
  id: string;
  counterparty: string;
  direction: "owed_to_me" | "i_owe";
  original_amount: number;
  remaining_amount: number;
  currency: string;
  due_date: string | null;
  notes: string;
}

export interface LocalSavingsGoal extends SyncFields {
  id: string;
  name: string;
  target_amount: number;
  currency: string;
  target_date: string | null;
  linked_account_id: string | null;
}

export interface LocalExchangeRate extends SyncFields {
  id: string;
  base_currency: string;
  quote_currency: string;
  rate: number;
  date: string;
  source: string;
}

/**
 * Receipt metadata. Deliberately *not* part of the sync protocol: binary uploads
 * go through `POST /api/v1/attachments/upload/` (Cloudinary), which cannot be
 * represented as a JSON mutation. Rows are cached locally for offline viewing
 * and pushed by the REST client when connectivity allows.
 */
export interface LocalAttachment {
  id: string;
  transaction_id: string | null;
  file_name: string;
  content_type: string;
  size_bytes: number;
  /**
   * Cached bytes so receipts open offline. `blob:` URLs are not valid across page
   * loads, so the Blob itself is stored and a URL is minted on demand.
   */
  blob: Blob | null;
  remote_url: string | null;
  public_id: string | null;
  created_at: string;
  deleted_at: string | null;
  /** `queued` means the bytes still need uploading. */
  upload_state: "queued" | "uploaded" | "failed";
  upload_error: string | null;
}

/** Cached notification. Fetched over REST (not synced) and stored for offline reading. */
export interface LocalNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  level: "info" | "warning" | "critical";
  is_read: boolean;
  created_at: string;
}

export type LocalRow =
  | LocalAccount
  | LocalAccountGroup
  | LocalBudget
  | LocalCategory
  | LocalDebt
  | LocalExchangeRate
  | LocalInstallment
  | LocalRecurring
  | LocalSavingsGoal
  | LocalTag
  | LocalTransaction;

export type OutboxStatus = "pending" | "failed" | "conflict";

export interface ConflictEntry {
  id: string;
  entity: EntityName;
  entity_id: string;
  op: SyncChange["op"];
  server_version: number;
  payload: Record<string, unknown> | null;
  message: string;
  created_at: string;
}

export interface OutboxEntry {
  /** Doubles as the `client_mutation_id`, which the server uses for idempotency. */
  id: string;
  entity: EntityName;
  entity_id: string;
  op: "create" | "update" | "delete";
  base_version: number;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  last_error: string | null;
  server_version: number | null;
  created_at: string;
  /**
   * Account that queued this change (`ownerKey()` form). IndexedDB is shared by
   * every account that signs in here, so an unlabelled queue is exactly how one
   * account's edits get pushed under another's session. Absent only on entries
   * written before this field existed; those are stamped when the cache is
   * claimed.
   */
  owner?: string | null;
}

export interface MetaEntry {
  key: string;
  value: string;
}

export interface SyncChange {
  seq: number;
  entity: string;
  entity_id: string;
  version: number;
  op: "create" | "update" | "delete" | "balance";
  payload: Record<string, unknown> | null;
}

export interface PushResult {
  client_mutation_id: string;
  status: "accepted" | "conflict" | "rejected";
  server_version?: number | null;
  error?: { code: string; message: string };
}

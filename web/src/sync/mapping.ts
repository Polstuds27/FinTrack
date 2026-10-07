import type {
  EntityName,
  LocalAccount,
  LocalAccountGroup,
  LocalBudget,
  LocalCategory,
  LocalDebt,
  LocalExchangeRate,
  LocalInstallment,
  LocalRecurring,
  LocalRow,
  LocalSavingsGoal,
  LocalTag,
  LocalTransaction,
} from "../db/types";

type Json = Record<string, unknown>;

export type PayloadObject = Record<string, unknown>;

const num = (value: unknown, fallback = 0): number => {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined || value === "" ? null : num(value);

const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const strOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const bool = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

const strList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/**
 * Local rows use `<fk>_id` keys, the server uses `<fk>`. Sending uses local keys
 * (the server normalizes both), receiving needs an explicit mapping.
 */
export function fromServer(
  entity: EntityName,
  payload: Json,
  version: number,
  deletedAt: string | null,
): LocalRow {
  const updated = str(payload.updated_at, new Date().toISOString());
  const base = { version, deleted_at: deletedAt, sync_status: "synced" as const, updated_at: updated };

  switch (entity) {
    case "accounts":
      return {
        ...base,
        id: str(payload.id),
        group_id: strOrNull(payload.group),
        name: str(payload.name),
        type: str(payload.type, "cash"),
        currency: str(payload.currency, "USD"),
        opening_balance: num(payload.opening_balance),
        current_balance: num(payload.current_balance),
        credit_limit: numOrNull(payload.credit_limit),
        statement_day: numOrNull(payload.statement_day),
        due_day: numOrNull(payload.due_day),
        archived: bool(payload.archived),
      } satisfies LocalAccount;

    case "account_groups":
      return {
        ...base,
        id: str(payload.id),
        name: str(payload.name),
      } satisfies LocalAccountGroup;

    case "categories":
      return {
        ...base,
        id: str(payload.id),
        name: str(payload.name),
        parent_id: strOrNull(payload.parent),
        type: payload.type === "income" ? "income" : "expense",
        icon: strOrNull(payload.icon),
        color: strOrNull(payload.color),
        is_custom: bool(payload.is_custom, true),
      } satisfies LocalCategory;

    case "tags":
      return { ...base, id: str(payload.id), name: str(payload.name) } satisfies LocalTag;

    case "transactions":
      return {
        ...base,
        id: str(payload.id),
        type: payload.type === "income" || payload.type === "transfer" ? payload.type : "expense",
        amount: num(payload.amount),
        currency: str(payload.currency, "USD"),
        fx_rate: num(payload.fx_rate, 1),
        from_account_id: strOrNull(payload.from_account),
        to_account_id: strOrNull(payload.to_account),
        category_id: strOrNull(payload.category),
        date: str(payload.date, updated),
        notes: str(payload.notes),
        is_bookmarked: bool(payload.is_bookmarked),
        tag_ids: strList(payload.tags),
        recurring_id: strOrNull(payload.recurring),
        installment_id: strOrNull(payload.installment),
        savings_goal_id: strOrNull(payload.savings_goal),
        debt_id: strOrNull(payload.debt),
      } satisfies LocalTransaction;

    case "budgets":
      return {
        ...base,
        id: str(payload.id),
        category_id: strOrNull(payload.category),
        amount: num(payload.amount),
        period: normalizePeriod(payload.period),
        start_date: str(payload.start_date).slice(0, 10),
        alert_threshold: num(payload.alert_threshold, 80),
      } satisfies LocalBudget;

    case "recurring":
      return {
        ...base,
        id: str(payload.id),
        type: payload.type === "income" || payload.type === "transfer" ? payload.type : "expense",
        amount: num(payload.amount),
        currency: str(payload.currency, "USD"),
        from_account_id: strOrNull(payload.from_account),
        to_account_id: strOrNull(payload.to_account),
        category_id: strOrNull(payload.category),
        frequency: normalizeFrequency(payload.frequency, ["daily", "weekly", "monthly", "yearly"]),
        next_run_at: str(payload.next_run_at, updated),
        last_run_at: strOrNull(payload.last_run_at),
        end_at: strOrNull(payload.end_at),
        enabled: bool(payload.enabled, true),
        notes: str(payload.notes),
      } satisfies LocalRecurring;

    case "installments":
      return {
        ...base,
        id: str(payload.id),
        total_amount: num(payload.total_amount),
        parts_count: num(payload.parts_count, 1),
        currency: str(payload.currency, "USD"),
        from_account_id: strOrNull(payload.from_account),
        category_id: strOrNull(payload.category),
        start_date: str(payload.start_date).slice(0, 10),
        frequency: normalizeFrequency(payload.frequency, ["weekly", "monthly", "quarterly"]),
        notes: str(payload.notes),
      } satisfies LocalInstallment;

    case "debts":
      return {
        ...base,
        id: str(payload.id),
        counterparty: str(payload.counterparty),
        direction: payload.direction === "owed_to_me" ? "owed_to_me" : "i_owe",
        original_amount: num(payload.original_amount),
        remaining_amount: num(payload.remaining_amount),
        currency: str(payload.currency, "USD"),
        due_date: strOrNull(payload.due_date)?.slice(0, 10) ?? null,
        notes: str(payload.notes),
      } satisfies LocalDebt;

    case "savings_goals":
      return {
        ...base,
        id: str(payload.id),
        name: str(payload.name),
        target_amount: num(payload.target_amount),
        currency: str(payload.currency, "USD"),
        target_date: strOrNull(payload.target_date)?.slice(0, 10) ?? null,
        linked_account_id: strOrNull(payload.linked_account),
      } satisfies LocalSavingsGoal;

    case "exchange_rates":
      return {
        ...base,
        id: str(payload.id),
        base_currency: str(payload.base_currency, "USD").toUpperCase(),
        quote_currency: str(payload.quote_currency, "USD").toUpperCase(),
        rate: num(payload.rate, 1),
        date: str(payload.date).slice(0, 10),
        source: str(payload.source),
      } satisfies LocalExchangeRate;
  }
}

function normalizePeriod(value: unknown): LocalBudget["period"] {
  return value === "weekly" || value === "yearly" ? value : "monthly";
}

function normalizeFrequency<T extends string>(value: unknown, allowed: readonly T[]): T {
  return allowed.includes(value as T) ? (value as T) : (allowed[allowed.length - 1] as T);
}

/**
 * Field list per entity, sent verbatim to `POST /sync/push/`. Keyed by the *local*
 * field name; the server accepts the same names (its `FK_FIELDS` map only rewrites
 * the REST-style spellings).
 */
const PAYLOAD_FIELDS: Record<EntityName, string[]> = {
  accounts: [
    "name",
    "type",
    "currency",
    "opening_balance",
    "credit_limit",
    "statement_day",
    "due_day",
    "archived",
    "group_id",
  ],
  account_groups: ["name"],
  budgets: ["category_id", "amount", "period", "start_date", "alert_threshold"],
  categories: ["name", "parent_id", "type", "icon", "color", "is_custom"],
  debts: ["counterparty", "direction", "original_amount", "remaining_amount", "currency", "due_date", "notes"],
  exchange_rates: ["base_currency", "quote_currency", "rate", "date", "source"],
  installments: ["total_amount", "parts_count", "currency", "from_account_id", "category_id", "start_date", "frequency", "notes"],
  recurring: [
    "type",
    "amount",
    "currency",
    "from_account_id",
    "to_account_id",
    "category_id",
    "frequency",
    "next_run_at",
    "end_at",
    "enabled",
    "notes",
  ],
  savings_goals: ["name", "target_amount", "currency", "target_date", "linked_account_id"],
  tags: ["name"],
  transactions: [
    "type",
    "amount",
    "currency",
    "fx_rate",
    "from_account_id",
    "to_account_id",
    "category_id",
    "date",
    "notes",
    "is_bookmarked",
    "recurring_id",
    "installment_id",
    "savings_goal_id",
    "debt_id",
    // Sent under the server's many-to-many name.
    "tag_ids:tags",
  ],
};

export function toServerPayload(entity: EntityName, row: Record<string, unknown>): Json {
  const payload: Json = {};
  for (const spec of PAYLOAD_FIELDS[entity]) {
    const rename = spec.includes(":");
    const [field, target = field] = rename ? spec.split(":") : [spec];
    const value = row[field];
    if (value === undefined) continue;
    // Only foreign keys and explicit nullable columns may send null; the server
    // drops nulls for NOT NULL fields anyway, so skipping is equivalent and safer.
    if (value === null && !field.endsWith("_id")) continue;
    payload[target] = value;
  }
  return payload;
}

/** Server entity name -> local table name. Mirrors `ENTITY_ALIASES` on the server. */
const SERVER_TO_LOCAL: Record<string, EntityName> = {
  account: "accounts",
  account_group: "account_groups",
  budget: "budgets",
  category: "categories",
  debt: "debts",
  exchange_rate: "exchange_rates",
  installment: "installments",
  recurring: "recurring",
  savings_goal: "savings_goals",
  tag: "tags",
  transaction: "transactions",
};

/**
 * Accepts either spelling (plural table name or singular server name) so the sync
 * engine can normalise `changes[].entity` without guessing.
 */
export function normalizeEntityName(name: string): EntityName | null {
  const lower = name.toLowerCase();
  if (lower in SERVER_TO_LOCAL) return SERVER_TO_LOCAL[lower];
  // `recurrings` is accepted by the server as an alias; normalise it to the table.
  if (lower === "recurrings" || lower === "recurring_rules") return "recurring";
  if (lower === "savings_goal") return "savings_goals";
  // Plural table names are accepted as-is (the docstring promises either
  // spelling, and a future server change echoing table names must not
  // silently drop changes on the floor).
  const tables = new Set<string>(Object.values(SERVER_TO_LOCAL));
  if (tables.has(lower)) return lower as EntityName;
  return null;
}

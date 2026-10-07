import { describe, expect, it } from "vitest";
import { fromServer, normalizeEntityName, toServerPayload } from "./mapping";

describe("toServerPayload", () => {
  it("renames the local tag list to the server many-to-many name", () => {
    expect(toServerPayload("transactions", { tag_ids: ["a", "b"] })).toEqual({ tags: ["a", "b"] });
  });

  it("skips absent values but keeps explicit foreign-key nulls", () => {
    const payload = toServerPayload("transactions", {
      amount: 100,
      category_id: null,
      notes: undefined,
      fx_rate: 1,
    });
    expect(payload).toMatchObject({ amount: 100, category_id: null });
    expect(payload).not.toHaveProperty("notes");
  });

  it("drops nulls for non-key columns the server would reject", () => {
    expect(toServerPayload("accounts", { name: "Cash", credit_limit: null })).toEqual({
      name: "Cash",
    });
  });

  it("sends the whitelisted fields per entity", () => {
    expect(
      toServerPayload("accounts", {
        name: "GoTyme",
        type: "bank",
        currency: "PHP",
        opening_balance: 0,
        current_balance: 999,
        version: 3,
        sync_status: "pending",
      }),
    ).toEqual({ name: "GoTyme", type: "bank", currency: "PHP", opening_balance: 0 });
  });
});

describe("fromServer", () => {
  it("maps REST-style foreign keys onto local id fields and tags", () => {
    const row = fromServer(
      "transactions",
      {
        id: "tx-1",
        type: "expense",
        amount: "970.50",
        currency: "PHP",
        from_account: "acct-1",
        to_account: null,
        category: null,
        tags: ["tag-1"],
      },
      4,
      null,
    );
    expect(row).toMatchObject({
      id: "tx-1",
      version: 4,
      sync_status: "synced",
      from_account_id: "acct-1",
      tag_ids: ["tag-1"],
    });
  });

  it("falls back safely on unknown enum values", () => {
    const row = fromServer("transactions", { id: "tx-2", type: "weird" }, 1, null);
    expect((row as { type: string }).type).toBe("expense");
  });
});

describe("normalizeEntityName", () => {
  it("accepts singular, plural, and legacy spellings", () => {
    expect(normalizeEntityName("transaction")).toBe("transactions");
    expect(normalizeEntityName("transactions")).toBe("transactions");
    expect(normalizeEntityName("recurrings")).toBe("recurring");
    expect(normalizeEntityName("savings_goal")).toBe("savings_goals");
  });

  it("rejects unknown entities instead of guessing a table", () => {
    expect(normalizeEntityName("attachments")).toBeNull();
  });
});

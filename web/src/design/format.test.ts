import { describe, expect, it } from "vitest";
import {
  addDays,
  byCreatedDesc,
  byTxNewest,
  formatDate,
  formatRelativeDay,
  todayKey,
  toDateKey,
} from "./format";

describe("formatRelativeDay", () => {
  it("names today, yesterday, and tomorrow correctly", () => {
    const now = new Date();
    expect(formatRelativeDay(now, now)).toBe("Today");
    expect(formatRelativeDay(addDays(now, -1), now)).toBe("Yesterday");
    expect(formatRelativeDay(addDays(now, 1), now)).toBe("Tomorrow");
  });

  it("renders other days as bare month/day, never a weekday", () => {
    const now = new Date();
    const label = formatRelativeDay(addDays(now, -3), now);
    expect(label).not.toMatch(/Today|Yesterday|Tomorrow/);
    expect(label).not.toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
    // Same delegation as the short date format (year only across years).
    const fixed = addDays(now, -3);
    expect(label).toBe(
      formatDate(fixed, fixed.getFullYear() === now.getFullYear() ? "short" : "medium"),
    );
  });

  it("agrees with the calendar day of ISO instants", () => {
    expect(toDateKey("2026-10-07T04:00:00.000Z")).toBe(toDateKey(new Date()));
    expect(todayKey()).toBe(toDateKey(new Date()));
  });
});

describe("ledger ordering", () => {
  it("sorts newest creation first across timezone offsets", () => {
    const rows = [
      { created_at: "2026-10-06T23:30:00+08:00" }, // 15:30Z
      { created_at: "2026-10-06T16:00:00Z" }, // later instant, earlier string
      { created_at: "2026-10-05T00:00:00Z" },
    ];
    expect([...rows].sort(byCreatedDesc).map((r) => r.created_at)).toEqual([
      "2026-10-06T16:00:00Z",
      "2026-10-06T23:30:00+08:00",
      "2026-10-05T00:00:00Z",
    ]);
  });

  it("orders by business instant, breaking same-day ties by creation", () => {
    const rows = [
      { date: "2026-10-07T04:00:00.000Z", created_at: "2026-10-07T04:00:00.000Z" },
      { date: "2026-10-07T04:00:00.000Z", created_at: "2026-10-07T05:00:00.000Z" },
      { date: "2026-10-06T04:00:00.000Z", created_at: "2026-10-07T06:00:00.000Z" },
    ];
    const ordered = [...rows].sort(byTxNewest);
    expect(ordered[0].created_at).toBe("2026-10-07T05:00:00.000Z");
    expect(ordered[1].created_at).toBe("2026-10-07T04:00:00.000Z");
    expect(ordered[2].date).toBe("2026-10-06T04:00:00.000Z");
  });
});

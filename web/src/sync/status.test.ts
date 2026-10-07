import { describe, expect, it } from "vitest";
import { syncVisual } from "./status";

describe("syncVisual", () => {
  it("reports an in-flight cycle before anything else", () => {
    expect(syncVisual("syncing", 5, 2)).toBe("syncing");
  });

  it("distinguishes device-offline from server-unreachable", () => {
    expect(syncVisual("offline", 0, 0)).toBe("offline");
    expect(syncVisual("api-unavailable", 0, 0)).toBe("api-unavailable");
    expect(syncVisual("api-unavailable", 3, 0)).toBe("api-unavailable");
  });

  it("surfaces conflicts ahead of the queue count", () => {
    expect(syncVisual("idle", 4, 1)).toBe("conflict");
  });

  it("shows unsynced work while online-but-behind", () => {
    expect(syncVisual("idle", 2, 0)).toBe("pending");
  });

  it("reports failures and expired sessions distinctly", () => {
    expect(syncVisual("error", 0, 0)).toBe("error");
    expect(syncVisual("signed-out", 0, 0)).toBe("signed-out");
  });

  it("is synced only with nothing outstanding", () => {
    expect(syncVisual("idle", 0, 0)).toBe("synced");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiFetch transport failures", () => {
  it("normalises a dropped connection to ApiError(0) — unconfirmed, never rejected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const failure = await apiFetch("/sync/push/", { method: "POST", body: "{}" }).catch((e) => e);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(0);
  });

  it("surfaces server rejections with their HTTP status intact", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(400, { amount: ["Nope."] })));
    const failure = await apiFetch("/sync/push/", { method: "POST", body: "{}" }).catch((e) => e);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(400);
    expect((failure as ApiError).message).toBe("Nope.");
  });

  it("retries once after a successful rotation, then stops", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: "expired" }))
      .mockResolvedValueOnce(jsonResponse(200, { access: "new-access", refresh: "new-refresh" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("fintrack_access", "old-access");
    localStorage.setItem("fintrack_refresh", "old-refresh");

    const body = await apiFetch<{ ok: boolean }>("/sync/pull/", { method: "POST", body: "{}" });
    expect(body).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(localStorage.getItem("fintrack_access")).toBe("new-access");
    expect(localStorage.getItem("fintrack_refresh")).toBe("new-refresh");
  });

  it("does not retry when rotation itself fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: "expired" }))
      .mockResolvedValueOnce(jsonResponse(401, { detail: "blacklisted" }));
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("fintrack_access", "old-access");
    localStorage.setItem("fintrack_refresh", "old-refresh");

    const failure = await apiFetch("/sync/pull/", { method: "POST", body: "{}" }).catch((e) => e);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

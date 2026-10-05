export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";

const ACCESS_KEY = "fintrack_access";
const REFRESH_KEY = "fintrack_refresh";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function storeTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

/** Trade the refresh token for a new access token. Returns false when expired. */
export async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { access?: string; refresh?: string };
    if (!data.access) return false;
    localStorage.setItem(ACCESS_KEY, data.access);
    if (data.refresh) localStorage.setItem(REFRESH_KEY, data.refresh);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pull a usable message out of a DRF error body.
 *
 * The shape varies by error type *and* by DRF version: `detail` is sometimes a
 * string (`"mfa_required"`), sometimes a list (`["mfa_required"]`), and is
 * absent altogether when the failure is field-level
 * (`{"otp": ["Invalid or expired code."]}`). Reading only the string form used
 * to hide every server message behind `Request failed (400)` — which is exactly
 * how the two-factor challenge became unreachable and sign-in dead-ended.
 */
function readErrorMessage(body: unknown): string {
  const asText = (value: unknown): string => {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) {
      return value.map((item) => (typeof item === "string" ? item.trim() : "")).find(Boolean) ?? "";
    }
    return "";
  };

  if (body === null || body === undefined) return "";
  if (typeof body !== "object") return typeof body === "string" ? body.trim() : "";

  const record = body as Record<string, unknown>;
  const detail = asText(record.detail);
  if (detail) return detail;

  // Field-level errors carry the message under the offending field name.
  for (const value of Object.values(record)) {
    const message = asText(value);
    if (message) return message;
  }
  return "";
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  allowRetry = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (res.status === 401 && allowRetry && (await refreshAccessToken())) {
    return apiFetch<T>(path, init, false);
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const message = readErrorMessage(await res.json());
      if (message) detail = message;
    } catch {
      /* keep the generic message */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, ApiError, clearTokens, getAccessToken, storeTokens } from "../api/client";
import { clearAllData, db } from "../db";
import { saveProfileCache } from "../db/profile";
import { EMAIL_KEY, LOCAL_OWNER_KEY, localOwner, ownerKey } from "./owner";

export interface UserProfile {
  id?: string;
  email: string;
  first_name: string;
  last_name: string;
  preferred_currency: string;
  is_verified: boolean;
  mfa_enabled: boolean;
  /** Unused single-use backup codes; absent (undefined) when MFA is off. */
  recovery_codes_remaining?: number;
  date_joined?: string;
  last_login?: string | null;
}

/** Display name built from the server's first/last pair. */
export function profileName(profile: UserProfile | null): string {
  if (!profile) return "";
  const combined = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  return combined || profile.email || "";
}

export interface AuthState {
  email: string | null;
  isAuthenticated: boolean;
  /** True once the access token exists but may be stale; verified by `/auth/profile/`. */
  profile: UserProfile | null;
  /**
   * Sign in. When the account has two-factor enabled the server answers
   * `mfa_required`; the caller must retry with `otp`.
   */
  login: (email: string, password: string, otp?: string) => Promise<{ mfaRequired: boolean }>;
  logout: () => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (input: ResetInput) => Promise<void>;
  verifyEmail: (uid: string, token: string) => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
  setProfile: (profile: UserProfile) => void;
  /**
   * Drop the stored credentials and treat the session as logged out — without
   * touching IndexedDB. Unlike `logout`, the held queue survives so signing
   * back in resumes it. For a session wedged on an invalid token that can no
   * longer rotate: flushing lets the user reach the sign-in form again.
   */
  flushCredentials: () => void;
}

export interface RegisterInput {
  email: string;
  password: string;
  password_confirm: string;
  full_name: string;
  preferred_currency: string;
}

export interface ResetInput {
  uid: string;
  token: string;
  new_password: string;
  new_password_confirm: string;
}

const AuthContext = createContext<AuthState | null>(null);

/** Shown when the previous account's rows can't be removed before a sign-in. */
export const CACHE_CLAIM_ERROR =
  "Couldn't clear the previous account's data. Close any other FinTrack tabs, then try again.";

/** True when sign-in aborted on an unverifiable local cache (not on credentials). */
export function isCacheClaimError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 500 && error.message === CACHE_CLAIM_ERROR;
}

/**
 * Last-resort recovery for a cache that can no longer be wiped (locked or
 * corrupt IndexedDB): drop the whole database and every stored credential,
 * then reload into a clean sign-in. Unsynced local changes are destroyed —
 * callers must confirm first and say so. Synced data re-downloads on next
 * sign-in.
 */
export async function eraseDeviceData(): Promise<never> {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* storage itself is broken; the reload below is still the way out */
  }
  try {
    // A stuck delete (other tabs holding the database) must not wedge this
    // tab forever — race it, then reload regardless.
    await Promise.race([
      db.delete(),
      new Promise((resolve) => window.setTimeout(resolve, 5000)),
    ]);
  } catch {
    /* fall through to reload */
  }
  window.location.reload();
  // Unreachable in practice; keeps the `never` contract honest for callers.
  await new Promise(() => {});
  throw new Error("eraseDeviceData: reload did not happen");
}

/** The raw wipe failure behind the last CACHE_CLAIM_ERROR, if any. */
interface WipeFailure {
  name: string;
  message: string;
}

let lastWipeFailure: WipeFailure | null = null;

/** Technical detail for the recovery panel — never shown as the headline. */
export function getLastWipeFailure(): WipeFailure | null {
  return lastWipeFailure;
}

function describeFailure(error: unknown): WipeFailure {
  if (error instanceof Error) return { name: error.name || "Error", message: error.message };
  return { name: "Unknown", message: String(error) };
}

const CHECKPOINT_PREFIX = "last_seq:";

/**
 * True when something in the cache still names a different account: a sync
 * checkpoint or a queued change left behind by a wipe that failed earlier.
 * Residue like this is how one account's rows survive a sign-in as another.
 */
async function hasForeignResidue(owner: string): Promise<boolean> {
  try {
    const checkpoints = await db.meta.where("key").startsWith(CHECKPOINT_PREFIX).primaryKeys();
    for (const checkpoint of checkpoints) {
      const account = ownerKey(String(checkpoint).slice(CHECKPOINT_PREFIX.length));
      // `anonymous` is the pre-sign-in cursor, not somebody else's account.
      if (account && account !== "anonymous" && account !== owner) return true;
    }
    const queued = await db.outbox.filter((entry) => Boolean(entry.owner)).toArray();
    return queued.some((entry) => ownerKey(entry.owner) !== owner);
  } catch {
    // The cache can't be inspected, so it can't be vouched for either: report
    // residue so the wipe runs and — should that fail — surfaces as CACHE_ERROR.
    return true;
  }
}

/**
 * IndexedDB holds one account's money data. Signing a *different* account in on
 * the same browser must not leave the previous account's rows on screen (and in
 * the sync outbox), so the owner is stamped next to the cache and a mismatch —
 * or any residue still naming someone else — wipes it before the new account
 * syncs.
 *
 * The stamp is only ever written once the cache is known to be this account's:
 * a failed wipe throws instead of pretending, so callers leave the user signed
 * out rather than attributing foreign rows to them.
 */
async function claimLocalData(nextEmail: string, options?: { repair?: boolean }): Promise<void> {
  const owner = ownerKey(nextEmail);
  if (localOwner() !== owner || (await hasForeignResidue(owner))) {
    try {
      await clearAllData();
    } catch (error) {
      // This point is only reachable with valid credentials — the server
      // already accepted the password and second factor — so a broken wipe
      // must not be a dead end: escalate to deleting the whole database
      // before refusing sign-in. A deleted database holds no rows at all, so
      // the never-attribute-foreign-rows invariant still holds exactly.
      // Only the explicit sign-in path opts in (`repair: true`); the silent
      // boot check never destroys data on its own.
      if (!options?.repair) {
        lastWipeFailure = describeFailure(error);
        console.error("FinTrack: local cache wipe failed", lastWipeFailure);
        throw new ApiError(500, CACHE_CLAIM_ERROR);
      }
      try {
        await Promise.race([
          db.delete(),
          new Promise((resolve) => window.setTimeout(resolve, 8000)),
        ]);
        // Prove the database is usable again before stamping ownership of it.
        await db.open();
        console.warn("FinTrack: cache wipe failed; recovered with a full database reset");
      } catch (repairError) {
        lastWipeFailure = describeFailure(repairError);
        console.error("FinTrack: local cache wipe and repair failed", lastWipeFailure);
        throw new ApiError(500, CACHE_CLAIM_ERROR);
      }
    }
  }
  localStorage.setItem(LOCAL_OWNER_KEY, owner);
  // Entries queued before the queue was labelled belong to whichever account
  // the stamp just confirmed owns this cache — it only reaches here with no
  // foreign residue left, so this is attribution, never adoption.
  try {
    await db.outbox.filter((entry) => !entry.owner).modify({ owner });
  } catch {
    // Relabelling legacy entries is a refinement: on failure they stay
    // unsendable rather than risk going out under the wrong session.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(() => localStorage.getItem(EMAIL_KEY));
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => Boolean(getAccessToken()));

  const refreshProfile = useCallback(async (): Promise<UserProfile | null> => {
    if (!getAccessToken()) return null;
    try {
      const data = await apiFetch<UserProfile>("/auth/profile/");
      setProfile(data);
      // Cache the display identity for offline use. Fire-and-forget: a cache
      // write must never fail a refresh.
      void saveProfileCache({
        first_name: data.first_name ?? "",
        last_name: data.last_name ?? "",
        email: data.email ?? "",
        preferred_currency: data.preferred_currency ?? "",
      }).catch(() => {});
      return data;
    } catch {
      // An expired or revoked session must not block the shell: local data stays
      // readable and the sync indicator explains the rest.
      return null;
    }
  }, []);

  const login = useCallback(
    async (nextEmail: string, password: string, otp?: string): Promise<{ mfaRequired: boolean }> => {
      try {
        const data = await apiFetch<{ access: string; refresh: string }>("/auth/login/", {
          method: "POST",
          body: JSON.stringify(
            otp ? { email: nextEmail, password, otp } : { email: nextEmail, password },
          ),
        });
        // Claim the cache *before* a token exists, with repair: the server
        // already accepted these credentials, so a damaged local database is
        // reset rather than blocking a valid sign-in.
        await claimLocalData(nextEmail, { repair: true });
        storeTokens(data.access, data.refresh);
        localStorage.setItem(EMAIL_KEY, nextEmail);
        setEmail(nextEmail);
        setIsAuthenticated(true);
        void refreshProfile();
        return { mfaRequired: false };
      } catch (error) {
        if (error instanceof Error && error.message === "mfa_required") {
          return { mfaRequired: true };
        }
        throw error;
      }
    },
    [refreshProfile],
  );

  const flushCredentials = useCallback(() => {
    // A dead access token that can no longer rotate wedges the app:
    // `isAuthenticated` stays true, `/login` redirects away, and the queue
    // can never send. Flush the credentials so sign-in is reachable again.
    // Deliberately NOT `logout`: no server call (the token is already
    // useless), no cache wipe — the held queue and the owner stamp stay, so
    // the next sign-in attributes and resumes them instead of clearing them.
    clearTokens();
    localStorage.removeItem(EMAIL_KEY);
    setEmail(null);
    setProfile(null);
    setIsAuthenticated(false);
  }, []);

  const logout = useCallback(async () => {    const refresh = localStorage.getItem("fintrack_refresh");
    if (refresh) {
      try {
        await apiFetch("/auth/logout/", {
          method: "POST",
          body: JSON.stringify({ refresh }),
        });
      } catch {
        // Logging out locally matters more than the server round-trip.
      }
    }
    clearTokens();
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(LOCAL_OWNER_KEY);
    setEmail(null);
    setProfile(null);
    setIsAuthenticated(false);
    try {
      // Sign-out really signs out: the next person at this browser must not
      // find the previous account's balances in IndexedDB.
      await clearAllData();
    } catch (cause) {
      // Local state is already cleared; the next sign-in re-checks the cache
      // and refuses to continue if these rows are still here.
      console.warn("FinTrack: local cache wipe failed on sign-out", cause);
    }
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    await apiFetch("/auth/register/", { method: "POST", body: JSON.stringify(input) });
  }, []);

  const requestPasswordReset = useCallback(async (target: string) => {
    await apiFetch("/auth/password-reset/", {
      method: "POST",
      body: JSON.stringify({ email: target }),
    });
  }, []);

  const resetPassword = useCallback(async (input: ResetInput) => {
    await apiFetch("/auth/password-reset/confirm/", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }, []);

  const verifyEmail = useCallback(async (uid: string, token: string) => {
    await apiFetch("/auth/verify-email/", {
      method: "POST",
      body: JSON.stringify({ uid, token }),
    });
  }, []);

  useEffect(() => {
    if (isAuthenticated) void refreshProfile();
  }, [isAuthenticated, refreshProfile]);

  // A session restored from localStorage may predate the owner stamp, or have
  // had its stamp written by an older build that adopted whatever was here.
  // Rows that can't be attributed are cleared rather than adopted — adopting an
  // unstamped cache is exactly how another account's data came to be claimed by
  // this one.
  useEffect(() => {
    if (!email) return;
    claimLocalData(email).catch((error: unknown) => {
      console.error("FinTrack: could not verify whose cache this is", error);
    });
  }, [email]);

  const value = useMemo(
    () => ({
      email,
      isAuthenticated,
      profile,
      login,
      logout,
      register,
      requestPasswordReset,
      resetPassword,
      verifyEmail,
      refreshProfile,
      setProfile,
      flushCredentials,
    }),
    [
      email,
      isAuthenticated,
      profile,
      login,
      logout,
      flushCredentials,
      register,
      requestPasswordReset,
      resetPassword,
      verifyEmail,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

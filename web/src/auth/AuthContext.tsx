import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, clearTokens, getAccessToken, storeTokens } from "../api/client";
import { clearAllData } from "../db";

export interface UserProfile {
  id?: string;
  email: string;
  first_name: string;
  last_name: string;
  preferred_currency: string;
  is_verified: boolean;
  mfa_enabled: boolean;
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

const EMAIL_KEY = "fintrack_email";
const LOCAL_OWNER_KEY = "fintrack_local_owner";

/**
 * IndexedDB holds one account's money data. Signing a *different* account in on
 * the same browser must not leave the previous account's rows on screen (and in
 * the sync outbox), so the owner is stamped next to the cache and a mismatch
 * wipes it before the new account syncs.
 */
async function claimLocalData(nextEmail: string): Promise<void> {
  const owner = localStorage.getItem(LOCAL_OWNER_KEY);
  // A missing stamp means the cache belongs to a session from before the stamp
  // existed — its owner is unknown, so don't guess: start clean.
  if (owner !== nextEmail) await clearAllData();
  localStorage.setItem(LOCAL_OWNER_KEY, nextEmail);
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
        storeTokens(data.access, data.refresh);
        // Runs before `isAuthenticated` flips so the first sync can only ever
        // see this account's rows.
        try {
          await claimLocalData(nextEmail);
        } catch {
          // A cache wipe that fails must not block sign-in.
        }
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

  const logout = useCallback(async () => {
    const refresh = localStorage.getItem("fintrack_refresh");
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
    } catch {
      // Local state is already cleared; a cache failure changes nothing here.
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

  // A session restored from localStorage may predate the owner stamp: adopt the
  // cached rows for this account so the next sign-in knows whose they are.
  useEffect(() => {
    if (email && !localStorage.getItem(LOCAL_OWNER_KEY)) {
      localStorage.setItem(LOCAL_OWNER_KEY, email);
    }
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
    }),
    [
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
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

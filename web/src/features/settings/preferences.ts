/**
 * Local preferences.
 *
 * These are device-level UI choices, not ledger data, so they live in
 * IndexedDB rather than on the server profile. `preferences` in `meta` is one
 * JSON blob, written through a single setter so every screen reads a consistent
 * snapshot.
 */
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getMeta, setMeta } from "../../sync/outbox";

export type ThemeMode = "light" | "dark" | "system";

export interface Preferences {
  theme: ThemeMode;
  /** Currency every report and total is expressed in. */
  baseCurrency: string;
  /** Day of month the financial month starts on (1-28). */
  monthStartDay: number;
  /** Show amounts with a leading sign, useful on the overview. */
  showCents: boolean;
  /** Rows per page in the transaction list. */
  pageSize: number;
  /** Last used quick-add defaults. */
  lastAccountId: string | null;
  lastCategoryId: string | null;
  /** Hide archived accounts from the Accounts page. */
  showArchived: boolean;
  /** Prompt before destructive actions. */
  confirmDestructive: boolean;
  /**
   * Which notification kinds are shown in the notification centre on this
   * device. Server-side alerting is unaffected — this only filters the list.
   */
  notifyBudgets: boolean;
  notifyDebts: boolean;
  notifyGoals: boolean;
  notifyOther: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  baseCurrency: "USD",
  monthStartDay: 1,
  showCents: true,
  pageSize: 25,
  lastAccountId: null,
  lastCategoryId: null,
  showArchived: false,
  confirmDestructive: true,
  notifyBudgets: true,
  notifyDebts: true,
  notifyGoals: true,
  notifyOther: true,
};

const KEY = "preferences";

interface PreferencesContextValue {
  preferences: Preferences;
  update: (patch: Partial<Preferences>) => Promise<void>;
  ready: boolean;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Resolved theme actually applied to `<html data-theme>`. */
export function resolveTheme(theme: ThemeMode): "light" | "dark" {
  if (theme === "system") return systemPrefersDark() ? "dark" : "light";
  return theme;
}

function applyTheme(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#02060C" : "#F8FAFC");
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getMeta(KEY);
      if (cancelled) return;
      if (stored) {
        try {
          setPreferences({ ...DEFAULT_PREFERENCES, ...(JSON.parse(stored) as Partial<Preferences>) });
        } catch {
          // Corrupt blob: fall back to defaults rather than blocking startup.
        }
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyTheme(preferences.theme);
  }, [preferences.theme]);

  useEffect(() => {
    if (preferences.theme !== "system" || typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [preferences.theme]);

  const update = useCallback(
    async (patch: Partial<Preferences>) => {
      let next: Preferences = DEFAULT_PREFERENCES;
      setPreferences((current) => {
        next = { ...current, ...patch };
        return next;
      });
      await setMeta(KEY, JSON.stringify(next));
    },
    [],
  );

  const value = useMemo(() => ({ preferences, update, ready }), [preferences, update, ready]);
  return createElement(PreferencesContext.Provider, { value }, children);
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used inside PreferencesProvider");
  return ctx;
}

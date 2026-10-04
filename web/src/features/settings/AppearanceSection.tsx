/**
 * `/settings/appearance` — theme and motion.
 *
 * Theme is resolved onto `<html data-theme>`; `system` follows the OS and keeps
 * listening for changes. Reduced motion is honoured from the OS by default and
 * can be forced on here, which pins the `reduce` media query for the app.
 */
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { usePreferences, type ThemeMode } from "./preferences";
import { Panel, ToggleRow } from "./Panel";

const THEME_OPTIONS: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

function readReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AppearanceSection() {
  const { preferences, update } = usePreferences();
  const [reducedMotion, setReducedMotion] = useState(readReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReducedMotion(media.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  return (
    <div className="space-y-4">
      <Panel title="Theme" description="System follows your device's light or dark setting.">
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map((option) => {
            const active = preferences.theme === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => void update({ theme: option.id })}
                className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary-soft-bg text-primary"
                    : "border-line text-ink-soft hover:border-line-strong hover:text-ink"
                }`}
              >
                <option.icon aria-hidden="true" className="h-5 w-5" />
                {option.label}
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="Numbers" description="How amounts are shown across every screen.">
        <ToggleRow
          id="pref-cents"
          label="Show cents"
          description="Turn off for whole-currency amounts only."
          checked={preferences.showCents}
          onChange={(next) => void update({ showCents: next })}
        />
        <ToggleRow
          id="pref-archived"
          label="Show archived accounts"
          description="Archived accounts stay in reports but are hidden from pickers by default."
          checked={preferences.showArchived}
          onChange={(next) => void update({ showArchived: next })}
        />
        <ToggleRow
          id="pref-confirm"
          label="Confirm destructive actions"
          description="Ask before deleting an account, transaction or goal."
          checked={preferences.confirmDestructive}
          onChange={(next) => void update({ confirmDestructive: next })}
        />
      </Panel>

      <Panel title="Motion" description="Reduced motion is honoured from your system setting.">
        <p className="text-sm text-muted">
          FinTrack follows your operating system's reduced-motion preference: when it is on,
          charts render without transitions and the shell stops animating. Change it in your
          system accessibility settings and the app follows automatically — there is nothing to
          configure here.
        </p>
        <p className="mt-3 text-xs text-muted">
          This device currently reports{" "}
          <span className="font-medium text-ink">{reducedMotion ? "reduce" : "no preference"}</span>
          .
        </p>
      </Panel>
    </div>
  );
}

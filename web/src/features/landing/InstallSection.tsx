/**
 * "Install FinTrack" — the PWA download section of the landing page.
 *
 * Behaviour is platform-aware: Chromium browsers get the native install prompt
 * (`beforeinstallprompt`, wired in `app/pwa`), iOS Safari has no such API so it
 * gets the Share → Add to Home Screen walkthrough, and everyone else gets the
 * browser-menu steps. Already-installed visitors just see confirmation.
 */
import { useState } from "react";
import { Check, Download, Monitor, Share, Smartphone } from "lucide-react";
import { Button } from "../../components/ui";
import { promptInstall, useInstallState } from "./useInstall";

interface PlatformCopy {
  /** Short label for the visitor's platform. */
  label: string;
  icon: typeof Smartphone;
  steps: string[];
}

const PLATFORM: Record<"ios" | "android" | "desktop", PlatformCopy> = {
  ios: {
    label: "iPhone & iPad — Safari",
    icon: Smartphone,
    steps: [
      "Tap the Share button in the Safari toolbar.",
      'Scroll down and choose "Add to Home Screen".',
      'Tap "Add" — FinTrack appears on your home screen.',
    ],
  },
  android: {
    label: "Android — Chrome",
    icon: Smartphone,
    steps: [
      "Tap the ⋮ menu in the top-right corner.",
      'Choose "Install app" or "Add to Home screen".',
      "Confirm — FinTrack installs like any other app.",
    ],
  },
  desktop: {
    label: "Computer — Chrome, Edge, Brave",
    icon: Monitor,
    steps: [
      "Click the install icon at the right of the address bar.",
      'Or open the ⋮ menu and choose "Install FinTrack".',
      "Launch it from your dock, desktop or start menu.",
    ],
  },
};

export function InstallSection() {
  const { canPrompt, installed, platform } = useInstallState();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const copy = PLATFORM[platform];

  async function install() {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    setDismissed(outcome === "dismissed");
  }

  return (
    <section id="install" className="scroll-mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-app gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_24rem] lg:items-center lg:py-20">
        <div>
          <p className="label">Get the app</p>
          <h2 className="mt-2 text-display text-ink">
            Install FinTrack on your phone
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            FinTrack is a Progressive Web App: it installs straight from the
            browser — no app store, no download page. You get a home-screen
            icon, full-screen windows, offline access and updates that roll out
            the moment we ship them.
          </p>

          <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {[
              "Home-screen icon, opens like a native app",
              "Full-screen — no browser chrome",
              "Works with no connection, syncs later",
              "Updates automatically, no re-download",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-ink-soft">
                <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-income" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-xs text-muted">
            Free, on every platform you own · <copy.icon aria-hidden="true" className="inline h-3.5 w-3.5" />{" "}
            Detected: {copy.label}
          </p>
        </div>

        <div className="card p-5">
          {installed ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-income-soft">
                <Check aria-hidden="true" className="h-6 w-6 text-income" />
              </span>
              <p className="text-sm font-semibold text-ink">FinTrack is installed</p>
              <p className="text-xs leading-relaxed text-muted">
                You already have it on this device — open it from your home
                screen or dock.
              </p>
            </div>
          ) : canPrompt ? (
            <div className="space-y-3">
              <Button
                variant="primary"
                size="lg"
                block
                loading={busy}
                icon={<Download aria-hidden="true" className="h-4 w-4" />}
                onClick={() => void install()}
              >
                Install FinTrack
              </Button>
              {dismissed && (
                <p className="text-center text-xs text-muted">
                  No problem — you can also add it manually:
                </p>
              )}
              <ol className="space-y-2 border-t border-line pt-3">
                {copy.steps.map((step, index) => (
                  <li key={step} className="flex gap-2.5 text-xs leading-relaxed text-muted">
                    <span
                      aria-hidden="true"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-bg text-[11px] font-semibold text-primary"
                    >
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <copy.icon aria-hidden="true" className="h-4 w-4 text-primary" />
                Add it to your home screen
              </div>
              <p className="text-xs text-muted">
                Your browser can't show an install button here, but it only
                takes {copy.steps.length} taps:
              </p>
              <ol className="space-y-2">
                {copy.steps.map((step, index) => (
                  <li key={step} className="flex gap-2.5 text-xs leading-relaxed text-muted">
                    <span
                      aria-hidden="true"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-bg text-[11px] font-semibold text-primary"
                    >
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <p className="flex items-center gap-1.5 border-t border-line pt-3 text-[11px] text-faint">
                <Share aria-hidden="true" className="h-3.5 w-3.5" />
                {platform === "desktop"
                  ? 'Look for "Install FinTrack" or "Install this page as an app".'
                  : "The Share button is the square with an arrow."}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

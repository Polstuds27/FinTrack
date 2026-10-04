/**
 * Service-worker registration, install and update handling.
 *
 * Registered in production only — in dev the Vite server is the source of truth
 * and a cached shell would only get in the way. Update availability is exposed
 * as a tiny observable so the banner can sit anywhere in the tree without
 * threading props through the router.
 */

export interface UpdateHandle {
  /** Activate the waiting worker and reload into the new version. */
  apply: () => void;
}

type Listener = (update: UpdateHandle | null) => void;

let pendingUpdate: UpdateHandle | null = null;
const listeners = new Set<Listener>();

function emit(update: UpdateHandle | null) {
  pendingUpdate = update;
  for (const listener of listeners) listener(update);
}

export function subscribeToUpdate(listener: Listener): () => void {
  listeners.add(listener);
  listener(pendingUpdate);
  return () => listeners.delete(listener);
}

export function getPendingUpdate(): UpdateHandle | null {
  return pendingUpdate;
}

/* ---------------------------------------------------------------- install */

/**
 * The landing page offers a real "Install" action. Chromium surfaces it through
 * `beforeinstallprompt`; iOS Safari has no such API and must be walked through
 * Share → Add to Home Screen instead, so the state carries the platform.
 */
export interface InstallState {
  /** The browser is offering a native install prompt. */
  canPrompt: boolean;
  /** Already running as an installed (standalone) app. */
  installed: boolean;
  platform: "ios" | "android" | "desktop";
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectPlatform(): InstallState["platform"] {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  // iPadOS 13+ masquerades as macOS but keeps touch support.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  const displayMode = window.matchMedia?.("(display-mode: standalone)").matches;
  // iOS Safari never reports display-mode; it puts `standalone` on navigator.
  return Boolean(displayMode || nav.standalone);
}

let deferredInstall: BeforeInstallPromptEvent | null = null;
let appInstalled = isStandalone();
const installListeners = new Set<(state: InstallState) => void>();

function installState(): InstallState {
  return {
    canPrompt: deferredInstall !== null,
    installed: appInstalled,
    platform: detectPlatform(),
  };
}

function emitInstall() {
  const state = installState();
  for (const listener of installListeners) listener(state);
}

export function getInstallState(): InstallState {
  return installState();
}

export function subscribeInstall(listener: (state: InstallState) => void): () => void {
  installListeners.add(listener);
  listener(installState());
  return () => {
    installListeners.delete(listener);
  };
}

/**
 * Show the native install prompt. Returns what happened so the caller can
 * react: `unavailable` means no prompt (iOS, or criteria not met yet) and the
 * manual steps should stay visible.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferredInstall;
  if (!event) return "unavailable";
  // Chromium retires the event after one use; a later visit re-fires it.
  deferredInstall = null;
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") appInstalled = true;
    emitInstall();
    return choice.outcome === "accepted" ? "accepted" : "dismissed";
  } catch {
    emitInstall();
    return "unavailable";
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Suppress the browser mini-infobar: the landing page presents the same
    // action with context around it.
    event.preventDefault();
    deferredInstall = event as BeforeInstallPromptEvent;
    emitInstall();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    appInstalled = true;
    emitInstall();
  });
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        const announce = (worker: ServiceWorker | null) => {
          if (!worker) return;
          emit({
            apply: () => {
              worker.postMessage({ type: "SKIP_WAITING" });
            },
          });
        };

        // A previous visit already left a new worker waiting.
        if (registration.waiting && navigator.serviceWorker.controller) {
          announce(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state !== "installed") return;
            if (navigator.serviceWorker.controller) announce(installing);
          });
        });

        let reloading = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (reloading) return;
          reloading = true;
          emit(null);
          window.location.reload();
        });
      })
      .catch(() => {
        /* Registration failing must never break the app. */
      });
  });
}

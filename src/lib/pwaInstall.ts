export type PwaPlatform = "ios" | "android" | "desktop";

export interface PwaInstallSnapshot {
  /** True once the browser/environment has been inspected on the client. */
  ready: boolean;
  /** True when the app is already running as an installed standalone app. */
  installed: boolean;
  /** True when the browser handed us a beforeinstallprompt event we can fire. */
  canPrompt: boolean;
  platform: PwaPlatform;
  /** True for embedded browsers (WhatsApp, Facebook, Instagram, …) where install is blocked. */
  inAppBrowser: boolean;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallWindow = Window & {
  __fleetcoreInstallPrompt?: BeforeInstallPromptEvent;
};

const SERVER_SNAPSHOT: PwaInstallSnapshot = {
  ready: false,
  installed: false,
  canPrompt: false,
  platform: "desktop",
  inAppBrowser: false,
};

let snapshot = SERVER_SNAPSHOT;
let promptEvent: BeforeInstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function emit(patch: Partial<PwaInstallSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

function readCapturedPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  return (window as InstallWindow).__fleetcoreInstallPrompt ?? null;
}

function storeCapturedPrompt(event: BeforeInstallPromptEvent | null) {
  if (typeof window === "undefined") return;
  const win = window as InstallWindow;
  if (event) win.__fleetcoreInstallPrompt = event;
  else delete win.__fleetcoreInstallPrompt;
}

function detectPlatform(userAgent: string): PwaPlatform {
  if (/iPad|iPhone|iPod/.test(userAgent)) return "ios";
  if (/Android/.test(userAgent)) return "android";
  return "desktop";
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Starts listening for the browser's install event. Safe to call repeatedly and
 * safe on the server. The event is also mirrored onto `window.__fleetcoreInstallPrompt`
 * by the inline script in the root layout, so an event fired before hydration is
 * not lost.
 */
export function initPwaInstall() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  promptEvent = readCapturedPrompt();

  const onBeforeInstall = (event: Event) => {
    event.preventDefault();
    promptEvent = event as BeforeInstallPromptEvent;
    storeCapturedPrompt(promptEvent);
    emit({ canPrompt: true });
  };

  const onInstalled = () => {
    promptEvent = null;
    storeCapturedPrompt(null);
    emit({ canPrompt: false, installed: true });
  };

  window.addEventListener("beforeinstallprompt", onBeforeInstall);
  window.addEventListener("appinstalled", onInstalled);

  const userAgent = navigator.userAgent;
  emit({
    ready: true,
    installed: isStandalone(),
    canPrompt: promptEvent !== null,
    platform: detectPlatform(userAgent),
    inAppBrowser:
      /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|MicroMessenger|Twitter|LinkedInApp|Snapchat/i.test(
        userAgent
      ),
  });
}

export function subscribePwaInstall(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPwaInstallSnapshot() {
  return snapshot;
}

export function getPwaInstallServerSnapshot() {
  return SERVER_SNAPSHOT;
}

export async function promptPwaInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!promptEvent) return "unavailable";

  const event = promptEvent;
  promptEvent = null;

  try {
    await event.prompt();
    const choice = await event.userChoice;
    storeCapturedPrompt(null);
    emit({ canPrompt: false });
    return choice.outcome;
  } catch {
    storeCapturedPrompt(null);
    emit({ canPrompt: false });
    return "unavailable";
  }
}

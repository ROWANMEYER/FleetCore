"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWA installer:
 * - Registers the service worker (production only, so dev HMR is unaffected)
 * - Shows an "Install app" banner when the browser offers beforeinstallprompt
 * - Falls back to iOS instructions (Share → Add to Home Screen)
 */
export function PwaInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("fleetcore-install-dismissed") === "1";
    } catch {
      return false;
    }
  });
  const [isIOS, setIsIOS] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* SW registration is best-effort */
      });
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferredPrompt(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    const standaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    const t = setTimeout(() => {
      setIsIOS(ios);
      setStandalone(standaloneMode);
    }, 0);

    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem("fleetcore-install-dismissed", "1");
    } catch {
      /* ignore */
    }
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  };

  const visible = !standalone && !dismissed && (deferredPrompt !== null || isIOS);
  if (!visible) return null;

  return (
    <div
      className="fixed bottom-24 inset-x-4 z-[60] sm:left-auto sm:right-4 sm:w-96 animate-fade-up glass-card-premium mb-[env(safe-area-inset-bottom)] md:bottom-4"
      role="region"
      aria-label="Install app"
    >
      <div className="flex items-start gap-3 p-4">
        {/* App icon */}
        <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-[#06B6D4] to-[#0891B2] shadow-lg shadow-[rgba(6,182,212,0.3)] shrink-0">
          <Download className="w-5 h-5 text-white" strokeWidth={2} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[var(--foreground)]">Install FleetCore</p>
          <p className="text-xs text-[var(--nav-text-color)] mt-0.5 leading-relaxed">
            {isIOS && !deferredPrompt
              ? "Get the mobile app: tap Share, then “Add to Home Screen”."
              : "Add the mobile app to your home screen for quick access."}
          </p>

          <div className="flex items-center gap-2 mt-3">
            {deferredPrompt && (
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] hover:opacity-90 transition-all shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                Install
              </button>
            )}
            <button
              onClick={dismiss}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-all"
            >
              Not now
            </button>
          </div>
        </div>

        <button
          onClick={dismiss}
          className="p-1 rounded-md text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

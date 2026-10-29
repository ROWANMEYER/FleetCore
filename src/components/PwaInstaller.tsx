"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { InstallAppDialog } from "@/src/components/InstallAppDialog";
import { usePwaInstall } from "@/src/hooks/usePwaInstall";

/**
 * PWA installer banner:
 * - Registers the service worker (production only, so dev HMR is unaffected)
 * - Shows an "Install app" banner when the browser offers beforeinstallprompt
 * - Falls back to the shared manual install instructions, including iOS
 *
 * The dedicated download button in the mobile top bar (InstallAppButton) and
 * the /start screen share the same install state through usePwaInstall.
 */
export function PwaInstaller() {
  const { installed, canPrompt, platform, inAppBrowser, promptInstall } = usePwaInstall();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("fleetcore-install-dismissed") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* SW registration is best-effort */
      });
    }
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
    if (!canPrompt) {
      setDialogOpen(true);
      return;
    }
    const outcome = await promptInstall();
    if (outcome === "accepted") dismiss();
  };

  const visible = !installed && !dismissed && !inAppBrowser && (canPrompt || platform === "ios");
  if (!visible) return null;

  return (
    <>
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
            <p className="text-sm font-bold text-[var(--foreground)]">Download FleetCore</p>
            <p className="text-xs text-[var(--nav-text-color)] mt-0.5 leading-relaxed">
              {platform === "ios" && !canPrompt
                ? "Get the mobile app: tap Share, then “Add to Home Screen”."
                : "Add the mobile app to your home screen for quick access."}
            </p>

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => void handleInstall()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] hover:opacity-90 transition-all shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                {canPrompt ? "Install" : "How to install"}
              </button>
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

      <InstallAppDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}

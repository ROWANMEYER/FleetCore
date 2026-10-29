"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { InstallAppDialog } from "@/src/components/InstallAppDialog";
import { usePwaInstall } from "@/src/hooks/usePwaInstall";

interface InstallAppButtonProps {
  variant?: "icon" | "card";
  className?: string;
}

/**
 * Dedicated download button for phones whose browser never surfaces the PWA
 * install prompt. When the browser gives us a real prompt we fire it; otherwise
 * we open the step-by-step install instructions. Hidden once the app is already
 * installed or running standalone.
 */
export function InstallAppButton({ variant = "icon", className = "" }: InstallAppButtonProps) {
  const { ready, installed, canPrompt, promptInstall } = usePwaInstall();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!ready || installed) return null;

  const handleClick = async () => {
    if (canPrompt) {
      const outcome = await promptInstall();
      if (outcome !== "unavailable") return;
    }
    setDialogOpen(true);
  };

  return (
    <>
      {variant === "card" ? (
        <button
          type="button"
          onClick={() => void handleClick()}
          className={`flex min-h-16 w-full items-center gap-4 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-left shadow-lg backdrop-blur-md transition-colors hover:bg-cyan-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${className}`}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-400/20 text-cyan-200">
            <Download size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-sm">Download app</strong>
            <span className="text-xs text-cyan-50/70">Add FleetCore to your home screen</span>
          </span>
          <Download size={18} className="shrink-0 text-cyan-200" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleClick()}
          title="Download app"
          aria-label="Download app"
          className={`flex shrink-0 items-center justify-center rounded-lg px-2 py-1.5 text-cyan-600 transition-all duration-150 hover:bg-[var(--card-bg)] hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300 ${className}`}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
            <Download size={16} strokeWidth={1.9} />
          </span>
        </button>
      )}

      <InstallAppDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}

"use client";

import { useState } from "react";
import { Check, Copy, Download, EllipsisVertical, ExternalLink, Menu, Share, Smartphone, TriangleAlert, X } from "lucide-react";
import { ModalShell } from "@/src/components/common/ModalShell";
import { usePwaInstall } from "@/src/hooks/usePwaInstall";

interface InstallAppDialogProps {
  open: boolean;
  onClose: () => void;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(field);
    return copied;
  }
}

function openInChrome() {
  const { host, pathname, search, hash } = window.location;
  window.location.href = `intent://${host}${pathname}${search}${hash}#Intent;scheme=https;package=com.android.chrome;end`;
}

/**
 * Manual install/download instructions for browsers that never fire
 * `beforeinstallprompt` (iOS Safari, Samsung Internet, Firefox, and in-app
 * browsers such as WhatsApp or Facebook). No web page can force an install —
 * this is the closest the platform allows: the exact steps for the device.
 */
export function InstallAppDialog({ open, onClose }: InstallAppDialogProps) {
  const { canPrompt, promptInstall, platform, inAppBrowser } = usePwaInstall();
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    if (await copyText(window.location.href)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const installNow = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") onClose();
  };

  return (
    <ModalShell open={open} onClose={onClose} portal zIndexClass="z-[70]">
      <div className="flex max-h-[calc(100dvh-32px)] flex-col overflow-hidden">
        <header className="flex items-start gap-3 border-b border-[var(--card-border)] p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#06B6D4] to-[#0891B2] shadow-lg shadow-[rgba(6,182,212,0.3)]">
            <Download className="h-5 w-5 text-white" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">Download FleetCore</h2>
            <p className="mt-0.5 text-xs text-[var(--nav-text-color)]">
              Add the app to your phone&apos;s home screen.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-[var(--nav-text-color)] transition-colors hover:bg-[var(--card-bg)] hover:text-[var(--foreground)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto p-5">
          {canPrompt && (
            <button
              type="button"
              onClick={() => void installNow()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#06B6D4] to-[#0891B2] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <Download className="h-4 w-4" />
              Install now
            </button>
          )}

          {inAppBrowser ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  You are viewing FleetCore inside another app (for example WhatsApp or
                  Facebook). Apps cannot be installed from an in-app browser.
                </p>
              </div>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--foreground)]">
                {platform === "ios" ? (
                  <li>Tap the ••• menu, then choose “Open in Safari”.</li>
                ) : (
                  <li>Open this page in Chrome using the button below.</li>
                )}
                <li>In the browser, install FleetCore using the steps shown.</li>
              </ol>
              {platform === "android" && (
                <button
                  type="button"
                  onClick={openInChrome}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--card-border)] px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--card-bg)]"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open in Chrome
                </button>
              )}
            </div>
          ) : platform === "ios" ? (
            <div className="space-y-3 text-sm">
              <p className="font-semibold">iPhone / iPad</p>
              <ol className="list-decimal space-y-2 pl-5 text-[var(--foreground)]">
                <li>Open this page in <strong>Safari</strong> (not Chrome).</li>
                <li className="flex items-start gap-2">
                  <Share className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
                  <span>Tap the <strong>Share</strong> button at the bottom of the screen.</span>
                </li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>Tap <strong>Add</strong>.</li>
              </ol>
              <p className="text-xs text-[var(--nav-text-color)]">
                This is the only way Apple allows apps to be added — websites cannot
                trigger it automatically.
              </p>
            </div>
          ) : platform === "android" ? (
            <div className="space-y-3 text-sm">
              <p className="font-semibold">Android</p>
              <ol className="list-decimal space-y-2 pl-5 text-[var(--foreground)]">
                <li className="flex items-start gap-2">
                  <EllipsisVertical className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
                  <span>Tap the browser menu (three dots).</span>
                </li>
                <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                <li>Confirm with <strong>Install</strong> / <strong>Add</strong>.</li>
              </ol>
              <p className="text-xs text-[var(--nav-text-color)]">
                On Samsung Internet use <Menu className="inline h-3.5 w-3.5" /> → <strong>Add page to</strong> → <strong>Home screen</strong>.
              </p>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="font-semibold">Desktop browser</p>
              <ol className="list-decimal space-y-2 pl-5 text-[var(--foreground)]">
                <li>Click the install icon in the address bar.</li>
                <li>Or open the browser menu and choose <strong>Install FleetCore</strong>.</li>
              </ol>
            </div>
          )}

          <button
            type="button"
            onClick={() => void copyLink()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--card-border)] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--card-bg)]"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            {copied ? "Link copied" : "Copy app link"}
          </button>

          <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-[var(--nav-text-color)]">
            <Smartphone className="h-3.5 w-3.5" />
            Works on iPhone, iPad and Android.
          </p>
        </div>
      </div>
    </ModalShell>
  );
}

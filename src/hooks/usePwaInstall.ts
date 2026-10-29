"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getPwaInstallServerSnapshot,
  getPwaInstallSnapshot,
  initPwaInstall,
  promptPwaInstall,
  subscribePwaInstall,
} from "@/src/lib/pwaInstall";

/**
 * Shared PWA install state. Every subscriber sees the same beforeinstallprompt
 * event, so the banner and the dedicated download button can never disagree
 * about whether the app is installable.
 */
export function usePwaInstall() {
  useEffect(() => {
    initPwaInstall();
  }, []);

  const state = useSyncExternalStore(
    subscribePwaInstall,
    getPwaInstallSnapshot,
    getPwaInstallServerSnapshot
  );

  return { ...state, promptInstall: promptPwaInstall };
}

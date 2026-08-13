"use client";

import { useState, useEffect } from "react";

/**
 * Best-effort connectivity detection: `navigator.onLine` plus the browser's
 * online/offline events. Used to decide whether a route save should hit the
 * server directly or go into the offline queue.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    // Re-read on visibility change too — navigator.onLine can be stale after
    // a laptop sleeps or a mobile network drops silently.
    const onVisible = () => {
      if (document.visibilityState === "visible") setOnline(navigator.onLine);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return online;
}

/**
 * True when a mutation error is best explained by a missing/spotty connection
 * (as opposed to a server-side rejection like auth expiry or validation).
 */
export function isOfflineError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /offline|network( error| request)?|failed to fetch|load failed|fetch failed|socket|temporarily unavailable|connection (closed|lost|refused)|ECONN/i.test(
    msg
  );
}

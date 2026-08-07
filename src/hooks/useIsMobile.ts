"use client";

import { useEffect, useState } from "react";

/**
 * Matches the app-wide mobile breakpoint used by AppShell's mobile guard
 * (max-width: 767px) — the same size that enables the bottom tab bar.
 * Re-renders when the viewport crosses the breakpoint (e.g. rotating a
 * tablet, or resizing a desktop window).
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
}

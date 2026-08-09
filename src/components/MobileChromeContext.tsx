"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Global "chrome minimized" state for the mobile sheets screen.
 *
 * The sheets page's Minimize button hides everything except the route cards:
 * the sort/filter toolbar (inside MobileSheetsView), the mobile top bar and
 * the bottom tab bar (both rendered by Navigation), and the AppShell padding
 * that reserves space for them. This context lets those separate components
 * share the single boolean without prop drilling. The sheets screen resets it
 * to false on unmount so navigation never stays hidden on other screens.
 */
interface MobileChromeContextValue {
  /** True when the app chrome is minimized (only route cards visible). */
  minimized: boolean;
  setMinimized: (value: boolean) => void;
}

const MobileChromeContext = createContext<MobileChromeContextValue | null>(null);

export function MobileChromeProvider({ children }: { children: ReactNode }) {
  const [minimized, setMinimized] = useState(false);

  const value = useMemo(() => ({ minimized, setMinimized }), [minimized]);

  return (
    <MobileChromeContext.Provider value={value}>{children}</MobileChromeContext.Provider>
  );
}

export function useMobileChrome(): MobileChromeContextValue {
  const ctx = useContext(MobileChromeContext);
  if (!ctx) throw new Error("useMobileChrome must be used within a MobileChromeProvider");
  return ctx;
}

"use client";

import { useSyncExternalStore } from "react";

export const QUICK_SEND_STYLES = [
  { id: "cards", label: "Clean Cards" },
  { id: "dark", label: "Dark Fleet" },
  { id: "guided", label: "Guided Steps" },
  { id: "compact", label: "Compact Dispatch" },
  { id: "message", label: "Message First" },
] as const;
export type QuickSendStyle = typeof QUICK_SEND_STYLES[number]["id"];
const KEY = "fleetcore.quicksend.style";
const EVENT = "fleetcore:quicksend-style";
let fallback: QuickSendStyle | null = null;

export function parseQuickSendStyle(value: string | null): QuickSendStyle {
  return QUICK_SEND_STYLES.find((style) => style.id === value)?.id ?? "cards";
}
function snapshot(): QuickSendStyle {
  if (fallback) return fallback;
  try { return parseQuickSendStyle(window.localStorage.getItem(KEY)); }
  catch { return "cards"; }
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(EVENT, listener);
  };
}
function serverSnapshot(): QuickSendStyle { return "cards"; }
export function useQuickSendStyle() {
  const style = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const setStyle = (value: QuickSendStyle) => {
    try { window.localStorage.setItem(KEY, value); fallback = null; }
    catch { fallback = value; }
    window.dispatchEvent(new Event(EVENT));
  };
  return [style, setStyle] as const;
}

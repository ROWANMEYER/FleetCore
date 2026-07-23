"use client";

import { useEffect } from "react";

export function useKeyboardShortcut(key: string, handler: () => void, enabled = true, ctrl = false) {
  useEffect(() => {
    if (!enabled) return;

    const listener = (e: KeyboardEvent) => {
      if (e.key === key && e.ctrlKey === ctrl) {
        e.preventDefault();
        handler();
      }
    };

    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [key, handler, enabled, ctrl]);
}

export function useEscapeToClose(onClose: () => void, open: boolean) {
  useEffect(() => {
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, open]);
}

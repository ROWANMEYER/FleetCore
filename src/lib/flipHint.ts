"use client";

import { useEffect, useState } from "react";

/* ─── Flip-hint dismissal state (localStorage) ──────────────────────
   The "Tap to flip" pill on the admin cards is a one-time discoverability
   affordance: the first card flip anywhere marks it as seen, every mounted
   hint fades out, and it never renders again (persisted per browser, shared
   across all admin pages).

   The admin pages only mount after auth (client-side), so the lazy
   useState initializer below is hydration-safe — FlipHint never renders
   during SSR. */

const STORAGE_KEY = "fleetcore-flip-hint-dismissed";
const DISMISS_EVENT = "fleetcore:flip-hint-dismissed";

export function isFlipHintDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the dismissal and notify every mounted hint to fade out. */
export function dismissFlipHint(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Storage unavailable (private mode etc.) — hints just stay visible.
  }
  window.dispatchEvent(new Event(DISMISS_EVENT));
}

/** State for a FlipHint pill: `visible` = not yet dismissed, `fading` = a card
    was flipped and the pill should fade out now. Once the fade completes the
    pill unmounts entirely — an opacity-0 pill would otherwise leave an empty
    gap in the inline variant's flex row. */
export function useFlipHint(): { visible: boolean; fading: boolean } {
  const [visible, setVisible] = useState(() => !isFlipHintDismissed());
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let timer: number | undefined;
    const onDismiss = () => {
      setFading(true);
      if (timer === undefined) {
        // Just past the 500ms CSS fade transition.
        timer = window.setTimeout(() => setVisible(false), 550);
      }
    };
    window.addEventListener(DISMISS_EVENT, onDismiss);
    return () => {
      window.removeEventListener(DISMISS_EVENT, onDismiss);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [visible]);

  return { visible, fading };
}

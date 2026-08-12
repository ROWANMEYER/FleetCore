"use client";

import { FlipVertical2 } from "lucide-react";
import { useFlipHint } from "@/src/lib/flipHint";

/* ─── Small "tap to flip" affordance for the admin flip cards ───
   Tells users the card has a details back panel. Pure decoration:
   pointer-events-none so it never intercepts the card's own click (the
   whole card still flips on tap).

   One-time hint: it renders only until the user has flipped any card — the
   first flip anywhere fades every mounted pill out (500ms) and it never
   appears again (persisted in localStorage, see src/lib/flipHint.ts). The
   back panel shows its own "tap to flip back" hint.

   Variants:
   - "corner" (default) — an absolute pill in the top-left corner of the
     card's image area (Trucks / Trailers / Drivers).
   - "inline" — a static chip for text-based cards (Subcontractors /
     Users), placed where the page's layout fits. */

export function FlipHint({ variant = "corner" }: { variant?: "corner" | "inline" }) {
  const { visible, fading } = useFlipHint();
  if (!visible) return null;

  const chip =
    "flex items-center gap-1 px-2 py-1 rounded-full bg-black/45 backdrop-blur-sm text-white/90 text-[10px] font-semibold uppercase tracking-wider pointer-events-none select-none shadow-sm transition-opacity duration-500" +
    (fading ? " opacity-0" : "");

  return (
    <div
      aria-hidden="true"
      className={variant === "inline" ? chip : `absolute top-2 left-2 z-10 ${chip}`}
    >
      <FlipVertical2 className="w-3 h-3" />
      Tap to flip
    </div>
  );
}

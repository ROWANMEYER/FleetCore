"use client";

import { ReactNode } from "react";
import { dismissFlipHint, isFlipHintDismissed } from "@/src/lib/flipHint";
import { useTilt } from "@/src/hooks/useTilt";

/* ─── 3D flip card ───
   Wraps two faces (front/back) in a perspective container. Clicking the
   card (or pressing Enter/Space when focused) spins it 180° on the Y axis
   to reveal the back; clicking again spins it back to the front.

   On hover the whole card tilts a few degrees toward the cursor (a fast
   "come tap me" affordance, shared via useTilt — see src/hooks/useTilt).
   The tilt lives on its own wrapper with a snappy 200ms transition so it
   never fights the 500ms flip spin; it's zeroed while the card is flipped
   and skipped for prefers-reduced-motion / coarse pointers.

   The back face is absolutely positioned to match the front's height, so
   both faces should contain roughly the same amount of content.
   Interactive elements rendered inside a face must call
   event.stopPropagation() on click if they shouldn't also flip the card.
   (Safari note: keep the faces free of overflow/filter rules that can
   flatten a 3D context — the glass faces rely on backdrop-filter which is
   fine as long as it's applied to the faces, not the rotating wrapper.) */

const IDENTITY_TILT = { transform: "rotateX(0deg) rotateY(0deg)" };

export function FlipCard({
  flipped,
  onToggle,
  front,
  back,
  className = "",
}: {
  flipped: boolean;
  onToggle: () => void;
  front: ReactNode;
  back: ReactNode;
  className?: string;
}) {
  const tilt = useTilt();

  const handleToggle = () => {
    // The first flip anywhere retires the "Tap to flip" hints — they fade out
    // and never appear again (see src/lib/flipHint.ts). Inner buttons call
    // stopPropagation, so only genuine card flips reach this point.
    if (!isFlipHintDismissed()) dismissFlipHint();
    onToggle();
  };

  // No tilt while flipped — the back panel shouldn't wobble.
  const tiltStyle = flipped ? IDENTITY_TILT : tilt.style;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      onClick={handleToggle}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      onKeyDown={(e) => {
        // Only react to keys pressed while the card itself is focused —
        // keydown from an inner button (Edit/Delete) must not flip the card.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleToggle();
        }
      }}
      title={flipped ? "Tap to flip back" : "Tap to flip"}
      // data-tilt marks the tilting element uniformly across every consumer
      // (KpiCard / AnalyticsKpiCard put it on themselves, so it lives on the
      // card root here — the actual clickable element — not the inner wrapper).
      data-tilt
      className={`[perspective:1200px] group outline-none cursor-pointer ${className}`}
    >
      {/* Tilt wrapper — follows the cursor (fast transition). The inline
          transform is always present (even at 0deg) so the preserve-3d
          chain stays stable — note it makes this wrapper a stacking
          context + containing block, so keep fixed-position elements out
          of the card faces. */}
      <div
        className="relative w-full h-full transition-transform duration-200 ease-out [transform-style:preserve-3d] will-change-transform"
        style={tiltStyle}
      >
        {/* Flip wrapper — 500ms spin on tap */}
        <div
          className={`relative w-full h-full transition-transform duration-500 ease-[cubic-bezier(0.4,0.2,0.2,1)] [transform-style:preserve-3d] will-change-transform ${
            flipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          <div className="[backface-visibility:hidden]">{front}</div>
          <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">{back}</div>
        </div>
      </div>
    </div>
  );
}

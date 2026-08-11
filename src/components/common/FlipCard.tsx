"use client";

import { ReactNode } from "react";

/* ─── 3D flip card ───
   Wraps two faces (front/back) in a perspective container. Clicking the
   card (or pressing Enter/Space when focused) spins it 180° on the Y axis
   to reveal the back; clicking again spins it back to the front.

   The back face is absolutely positioned to match the front's height, so
   both faces should contain roughly the same amount of content.
   Interactive elements rendered inside a face must call
   event.stopPropagation() on click if they shouldn't also flip the card.
   (Safari note: keep the faces free of overflow/filter rules that can
   flatten a 3D context — the glass faces rely on backdrop-filter which is
   fine as long as it's applied to the faces, not the rotating wrapper.) */

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
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      onClick={onToggle}
      onKeyDown={(e) => {
        // Only react to keys pressed while the card itself is focused —
        // keydown from an inner button (Edit/Delete) must not flip the card.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      title={flipped ? "Tap to flip back" : "Tap to flip"}
      className={`[perspective:1200px] group outline-none cursor-pointer ${className}`}
    >
      <div
        className={`relative w-full transition-transform duration-500 ease-[cubic-bezier(0.4,0.2,0.2,1)] [transform-style:preserve-3d] will-change-transform ${
          flipped ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        <div className="[backface-visibility:hidden]">{front}</div>
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">{back}</div>
      </div>
    </div>
  );
}

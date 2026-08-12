"use client";

import { useEffect, useRef, useState } from "react";

/* ─── Cursor-tracking 3D tilt (shared) ───────────────────────────────
   Tilts an element a few degrees toward the cursor on hover — the same
   affordance the admin flip cards use to invite tapping, now reused by
   the dashboard KPI cards. Desktop-only by nature: skipped for
   prefers-reduced-motion and coarse pointers (mobile browsers synthesize
   mousemove during a tap, which would briefly tilt the card before the
   click lands). Media queries are kept live via change listeners, so OS
   setting changes apply immediately.

   Usage:
     const tilt = useTilt();
     <div style={tilt.style} onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave} ...>
     // pair with a transition on transform (e.g. transition-transform
     // duration-200 ease-out) so the tilt eases instead of snapping.

   `style.transform` is always present (even at 0deg) so the 3D chain
   stays stable — note it makes the element a stacking context + containing
   block, so keep fixed-position descendants out. */

const DEFAULT_MAX_TILT = 6;

export function useTilt(maxTilt: number = DEFAULT_MAX_TILT) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const reduceMotion = useRef(false);
  const coarsePointer = useRef(false);

  useEffect(() => {
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(pointer: coarse)");
    const update = () => {
      reduceMotion.current = rm.matches;
      coarsePointer.current = coarse.matches;
    };
    update();
    rm.addEventListener("change", update);
    coarse.addEventListener("change", update);
    return () => {
      rm.removeEventListener("change", update);
      coarse.removeEventListener("change", update);
    };
  }, []);

  const onMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (reduceMotion.current || coarsePointer.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // Normalise the cursor position to -1..1 across the element.
    const px = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const py = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    // Tilt the element so its face turns toward the cursor.
    setTilt({ x: -py * maxTilt, y: px * maxTilt });
  };

  const onMouseLeave = () => setTilt({ x: 0, y: 0 });

  return {
    style: { transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` },
    onMouseMove,
    onMouseLeave,
  };
}

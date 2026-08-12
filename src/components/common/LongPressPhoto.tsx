"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/* ─── Long-press photo lightbox ───
   Wraps an image/thumbnail; holding it for ~550ms (touch or mouse) opens a
   full-screen overlay showing the full, uncropped image centered on a dark
   blurred backdrop — used on driver photos across the admin cards, the
   calendar, sheets and QuickSend.

   The click that follows a completed long-press is swallowed
   (preventDefault + stopPropagation), so the gesture never flips a FlipCard,
   opens a route detail, or follows a wrapping WhatsApp link — a plain quick
   tap behaves exactly as before. Pointer capture retargets the release to
   this element even if the finger slides slightly, and pointercancel
   (browser takes over a scroll) cancels the pending press. The overlay is
   portaled to <body> so 3D flip transforms / overflow clipping on the card
   faces can never cut it off.

   Dismiss: tap the backdrop, tap the X, or press Escape. Body scroll is
   locked while open. */

const LONG_PRESS_MS = 550;
// If the pointer moves more than this before the timer fires it's a
// scroll/drag, not a hold.
const MOVE_TOLERANCE_PX = 12;

export function LongPressPhoto({
  src,
  alt = "",
  children,
  className = "",
  hint = "Hold to view full photo",
}: {
  src?: string;
  alt?: string;
  children: ReactNode;
  className?: string;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const swallowClickRef = useRef<((e: MouseEvent) => void) | null>(null);
  const disarmOnNextPressRef = useRef<(() => void) | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const disarmSwallow = () => {
    if (swallowClickRef.current) {
      document.removeEventListener("click", swallowClickRef.current, { capture: true });
      swallowClickRef.current = null;
    }
    if (disarmOnNextPressRef.current) {
      document.removeEventListener("pointerdown", disarmOnNextPressRef.current, { capture: true });
      disarmOnNextPressRef.current = null;
    }
  };

  // Clear any pending timer / swallow on unmount.
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      disarmSwallow();
    },
    []
  );

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!src) return;
    disarmSwallow();
    // Retarget pointerup (and the click after it) to this element even if
    // the finger slides a few px — otherwise the release click can land on
    // an ancestor (the FlipCard) and flip it.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore — capture is a nicety */
    }
    startPosRef.current = { x: e.clientX, y: e.clientY };
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      // Swallow the release-click at the DOCUMENT level, capture phase: by the
      // time the finger lifts, the overlay sits under it, so the click targets
      // the backdrop (or an ancestor card), not this span — a span-level
      // stopPropagation can't catch it. This keeps the card from flipping and
      // the backdrop from instantly closing the lightbox.
      const swallow = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      swallowClickRef.current = swallow;
      document.addEventListener("click", swallow, { capture: true, once: true });
      // If the release never produces a click (touch pointercancel — e.g. the
      // user drags to scroll right after the overlay opened), the once-listener
      // above would otherwise swallow the NEXT tap anywhere in the app (even
      // the backdrop tap meant to close this lightbox). Disarm on the next
      // pointerdown anywhere instead, so the very next interaction is clean.
      const disarm = () => disarmSwallow();
      disarmOnNextPressRef.current = disarm;
      document.addEventListener("pointerdown", disarm, { capture: true, once: true });
      setOpen(true);
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const start = startPosRef.current;
    if (!start) return;
    if (Math.abs(e.clientX - start.x) > MOVE_TOLERANCE_PX || Math.abs(e.clientY - start.y) > MOVE_TOLERANCE_PX) {
      clearTimer();
      startPosRef.current = null;
    }
  };

  const handlePointerEnd = () => {
    clearTimer();
    startPosRef.current = null;
  };

  // Touch pointers fire pointerleave immediately after pointerdown (a touch
  // has no hover state), which would cancel a pending long-press — so leave
  // only cancels for mouse/pen. Scroll-cancel is handled by the move
  // threshold, and release/cancel by pointerup/pointercancel below.
  const handlePointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    handlePointerEnd();
  };

  // Keyboard activation: Enter/Space on the focused trigger opens the
  // lightbox (mirrors FlipCard's convention for card toggles).
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (src) setOpen(true);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    // Belt-and-braces: if the release-click does land on this span (mouse,
    // pointer capture), swallow it here too. The document-level swallow above
    // usually gets there first. A normal tap leaves no swallow armed.
    if (swallowClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const close = useCallback(() => setOpen(false), []);

  // Escape closes; body scroll is locked while the overlay is open; focus
  // moves to the close button so keyboard users can dismiss it (Escape also
  // works, and returning focus is handled by the modal closing).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = window.requestAnimationFrame(() => closeBtnRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.cancelAnimationFrame(raf);
    };
  }, [open, close]);

  if (!src) return <>{children}</>;

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        className={`inline-flex shrink-0 cursor-zoom-in select-none ${className}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        // Suppress the native long-press context menu on touch (React types
        // contextmenu as MouseEvent, so detect touch via the UA capability);
        // desktop right-click ("save image") stays intact.
        onContextMenu={(e) => {
          if ("ontouchstart" in window) e.preventDefault();
        }}
        style={{ touchAction: "manipulation", WebkitTouchCallout: "none" }}
        title={hint}
        aria-label={alt ? `View full photo of ${alt}` : "View full photo"}
      >
        {children}
      </span>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${alt || "Photo"} — full view`}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
            onClick={close}
          >
            {/* Blurred dark backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />
            {/* Full uncropped image */}
            <img
              src={src}
              alt={alt}
              onClick={(e) => e.stopPropagation()}
              draggable={false}
              className="relative max-h-[85vh] max-w-[92vw] w-auto h-auto object-contain rounded-lg shadow-2xl ring-1 ring-white/10 animate-in zoom-in-75 duration-200"
            />
            <button
              ref={closeBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                close();
              }}
              aria-label="Close full photo"
              className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur border border-white/20 hover:bg-black/80 transition-colors"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded-full bg-black/60 backdrop-blur px-3 py-1.5 text-[11px] font-medium text-white/90 border border-white/10">
              Tap anywhere to close
            </span>
          </div>,
          document.body
        )}
    </>
  );
}

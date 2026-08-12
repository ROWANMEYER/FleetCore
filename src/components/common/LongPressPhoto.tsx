"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn } from "lucide-react";

/* ─── Long-press photo lightbox ───
   Wraps an image/thumbnail; holding it for ~550ms (touch or mouse) opens a
   full-screen overlay showing the photo centered on a dark blurred backdrop.
   By default the overlay shows `src` (the display image); pass `lightboxSrc`
   (e.g. the uncropped original) to show that instead — used for driver photos
   so long-press always reveals the full, untouched photo.

   The overlay is zoomable: pinch with two fingers (or mouse-wheel / double-
   tap / double-click on desktop) to zoom in up to 5x, one-finger/mouse drag
   to pan when zoomed, double-tap/double-click to toggle 1x ↔ 3x. Zoom state
   resets every time the lightbox opens.

   The click that follows a completed long-press is swallowed at document
   level, so the gesture never flips a FlipCard, opens a route detail, or
   follows a wrapping link. Pointer capture retargets the release even if the
   finger slides; touch's immediate pointerleave is ignored; the overlay is
   portaled to <body> so 3D flip transforms can't clip it. Dismiss: tap the
   backdrop (or the X / Escape); body scroll is locked while open. */

const LONG_PRESS_MS = 550;
const MOVE_TOLERANCE_PX = 12;
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_MS = 320;

export function LongPressPhoto({
  src,
  lightboxSrc,
  alt = "",
  children,
  className = "",
  hint = "Hold to view full photo",
}: {
  src?: string;
  /** Optional different image for the overlay (e.g. the uncropped original). */
  lightboxSrc?: string;
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
  const zoomRef = useRef<HTMLDivElement>(null);
  const imgWrapRef = useRef<HTMLDivElement>(null);

  // Zoom state (reset on open). scaleRef/translateRef mirror the state for
  // event handlers; they're kept in sync by applyTransform (never assigned
  // during render — the React Compiler forbids that).
  const [scale, setScale] = useState(MIN_SCALE);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const scaleRef = useRef(MIN_SCALE);
  const translateRef = useRef({ x: 0, y: 0 });

  const applyTransform = useCallback((nextScale: number, nextTranslate: { x: number; y: number }) => {
    scaleRef.current = nextScale;
    translateRef.current = nextTranslate;
    setScale(nextScale);
    setTranslate(nextTranslate);
  }, []);

  // Gesture bookkeeping.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    dist: number;
    midX: number;
    midY: number;
    startScale: number;
    startTx: number;
    startTy: number;
  } | null>(null);
  const panRef = useRef<{ x: number; y: number; startTx: number; startTy: number } | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    applyTransform(MIN_SCALE, { x: 0, y: 0 });
  }, []);

  // ── Long-press detection ────────────────────────────────────────────
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

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      disarmSwallow();
    },
    []
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!src) return;
    disarmSwallow();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    startPosRef.current = { x: e.clientX, y: e.clientY };
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const swallow = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      swallowClickRef.current = swallow;
      document.addEventListener("click", swallow, { capture: true, once: true });
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

  const handlePointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    handlePointerEnd();
  };

  const handleClick = (e: React.MouseEvent) => {
    if (swallowClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (src) setOpen(true);
    }
  };

  // Escape closes; body scroll locks; focus the close button.
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

  // ── Lightbox zoom (gestures inside the overlay) ─────────────────────
  const clampTranslate = (s: number, x: number, y: number) => {
    const el = imgWrapRef.current;
    const container = zoomRef.current;
    if (!el || !container) return { x, y };
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const ew = el.offsetWidth * s;
    const eh = el.offsetHeight * s;
    const maxX = Math.max(0, (ew - cw) / 2);
    const maxY = Math.max(0, (eh - ch) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };

  const applyZoomAt = (nextScale: number, focusX: number, focusY: number) => {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    const el = imgWrapRef.current;
    const container = zoomRef.current;
    if (!el || !container) {
      applyTransform(s, { x: 0, y: 0 });
      return;
    }
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const cur = scaleRef.current;
    const t = translateRef.current;
    // Image point under the focus (in container coords) must stay put:
    //   imgX = (focusX - cw/2 - t.x) / cur
    const imgX = (focusX - cw / 2 - t.x) / cur;
    const imgY = (focusY - ch / 2 - t.y) / cur;
    const nx = focusX - cw / 2 - imgX * s;
    const ny = focusY - ch / 2 - imgY * s;
    const clamped = clampTranslate(s, nx, ny);
    applyTransform(s, clamped);
  };

  const onOverlayPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    zoomRef.current?.setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      const [p1, p2] = [...pointersRef.current.values()];
      pinchRef.current = {
        dist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
        midX: (p1.x + p2.x) / 2,
        midY: (p1.y + p2.y) / 2,
        startScale: scaleRef.current,
        startTx: translateRef.current.x,
        startTy: translateRef.current.y,
      };
      panRef.current = null;
    } else if (pointersRef.current.size === 1) {
      panRef.current = {
        x: e.clientX,
        y: e.clientY,
        startTx: translateRef.current.x,
        startTy: translateRef.current.y,
      };
    }
  };

  const onOverlayPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    const prev = pointersRef.current.get(e.pointerId)!;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [p1, p2] = [...pointersRef.current.values()];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const zoomRefEl = zoomRef.current;
      if (!zoomRefEl) return;
      const vr = zoomRefEl.getBoundingClientRect();
      const factor = pinchRef.current.dist > 0 ? dist / pinchRef.current.dist : 1;
      applyZoomAt(pinchRef.current.startScale * factor, midX - vr.left, midY - vr.top);
    } else if (pointersRef.current.size === 1 && panRef.current) {
      if (scaleRef.current <= MIN_SCALE) return; // no pan at 1x
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      const clamped = clampTranslate(scaleRef.current, translateRef.current.x + dx, translateRef.current.y + dy);
      applyTransform(scaleRef.current, clamped);
    }
  };

  const endOverlayPointer = (e: React.PointerEvent) => {
    const wasPinch = pointersRef.current.size === 2;
    pointersRef.current.delete(e.pointerId);
    pinchRef.current = null;
    panRef.current = null;

    // Double-tap / double-click toggles 1x ↔ 3x.
    if (!wasPinch && pointersRef.current.size === 0) {
      const now = Date.now();
      const vr = zoomRef.current?.getBoundingClientRect();
      const x = vr ? e.clientX - vr.left : 0;
      const y = vr ? e.clientY - vr.top : 0;
      const last = lastTapRef.current;
      if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(x - last.x, y - last.y) < 28) {
        const next = scaleRef.current > 1.5 ? MIN_SCALE : 3;
        applyZoomAt(next, x, y);
        lastTapRef.current = null;
      } else {
        lastTapRef.current = { t: now, x, y };
      }
    }
  };

  const onOverlayWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const vr = zoomRef.current?.getBoundingClientRect();
    if (!vr) return;
    const factor = Math.pow(1.15, -e.deltaY / 100);
    applyZoomAt(scaleRef.current * factor, e.clientX - vr.left, e.clientY - vr.top);
  };

  // ── Render ───────────────────────────────────────────────────────────
  if (!src) return <>{children}</>;

  const overlaySrc = lightboxSrc || src;

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

            {/* Zoom container — captures pinch/pan/wheel/double-tap. Taps on
                the empty area around the image bubble up to the overlay root
                (close); taps ON the image are stopped so panning/zooming
                never closes the lightbox. */}
            <div
              ref={zoomRef}
              className="relative w-full h-full flex items-center justify-center overflow-hidden"
              onPointerDown={onOverlayPointerDown}
              onPointerMove={onOverlayPointerMove}
              onPointerUp={endOverlayPointer}
              onPointerCancel={endOverlayPointer}
              onWheel={onOverlayWheel}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("[data-lightbox-img]")) e.stopPropagation();
              }}
              style={{ touchAction: "none" }}
            >
              {/* Image wrapper — transform: translate + scale */}
              <div
                ref={imgWrapRef}
                data-lightbox-img
                className="max-h-[85vh] max-w-[92vw]"
                style={{
                  transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                }}
              >
                <img
                  src={overlaySrc}
                  alt={alt}
                  draggable={false}
                  className="block max-h-[85vh] max-w-[92vw] w-auto h-auto object-contain rounded-lg shadow-2xl ring-1 ring-white/10"
                />
              </div>

              {scale <= MIN_SCALE && (
                <span className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur px-3 py-1.5 text-[11px] font-medium text-white/90 border border-white/10">
                  <ZoomIn size={12} />
                  Pinch / double-tap to zoom
                </span>
              )}
            </div>

            <button
              ref={closeBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                close();
              }}
              aria-label="Close full photo"
              className="absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur border border-white/20 hover:bg-black/80 transition-colors"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

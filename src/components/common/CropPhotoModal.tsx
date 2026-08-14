"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Minus, Plus, X } from "lucide-react";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampOffset,
  coverScale,
  visibleSourceRect,
  zoomAt,
  type CropTransform,
} from "@/src/lib/photoCrop";

/* ─── Photo crop editor ───
   Full-screen square (1:1) crop modal shown after a driver photo is picked.
   The image fills the square viewport (cover-fit baseline); the user pans by
   dragging, zooms via pinch / mouse-wheel / + − buttons / double-tap, and the
   visible square is exactly what gets stored — the live circular preview in
   the corner matches the round avatar on the card pixel-for-pixel.

   Confirm produces the cropped square JPEG (up to `outputSize` px). The
   caller uploads that as the display photo AND the original (uncropped) image
   so long-press can show the untouched full photo (see DriverAvatar).

   Gestures:
   - one-finger / mouse drag → pan
   - two-finger pinch (or wheel) → zoom around the focal point
   - double-tap → toggle 1x ↔ 3x
   - + / − buttons → step zoom around the viewport centre
   Escape cancels; body scroll is locked while open; portaled to <body> so the
   flip-card transforms can never clip it. */

const PREVIEW_SIZE = 72; // live round preview chip (px)
const DOUBLE_TAP_MS = 320;

export function CropPhotoModal({
  open,
  src,
  alt = "",
  outputSize = 900,
  onCancel,
  onConfirm,
  onError,
}: {
  open: boolean;
  /** Object URL or data URL of the decoded (HEIC-converted) image. */
  src: string;
  alt?: string;
  /** Square JPEG edge length for the cropped output. */
  outputSize?: number;
  onCancel: () => void;
  /** Called with the cropped square JPEG + the full uncropped original (both
      derived from the ALREADY-decoded modal image — the caller must not
      re-decode the source, which doubles the cost on large camera photos). */
  onConfirm: (croppedDataUrl: string, originalDataUrl: string) => void;
  /** Fired when the image fails to decode (corrupt/fake file). */
  onError?: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const [viewportSize, setViewportSize] = useState(0);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [t, setT] = useState<CropTransform>({ zoom: 1, offsetX: 0, offsetY: 0 });
  const [confirming, setConfirming] = useState(false);

  // Gesture bookkeeping (refs so pointer handlers never go stale).
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; midX: number; midY: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; start: CropTransform } | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  // Measure the square viewport once it mounts.
  useEffect(() => {
    if (!open) return;
    const el = viewportRef.current;
    if (!el) return;
    setViewportSize(el.clientWidth);
  }, [open]);

  // Reset state whenever the modal opens (fresh image).
  useEffect(() => {
    if (!open) return;
    setNatural({ w: 0, h: 0 });
    setT({ zoom: 1, offsetX: 0, offsetY: 0 });
    setConfirming(false);
    pointersRef.current.clear();
    pinchRef.current = null;
    dragRef.current = null;
  }, [open, src]);

  // Escape cancels; lock body scroll; focus the confirm button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = window.requestAnimationFrame(() => confirmRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.cancelAnimationFrame(raf);
    };
  }, [open, onCancel]);

  // Once the image loads we know its natural size → initial cover transform.
  const onImageLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img || viewportSize <= 0) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return;
    setNatural({ w, h });
    // Start fully zoomed-out AND centered on the photo — the cover-fit
    // baseline (offset 0) shows the top-left corner (objectPosition "0 0"),
    // which for a portrait photo is the hair/forehead, not the face. Centering
    // the offset puts the useful middle of the image in the crop square by
    // default, exactly where driver faces usually are.
    const base = coverScale(viewportSize, w, h);
    setT({
      zoom: 1,
      offsetX: -(w * base - viewportSize) / 2,
      offsetY: -(h * base - viewportSize) / 2,
    });
  }, [viewportSize]);

  const doZoomAt = (factor: number, fx: number, fy: number) => {
    if (viewportSize <= 0 || !natural.w || !natural.h) return;
    setT((prev) => zoomAt(viewportSize, natural.w, natural.h, prev, factor, fx, fy));
  };

  const doPan = (dx: number, dy: number) => {
    if (viewportSize <= 0 || !natural.w || !natural.h) return;
    setT((prev) => {
      const next = clampOffset(viewportSize, natural.w, natural.h, prev.zoom, prev.offsetX + dx, prev.offsetY + dy);
      return { ...prev, ...next };
    });
  };

  // ── Pointer gestures (pan + pinch) ────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      // Pinch start.
      const [p1, p2] = [...pointersRef.current.values()];
      pinchRef.current = {
        dist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
        midX: (p1.x + p2.x) / 2,
        midY: (p1.y + p2.y) / 2,
      };
      dragRef.current = null;
    } else {
      dragRef.current = { startX: e.clientX, startY: e.clientY, start: tRef.current };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    const prev = pointersRef.current.get(e.pointerId)!;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [p1, p2] = [...pointersRef.current.values()];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const factor = pinchRef.current.dist > 0 ? dist / pinchRef.current.dist : 1;
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const vr = viewportRef.current?.getBoundingClientRect();
      if (!vr || viewportSize <= 0) return;
      // Keep the image pixel under the pinch midpoint fixed through the zoom.
      const focusX = midX - vr.left;
      const focusY = midY - vr.top;
      setT((cur) => {
        const zoomed = zoomAt(viewportSize, natural.w, natural.h, cur, factor, focusX, focusY);
        // Re-center drift: preserve the focal point under the moving midpoint.
        return zoomed;
      });
    } else if (dragRef.current && pointersRef.current.size === 1) {
      doPan(e.clientX - prev.x, e.clientY - prev.y);
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    // Double-tap detection on the LAST pointer of a tap (no pinch).
    const wasPinch = pointersRef.current.size === 2;
    pointersRef.current.delete(e.pointerId);
    pinchRef.current = null;
    dragRef.current = null;

    if (!wasPinch && e.pointerType !== "mouse") {
      const now = Date.now();
      const vr = viewportRef.current?.getBoundingClientRect();
      const x = vr ? e.clientX - vr.left : 0;
      const y = vr ? e.clientY - vr.top : 0;
      const last = lastTapRef.current;
      if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(x - last.x, y - last.y) < 24) {
        // Toggle 1x ↔ 3x around the tap point.
        const factor = tRef.current.zoom > 1.5 ? 1 / tRef.current.zoom : 3;
        doZoomAt(factor, x, y);
        lastTapRef.current = null;
      } else {
        lastTapRef.current = { t: now, x, y };
      }
    }
  };

  // Mouse-wheel zoom around the cursor (desktop).
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const vr = viewportRef.current?.getBoundingClientRect();
    if (!vr || viewportSize <= 0) return;
    const factor = Math.pow(1.1, -e.deltaY / 100);
    doZoomAt(factor, e.clientX - vr.left, e.clientY - vr.top);
  };

  const stepZoom = (dir: 1 | -1) => {
    const vr = viewportRef.current?.getBoundingClientRect();
    if (!vr || viewportSize <= 0) return;
    const factor = dir === 1 ? 1.4 : 1 / 1.4;
    doZoomAt(factor, vr.width / 2, vr.height / 2);
  };

  const handleConfirm = () => {
    if (confirming || viewportSize <= 0 || !natural.w || !natural.h) return;
    const img = imgRef.current;
    if (!img) return;
    setConfirming(true);
    // Render BOTH outputs from the already-decoded <img> in a single pass —
    // re-decoding the source blob (e.g. a 20MB camera photo) can take minutes
    // on slow devices. The square crop comes from the visible source rect; the
    // original is the whole image downscaled to 2x the output edge.
    window.requestAnimationFrame(() => {
      try {
        const rect = visibleSourceRect(viewportSize, natural.w, natural.h, tRef.current);
        const canvas = document.createElement("canvas");
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas is not supported");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, outputSize, outputSize);
        ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, outputSize, outputSize);
        const cropped = canvas.toDataURL("image/jpeg", 0.85);

        const maxDim = outputSize * 2;
        const scale = Math.min(1, maxDim / Math.max(natural.w, natural.h));
        const ow = Math.max(1, Math.round(natural.w * scale));
        const oh = Math.max(1, Math.round(natural.h * scale));
        const origCanvas = document.createElement("canvas");
        origCanvas.width = ow;
        origCanvas.height = oh;
        const octx = origCanvas.getContext("2d");
        if (!octx) throw new Error("Canvas is not supported");
        octx.fillStyle = "#ffffff";
        octx.fillRect(0, 0, ow, oh);
        octx.drawImage(img, 0, 0, ow, oh);
        const original = origCanvas.toDataURL("image/jpeg", 0.85);

        onConfirm(cropped, original);
      } catch (e: any) {
        console.error("Crop render failed:", e);
        setConfirming(false);
      }
    });
  };

  if (!open) return null;
  const zoomPct = Math.round((t.zoom * 100)) + "%";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop photo"
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      {/* Dark blurred backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />

      <div
        className="relative w-full max-w-md flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white/90">
            Crop photo
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel crop"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Square crop viewport */}
        <div
          ref={viewportRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onWheel={onWheel}
          className="relative w-full aspect-square overflow-hidden rounded-xl bg-black select-none"
          style={{ touchAction: "none" }}
        >
          {/* The image — objectFit cover fills the square at the baseline;
              the transform applies the user's pan (offset) and zoom. Renders
              as soon as the viewport is measured; onLoad captures natural
              dims to drive the crop math. */}
          {viewportSize > 0 && (
            <img
              ref={imgRef}
              src={src}
              alt={alt}
              draggable={false}
              onLoad={onImageLoad}
              onError={onError}
              className="absolute top-0 left-0 max-w-none"
              style={{
                width: viewportSize,
                height: viewportSize,
                objectFit: "cover",
                objectPosition: "0 0",
                transform: `translate(${t.offsetX}px, ${t.offsetY}px) scale(${t.zoom})`,
                transformOrigin: "0 0",
              }}
            />
          )}

          {/* Rule-of-thirds grid */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-white/20" />
            ))}
          </div>

          {/* Corner brackets */}
          <div className="pointer-events-none absolute inset-2">
            <div className="absolute top-0 left-0 h-6 w-6 border-t-2 border-l-2 border-white/80 rounded-tl" />
            <div className="absolute top-0 right-0 h-6 w-6 border-t-2 border-r-2 border-white/80 rounded-tr" />
            <div className="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-white/80 rounded-bl" />
            <div className="absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-white/80 rounded-br" />
          </div>

          {/* Live round preview — matches the card avatar exactly. The image
              is rendered at the full viewport size (same cover baseline) and
              transformed with the same pan/zoom, then scaled down to the chip
              — so the circle shows the exact square that will be stored. */}
          <div
            className="pointer-events-none absolute bottom-2 right-2 h-[72px] w-[72px] rounded-full overflow-hidden shadow-lg ring-2 ring-white/60 bg-black"
            aria-hidden
          >
            {viewportSize > 0 && (
              <img
                src={src}
                alt=""
                draggable={false}
                className="absolute top-0 left-0 max-w-none"
                style={{
                  width: viewportSize,
                  height: viewportSize,
                  objectFit: "cover",
                  objectPosition: "0 0",
                  transform: `translate(${(t.offsetX * PREVIEW_SIZE) / viewportSize}px, ${
                    (t.offsetY * PREVIEW_SIZE) / viewportSize
                  }px) scale(${t.zoom * (PREVIEW_SIZE / viewportSize)})`,
                  transformOrigin: "0 0",
                }}
              />
            )}
          </div>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => stepZoom(-1)}
              aria-label="Zoom out"
              disabled={t.zoom <= MIN_ZOOM + 0.01}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-30"
            >
              <Minus size={15} strokeWidth={2.5} />
            </button>
            <span className="w-12 text-center text-xs font-semibold text-white/80 tabular-nums">
              {zoomPct}
            </span>
            <button
              type="button"
              onClick={() => stepZoom(1)}
              aria-label="Zoom in"
              disabled={t.zoom >= MAX_ZOOM - 0.01}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-30"
            >
              <Plus size={15} strokeWidth={2.5} />
            </button>
          </div>
          <span className="text-[10px] text-white/50">
            Pinch / drag to position · double-tap to zoom
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-11 rounded-xl border border-white/25 text-sm font-semibold text-white/80 hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            className="flex flex-1 h-11 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-sm font-bold text-white shadow-lg shadow-[rgba(6,182,212,0.3)] hover:opacity-90 transition-all disabled:opacity-60"
          >
            <Check size={16} strokeWidth={2.75} />
            {confirming ? "Cropping…" : "Use photo"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─── Photo crop math (pure, unit-testable) ───
   The crop editor shows the image inside a square viewport; the user pans
   (offsetX/offsetY, CSS px within the viewport) and zooms (scale, where 1 =
   the cover-fit baseline — the image always covers the viewport). These pure
   helpers keep that state consistent; the DOM/canvas rendering lives in
   CropPhotoModal. */

export interface CropTransform {
  /** Zoom multiplier over the cover-fit baseline (>= 1). */
  zoom: number;
  /** Image top-left offset within the viewport, CSS px. */
  offsetX: number;
  offsetY: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;

/** Baseline scale that fits the image so it fully covers the square viewport. */
export function coverScale(viewportSize: number, imgW: number, imgH: number): number {
  if (viewportSize <= 0 || imgW <= 0 || imgH <= 0) return 1;
  return Math.max(viewportSize / imgW, viewportSize / imgH);
}

/** Rendered image size in CSS px for a given zoom over the baseline. */
export function renderedSize(viewportSize: number, imgW: number, imgH: number, zoom: number) {
  const base = coverScale(viewportSize, imgW, imgH);
  return { w: imgW * base * zoom, h: imgH * base * zoom };
}

/**
 * Clamp the offset so the image always covers the viewport on both axes
 * (a zoomed image can be panned only within the area it still covers).
 */
export function clampOffset(
  viewportSize: number,
  imgW: number,
  imgH: number,
  zoom: number,
  offsetX: number,
  offsetY: number
): { offsetX: number; offsetY: number } {
  const { w, h } = renderedSize(viewportSize, imgW, imgH, zoom);
  const maxX = Math.max(0, w - viewportSize);
  const maxY = Math.max(0, h - viewportSize);
  // The + 0 normalizes -0 → 0 so tests and callers can compare with ===/toBe.
  return {
    offsetX: Math.max(-maxX, Math.min(0, offsetX)) + 0,
    offsetY: Math.max(-maxY, Math.min(0, offsetY)) + 0,
  };
}

/**
 * Zoom by `factor` (multiplier) around a focal point inside the viewport,
 * keeping the image pixel under the focal point fixed (pinch midpoint,
 * cursor, or double-tap point). Returns the clamped new transform.
 */
export function zoomAt(
  viewportSize: number,
  imgW: number,
  imgH: number,
  current: CropTransform,
  factor: number,
  focusX: number,
  focusY: number
): CropTransform {
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor));
  const ratio = nextZoom / current.zoom;
  // Image pixel at the focal point before the zoom stays under it after:
  //   imgX = (focusX - offsetX) / zoom   →   offsetX' = focusX - imgX * nextZoom
  const offsetX = focusX - (focusX - current.offsetX) * ratio;
  const offsetY = focusY - (focusY - current.offsetY) * ratio;
  const clamped = clampOffset(viewportSize, imgW, imgH, nextZoom, offsetX, offsetY);
  return { zoom: nextZoom, ...clamped };
}

/**
 * The rectangle of the SOURCE image (natural px) that the square viewport
 * currently shows — what a confirm-crop drawImage should sample.
 */
export function visibleSourceRect(
  viewportSize: number,
  imgW: number,
  imgH: number,
  t: CropTransform
): { sx: number; sy: number; sw: number; sh: number } {
  const base = coverScale(viewportSize, imgW, imgH);
  const scale = base * t.zoom;
  // The rendered image is CENTERED in the viewport (offset 0 = centered), so
  // the image's top-left sits at (viewport - rendered)/2 + pan offset.
  const imgLeft = (viewportSize - imgW * scale) / 2 + t.offsetX;
  const imgTop = (viewportSize - imgH * scale) / 2 + t.offsetY;
  const sx = Math.max(0, -imgLeft / scale);
  const sy = Math.max(0, -imgTop / scale);
  const sw = Math.min(imgW - sx, viewportSize / scale);
  const sh = Math.min(imgH - sy, viewportSize / scale);
  return { sx, sy, sw, sh };
}

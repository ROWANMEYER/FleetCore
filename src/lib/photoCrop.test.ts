import { describe, it, expect } from "vitest";
import {
  coverScale,
  renderedSize,
  clampOffset,
  zoomAt,
  visibleSourceRect,
  MIN_ZOOM,
  MAX_ZOOM,
  type CropTransform,
} from "./photoCrop";

const S = 300;

describe("coverScale", () => {
  it("covers the viewport for a landscape image", () => {
    // 600x300 in a 300x300 square → scale 0.5 → rendered 300x150? No: cover
    // must fill BOTH axes → max(300/600, 300/300) = 1 → 600x300.
    expect(coverScale(S, 600, 300)).toBe(1);
  });

  it("covers the viewport for a portrait image", () => {
    expect(coverScale(S, 300, 600)).toBe(1);
  });

  it("handles tiny images by upscaling", () => {
    expect(coverScale(S, 100, 100)).toBe(3);
  });

  it("guards against invalid sizes", () => {
    expect(coverScale(0, 100, 100)).toBe(1);
    expect(coverScale(S, 0, 100)).toBe(1);
  });
});

describe("renderedSize", () => {
  it("scales both axes by baseline × zoom", () => {
    const { w, h } = renderedSize(S, 300, 150, 1);
    // baseline = max(1, 2) = 2 → rendered 600x300
    expect(w).toBeCloseTo(600);
    expect(h).toBeCloseTo(300);
    const zoomed = renderedSize(S, 300, 150, 2);
    expect(zoomed.w).toBeCloseTo(1200);
    expect(zoomed.h).toBeCloseTo(600);
  });
});

describe("clampOffset", () => {
  it("centers an image that exactly fits (no pan room)", () => {
    const { offsetX, offsetY } = clampOffset(S, 300, 300, 1, -500, 50);
    // rendered 300x300 == viewport → max offset 0 on both axes
    expect(offsetX).toBe(0);
    expect(offsetY).toBe(0);
  });

  it("clamps a pan so the image never uncovers the viewport", () => {
    // 300x150, zoom 1 → rendered 600x300 → can pan x in [-300, 0], y in [0, 0]
    const a = clampOffset(S, 300, 150, 1, -500, 0);
    expect(a.offsetX).toBe(-300);
    expect(a.offsetY).toBe(0);
    const b = clampOffset(S, 300, 150, 1, 999, 0);
    expect(b.offsetX).toBe(0);
  });
});

describe("zoomAt", () => {
  const centered: CropTransform = { zoom: 1, offsetX: 0, offsetY: 0 };

  it("clamps zoom to [MIN_ZOOM, MAX_ZOOM]", () => {
    const tiny = zoomAt(S, 300, 300, centered, 0.001, 150, 150);
    expect(tiny.zoom).toBe(MIN_ZOOM);
    const huge = zoomAt(S, 300, 300, centered, 1e9, 150, 150);
    expect(huge.zoom).toBe(MAX_ZOOM);
  });

  it("keeps the image pixel under the focal point fixed", () => {
    const before: CropTransform = { zoom: 2, offsetX: -60, offsetY: -40 };
    const focus = { x: 120, y: 90 };
    // Image pixel at the focus: ((120 - -60)/2, (90 - -40)/2) = (90, 65)
    const after = zoomAt(S, 300, 300, before, 2, focus.x, focus.y);
    expect(after.zoom).toBeCloseTo(4);
    const pxAfter = ((focus.x - after.offsetX) / after.zoom);
    const pyAfter = ((focus.y - after.offsetY) / after.zoom);
    expect(pxAfter).toBeCloseTo(90);
    expect(pyAfter).toBeCloseTo(65);
  });

  it("zooming at min stays at the same zoom", () => {
    const after = zoomAt(S, 300, 300, centered, 0.5, 150, 150);
    expect(after.zoom).toBe(1);
    expect(after.offsetX).toBe(0);
    expect(after.offsetY).toBe(0);
  });
});

describe("visibleSourceRect", () => {
  it("returns the full image when it exactly fills the viewport", () => {
    // 300x300 at zoom 1 → baseline 1 → whole image visible
    const r = visibleSourceRect(S, 300, 300, { zoom: 1, offsetX: 0, offsetY: 0 });
    expect(r.sx).toBeCloseTo(0);
    expect(r.sy).toBeCloseTo(0);
    expect(r.sw).toBeCloseTo(300);
    expect(r.sh).toBeCloseTo(300);
  });

  it("returns a centered horizontal slice for a landscape image", () => {
    // 600x300 at zoom 1 → baseline 1 → rendered 600x300 → viewport shows the
    // middle 300x300: sx=150, sw=300, sy=0, sh=300
    const r = visibleSourceRect(S, 600, 300, { zoom: 1, offsetX: 0, offsetY: 0 });
    expect(r.sx).toBeCloseTo(150);
    expect(r.sw).toBeCloseTo(300);
    expect(r.sy).toBeCloseTo(0);
    expect(r.sh).toBeCloseTo(300);
  });

  it("respects pan offsets", () => {
    const r = visibleSourceRect(S, 600, 300, { zoom: 1, offsetX: -120, offsetY: 0 });
    expect(r.sx).toBeCloseTo(270);
    expect(r.sw).toBeCloseTo(300);
  });

  it("respects zoom", () => {
    const r = visibleSourceRect(S, 600, 600, { zoom: 2, offsetX: 0, offsetY: 0 });
    // baseline 0.5, scale 1.0 → viewport shows 300x300 of the 600x600 image,
    // centered: sx=150, sw=300
    expect(r.sx).toBeCloseTo(150);
    expect(r.sw).toBeCloseTo(300);
    expect(r.sy).toBeCloseTo(150);
    expect(r.sh).toBeCloseTo(300);
  });
});

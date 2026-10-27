import { afterEach, describe, expect, it, vi } from "vitest";
import { createSplashLifecycle } from "./splashLifecycle";

afterEach(() => vi.useRealTimers());
describe("splash lifecycle", () => {
  it("holds the splash for ten seconds after app and artwork are ready", () => {
    vi.useFakeTimers();
    const done = vi.fn(); const fade = vi.fn(); const splash = createSplashLifecycle(done, fade);
    splash.setReady(true); expect(fade).not.toHaveBeenCalled();
    splash.settleArtwork(); expect(fade).not.toHaveBeenCalled();
    vi.advanceTimersByTime(9999); expect(fade).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(fade).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(280); expect(done).toHaveBeenCalledTimes(1);
    splash.dispose();
  });
  it("waits for auth when artwork arrives first", () => {
    vi.useFakeTimers();
    const fade = vi.fn(); const splash = createSplashLifecycle(vi.fn(),fade);
    splash.settleArtwork(); vi.advanceTimersByTime(1000); expect(fade).not.toHaveBeenCalled();
    splash.setReady(true); expect(fade).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10000); expect(fade).toHaveBeenCalledTimes(1); splash.dispose();
  });
  it("dismisses even when the image never loads and auth never resolves", () => {
    vi.useFakeTimers();
    const done = vi.fn(); const fade = vi.fn(); const splash = createSplashLifecycle(done,fade);
    vi.advanceTimersByTime(10000); expect(fade).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(280); expect(done).toHaveBeenCalledTimes(1); splash.dispose();
  });
  it("treats an image error as settled artwork and still exits", () => {
    vi.useFakeTimers();
    const done = vi.fn(); const splash = createSplashLifecycle(done,vi.fn());
    splash.setReady(true); splash.settleArtwork(); vi.advanceTimersByTime(10280);
    expect(done).toHaveBeenCalledTimes(1); splash.dispose();
  });
  it("completes once even if late readiness events race the fallback", () => {
    vi.useFakeTimers();
    const done = vi.fn(); const fade = vi.fn(); const splash = createSplashLifecycle(done,fade);
    vi.advanceTimersByTime(10000); splash.setReady(true); splash.settleArtwork(); vi.advanceTimersByTime(5000);
    expect(done).toHaveBeenCalledTimes(1); expect(fade).toHaveBeenCalledTimes(1); splash.dispose();
  });
  it("skips immediately even before startup or artwork are ready", () => {
    vi.useFakeTimers();
    const done = vi.fn(); const splash = createSplashLifecycle(done,vi.fn());
    splash.skip(); expect(done).toHaveBeenCalledTimes(1);
    splash.skip(); splash.setReady(true); splash.settleArtwork(); vi.advanceTimersByTime(10000);
    expect(done).toHaveBeenCalledTimes(1); splash.dispose();
  });
  it("cancels a running fade when the user skips", () => {
    vi.useFakeTimers();
    const done = vi.fn(); const splash = createSplashLifecycle(done,vi.fn());
    splash.setReady(true); splash.settleArtwork(); splash.skip();
    expect(done).toHaveBeenCalledTimes(1); vi.advanceTimersByTime(10000);
    expect(done).toHaveBeenCalledTimes(1); splash.dispose();
  });
  it("cancels pending fallback and fade callbacks when unmounted", () => {
    vi.useFakeTimers();
    const done = vi.fn(); const fade = vi.fn(); const splash = createSplashLifecycle(done,fade);
    splash.dispose(); vi.advanceTimersByTime(10000); expect(done).not.toHaveBeenCalled(); expect(fade).not.toHaveBeenCalled();
    const other = createSplashLifecycle(done,fade); other.setReady(true); other.settleArtwork(); other.dispose();
    vi.advanceTimersByTime(10000); expect(done).not.toHaveBeenCalled();
  });
});

/** Splash stays visible for ten seconds unless the user taps to skip it. */
export function createSplashLifecycle(onComplete: () => void, onFade: () => void) {
  let fading = false;
  let finished = false;
  let disposed = false;
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;
  const finish = () => {
    if (finished || disposed) return;
    finished = true;
    onComplete();
  };
  const fade = () => {
    if (disposed || finished || fading) return;
    fading = true;
    clearTimeout(deadline);
    onFade();
    fadeTimer = setTimeout(finish, 280);
  };
  const deadline = setTimeout(fade, 10_000);
  return {
    setReady(value: boolean) { void value; },
    settleArtwork() {},
    skip() { clearTimeout(deadline); clearTimeout(fadeTimer); finish(); },
    dispose() { disposed = true; clearTimeout(deadline); clearTimeout(fadeTimer); },
  };
}

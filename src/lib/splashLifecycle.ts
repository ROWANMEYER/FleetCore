/** Splash exits once artwork and auth are ready, or after a bounded fallback. */
export function createSplashLifecycle(onComplete: () => void, onFade: () => void) {
  let ready = false;
  let artworkSettled = false;
  let fading = false;
  let finished = false;
  let disposed = false;
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;
  const finish = () => {
    if (finished || disposed) return;
    finished = true;
    onComplete();
  };
  const fade = (force = false) => {
    if (disposed || finished || fading || (!force && (!ready || !artworkSettled))) return;
    fading = true;
    clearTimeout(deadline);
    onFade();
    fadeTimer = setTimeout(finish, 280);
  };
  const deadline = setTimeout(() => fade(true), 3000);
  return {
    setReady(value: boolean) { ready = value; fade(); },
    settleArtwork() { artworkSettled = true; fade(); },
    skip() { clearTimeout(deadline); clearTimeout(fadeTimer); finish(); },
    dispose() { disposed = true; clearTimeout(deadline); clearTimeout(fadeTimer); },
  };
}

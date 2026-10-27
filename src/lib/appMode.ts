/**
 * Distinguishes the mobile/PWA shell from the desktop web app.
 * A narrow desktop browser window must remain the web app; mobile behavior is
 * enabled only for a real mobile user agent or an installed standalone PWA.
 */
export function isMobileAppEnvironment(): boolean {
  if (typeof window === "undefined") return false;

  const narrowViewport = window.matchMedia("(max-width: 767px)").matches;
  if (!narrowViewport) return false;

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent);

  return standalone || mobileUserAgent;
}

/**
 * Distinguishes the mobile/PWA shell from the desktop web app using the same
 * breakpoint as the mobile CSS. The in-app browser used to review the PWA can
 * report a desktop user agent, so user-agent detection cannot be authoritative.
 */
export function isMobileAppEnvironment(): boolean {
  if (typeof window === "undefined") return false;

  const narrowViewport = window.matchMedia("(max-width: 767px)").matches;
  if (!narrowViewport) return false;

  return narrowViewport;
}

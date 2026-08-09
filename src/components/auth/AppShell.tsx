"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Navigation from "@/src/components/Navigation";
import { AmbientBackground } from "@/src/components/AmbientBackground";
import { useAuth } from "./AuthProvider";
import { MobileChromeProvider, useMobileChrome } from "@/src/components/MobileChromeContext";

/* ─── Android app: four-screen mode ────────────────────────────────
   On phones (<768px, same breakpoint the app uses for "mobile") the
   app is limited to Dashboard, Input, Swaps and Sheets (both swaps
   screens and the edit route are covered). Every other route
   redirects to the Dashboard. Desktop keeps the full sidebar and all
   screens. */
const MOBILE_ALLOWED_PATHS = [
  "/dashboard",
  "/operations/daily-planner/input",
  "/operations/daily-planner/edit",
  "/operations/swaps/history",
  "/operations/swaps/trailers",
  "/operations/daily-planner/sheets",
  "/calendar",
];

function isMobileAllowed(path: string) {
  return MOBILE_ALLOWED_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);

  const isLogin = pathname === "/login";

  // Track mobile viewport (matches the md: breakpoint used across the app)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user && !isLogin) router.replace("/login");
    if (user && isLogin) router.replace("/dashboard");
  }, [loading, user, isLogin, router]);

  // Mobile guard: only the four mobile screens are reachable on phones
  useEffect(() => {
    if (loading || !user || !isMobile || isLogin) return;
    if (!isMobileAllowed(pathname)) router.replace("/dashboard");
  }, [loading, user, isMobile, isLogin, pathname, router]);

  // Kill the browser's pull-to-refresh gesture. Dragging down when the app is
  // already scrolled to the top would reload the page and wipe every
  // drill-down/filter/panel the user had open, dumping them back at the
  // default screen. `overscroll-behavior` CSS handles Chrome; this touch guard
  // covers the remaining browsers. When an inner scroller still has room to
  // scroll up, the gesture is left alone so normal scrolling is unaffected.
  useEffect(() => {
    let touchStartY = 0;
    // Scrollable ancestors of the touch target, collected once per gesture.
    // Checking scrollTop per move is cheap; running getComputedStyle per move
    // is not (it can cause jank on low-end phones during the drag itself).
    let scrollAnchors: Element[] = [];

    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? 0;
      scrollAnchors = [];
      const target = e.target instanceof Element ? e.target : null;
      let node: Element | null = target;
      while (node && node !== document.documentElement) {
        const overflowY = window.getComputedStyle(node).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") {
          scrollAnchors.push(node);
        }
        node = node.parentElement;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      if (y <= touchStartY) return; // only downward drags trigger pull-to-refresh
      // Allow the gesture while any scrollable ancestor still has room to
      // scroll up; block only the overscroll that would reload the page.
      if (scrollAnchors.some((el) => el.scrollTop > 0)) return;
      e.preventDefault();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[var(--background)]">
        <div className="skeleton-shimmer h-10 w-10 rounded-full" />
      </div>
    );
  }

  const showApp = !!user && !isLogin;
  const showLogin = !user && isLogin;

  return (
    <MobileChromeProvider>
      <div className="flex h-dvh overflow-hidden bg-[var(--background)]">
        <AmbientBackground />

        {showApp && <Navigation />}

        <AppMain showApp={showApp}>{showApp || showLogin ? children : null}</AppMain>
      </div>
    </MobileChromeProvider>
  );
}

/**
 * The <main> element. Reserves space for the mobile top bar (pt-14) and the
 * bottom tab bar (pb-24) — except when the sheets screen minimizes the app
 * chrome, in which case the content takes the full viewport.
 */
function AppMain({ showApp, children }: { showApp: boolean; children: React.ReactNode }) {
  const { minimized } = useMobileChrome();

  return (
    <main
      className={`flex-1 min-w-0 relative flex flex-col overflow-auto overscroll-y-contain scrollbar-fleet ${
        showApp && !minimized ? "pt-14 md:pt-0 pb-24 md:pb-0" : ""
      }`}
    >
      {children}
    </main>
  );
}

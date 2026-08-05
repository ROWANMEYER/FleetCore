"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Navigation from "@/src/components/Navigation";
import { AmbientBackground } from "@/src/components/AmbientBackground";
import { useAuth } from "./AuthProvider";

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
    <div className="flex h-dvh overflow-hidden bg-[var(--background)]">
      <AmbientBackground />

      {showApp && <Navigation />}

      <main
        className={`flex-1 min-w-0 relative flex flex-col overflow-auto scrollbar-fleet ${
          showApp ? "pt-14 md:pt-0 pb-24 md:pb-0" : ""
        }`}
      >
        {showApp || showLogin ? children : null}
      </main>
    </div>
  );
}

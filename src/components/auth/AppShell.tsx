"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Navigation from "@/src/components/Navigation";
import { AmbientBackground } from "@/src/components/AmbientBackground";
import { useAuth } from "./AuthProvider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isLogin = pathname === "/login";

  useEffect(() => {
    if (loading) return;
    if (!user && !isLogin) router.replace("/login");
    if (user && isLogin) router.replace("/dashboard");
  }, [loading, user, isLogin, router]);

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
          showApp ? "pt-14 md:pt-0" : ""
        }`}
      >
        {showApp || showLogin ? children : null}
      </main>
    </div>
  );
}

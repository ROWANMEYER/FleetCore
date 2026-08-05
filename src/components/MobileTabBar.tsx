"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, ClipboardPlus } from "lucide-react";

/* ─── Mobile bottom tab bar (Android app) ─────────────────────────
   The mobile app is deliberately limited to two screens: Dashboard
   and Input. This fixed bottom bar is the only navigation on phones;
   the desktop sidebar is rendered separately by Navigation.tsx. */
const TABS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/operations/daily-planner/input", label: "Input", icon: ClipboardPlus },
] as const;

export function MobileTabBar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  return (
    <nav
      aria-label="Bottom navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--sidebar-bg)] backdrop-blur-[24px] saturate-[200%] border-t border-[var(--sidebar-border)] shadow-[0_-4px_20px_rgba(0,0,0,0.15)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch h-16">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex items-center justify-center py-1.5 transition-all duration-200 ${
                active
                  ? "text-white"
                  : "text-[var(--nav-text-color)] hover:text-[var(--nav-text-active-color)]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full transition-all duration-200 ${
                  active
                    ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] shadow-md shadow-[rgba(6,182,212,0.35)]"
                    : "active:scale-95"
                }`}
              >
                <Icon size={16} strokeWidth={active ? 2.5 : 1.75} />
                <span className="text-xs font-semibold">{label}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

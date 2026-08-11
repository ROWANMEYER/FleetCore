"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, ClipboardPlus, FileSpreadsheet, Shield } from "lucide-react";
import { useAuth } from "@/src/components/auth/AuthProvider";

/* ─── Mobile bottom tab bar (Android app) ─────────────────────────
   The phone app has four screens: Dashboard, Input, Admin and
   Sheets. This fixed bottom bar is the only navigation on phones;
   the desktop sidebar is rendered separately by Navigation.tsx.
   The Input tab also highlights the edit flow, which is reached
   from the input screen. The Admin tab is admin-only (regional
   users get the three core tabs) and stays highlighted on every
   /admin subpage. */
type Tab = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  /** Extra path prefixes that should keep this tab highlighted. */
  match?: readonly string[];
  /** Admin-only tab: hidden for regional users. */
  adminOnly?: boolean;
};

const TABS: readonly Tab[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  {
    href: "/operations/daily-planner/input",
    label: "Input",
    icon: ClipboardPlus,
    match: ["/operations/daily-planner/input", "/operations/daily-planner/edit"],
  },
  { href: "/admin", label: "Admin", icon: Shield, adminOnly: true },
  { href: "/operations/daily-planner/sheets", label: "Sheets", icon: FileSpreadsheet },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const isActive = (href: string, match?: readonly string[]) => {
    const paths = match ?? [href];
    return paths.some((p) => (p === "/dashboard" ? pathname === p : pathname.startsWith(p)));
  };

  const tabs = TABS.filter((tab) => !tab.adminOnly || user?.role === "admin");

  return (
    <nav
      aria-label="Bottom navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--sidebar-bg)] backdrop-blur-[24px] saturate-[200%] border-t border-[var(--sidebar-border)] shadow-[0_-4px_20px_rgba(0,0,0,0.15)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch h-16">
        {tabs.map(({ href, label, icon: Icon, match }) => {
          const active = isActive(href, match);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex items-center justify-center py-1 transition-all duration-200 ${
                active
                  ? "text-white"
                  : "text-[var(--nav-text-color)] hover:text-[var(--nav-text-active-color)]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span
                className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl transition-all duration-200 ${
                  active
                    ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] shadow-md shadow-[rgba(6,182,212,0.35)]"
                    : "active:scale-95"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
                <span className="text-[10px] font-semibold leading-none">{label}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

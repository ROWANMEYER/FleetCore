"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import {
  LayoutGrid,
  BarChart3,
  Shield,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  LogOut,
  CalendarDays,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { MobileTabBar } from "@/src/components/MobileTabBar";
import { useMobileChrome } from "@/src/components/MobileChromeContext";
import { BirthdayBell } from "@/src/components/notifications/BirthdayBell";

/* ─── Navigation items ─────────────────────────────────────────── */
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid, adminOnly: false },
  { href: "/operations", label: "Operations", icon: BarChart3, adminOnly: false },
  { href: "/admin", label: "Admin", icon: Shield, adminOnly: false },
  { href: "/all-regions", label: "All Regions", icon: BarChart3, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: false },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, adminOnly: false },
] as const;

/* ─── Custom hook for mounted check ────────────────────────────── */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);
  return mounted;
}

/* ─── Admin region switcher (Stage 4) ──────────────────────────── */
const REGION_OPTIONS: { value: "garden_route" | "eastern_cape" | "all"; label: string }[] = [
  { value: "all", label: "All Regions" },
  { value: "garden_route", label: "Garden Route" },
  { value: "eastern_cape", label: "Eastern Cape" },
];

function RegionSwitcher({ compact = false }: { compact?: boolean }) {
  const { user, regionFilter, setRegionFilter } = useAuth();
  if (user?.role !== "admin") return null;
  return (
    <select
      value={regionFilter}
      onChange={(e) => setRegionFilter(e.target.value as any)}
      title="View region"
      aria-label="Region filter"
      className={`settings-input rounded-md ${compact ? "max-w-[110px] text-xs" : "w-full text-xs"}`}
    >
      {REGION_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ─── Main navigation component ────────────────────────────────── */
export default function Navigation() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { minimized } = useMobileChrome();
  const [collapsed, setCollapsed] = useState(false);
  const mounted = useMounted();

  const isActive = useCallback(
    (href: string) => {
      if (href === "/dashboard") return pathname === href;
      return pathname.startsWith(href);
    },
    [pathname]
  );

  return (
    <>
      {/* ─── Mobile top bar + bottom tab bar (hidden while the sheets screen
             is minimized — only the route cards should remain visible) ─── */}
      {!minimized && (
        <header className="md:hidden fixed top-0 inset-x-0 z-40 h-14 flex items-center gap-3 px-4 glass-sidebar border-b border-[var(--sidebar-border)]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#0891B2] shadow-md shadow-[rgba(6,182,212,0.3)] shrink-0">
              <BarChart3 size={14} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="font-[var(--font-heading)] font-bold text-sm tracking-tight truncate">
              FleetCore
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <RegionSwitcher compact />
            {mounted && <ThemeToggleButton collapsed={false} iconOnly />}
          </div>
        </header>
      )}

      {/* ─── Mobile bottom tab bar (Dashboard + Input) ─────────── */}
      {!minimized && <MobileTabBar />}

      {/* ─── Sidebar (desktop only) ───────────────────────────── */}
      <aside
        aria-label="Navigation"
        className="hidden md:flex flex-col h-full glass-sidebar shrink-0 select-none transform-gpu transition-[width] duration-300 ease-in-out"
        style={{
          width: collapsed ? 64 : 256,
        }}
      >
        {/* ─── Brand header ─────────────────────────────────── */}
        <div className="flex items-center h-14 px-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0 overflow-hidden flex-1">
            {/* Logo mark — teal-to-blue gradient square with bar-chart icon */}
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-[#06B6D4] to-[#0891B2] shadow-lg shadow-[rgba(6,182,212,0.3)] shrink-0">
              <BarChart3 size={18} className="text-white" strokeWidth={2} />
            </div>
            {/* Brand text */}
            <span
              className="font-[var(--font-heading)] font-bold text-base tracking-tight whitespace-nowrap"
              style={{
                background: "linear-gradient(135deg, #06B6D4, #0891B2)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                transition: `opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)`,
                opacity: collapsed ? 0 : 1,
                maxWidth: collapsed ? 0 : 200,
                overflow: "hidden",
              }}
            >
              FleetCore
            </span>
          </div>
          <div className="ml-auto pl-2">
            <BirthdayBell />
          </div>
        </div>

        {/* ─── Divider ──────────────────────────────────────── */}
        <div className="mx-4 h-px bg-[var(--sidebar-border)] shrink-0" />

        {/* ─── Navigation items ─────────────────────────────── */}
        <nav className="flex-1 flex flex-col gap-3 px-3 py-5 overflow-y-auto scrollbar-hidden">
          {NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === "admin").map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  group relative flex items-center gap-3 px-3 py-2.5 rounded-xl
                  transition-all duration-200
                  ${
                    active
                      ? "nav-item-active text-white font-bold"
                      : "text-[var(--nav-text-color)] hover:text-[var(--nav-text-active-color)]"
                  }
                `}
                title={collapsed ? item.label : undefined}
              >
                {/* Icon */}
                <div className="flex items-center justify-center w-5 h-5 shrink-0">
                  <Icon
                    size={18}
                    strokeWidth={active ? 2.5 : 1.5}
                    className={active ? "text-white" : "text-[var(--nav-icon-color)] group-hover:text-[var(--nav-icon-active-color)]"}
                  />
                </div>

                {/* Label */}
                <span
                  className="text-sm whitespace-nowrap"
                  style={{
                    transition: `opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), max-width 0.25s cubic-bezier(0.4, 0, 0.2, 1)`,
                    opacity: collapsed ? 0 : 1,
                    maxWidth: collapsed ? 0 : 200,
                    overflow: "hidden",
                  }}
                >
                  {item.label}
                </span>

                {/* Collapsed tooltip */}
                {collapsed && (
                  <div className="absolute left-full ml-3 px-3 py-1.5 rounded-lg bg-[var(--foreground)] text-[var(--background)] text-xs font-medium whitespace-nowrap shadow-xl z-50 animate-fade-up-sm border border-[var(--card-border)] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">
                    {item.label}
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[var(--foreground)]" />
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* ─── User block ──────────────────────────────────── */}
        {user && (
          <div className="border-t border-[var(--sidebar-border)] px-3 py-3 shrink-0">
            <div
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${
                collapsed ? "justify-center" : "justify-between"
              }`}
            >
              {!collapsed && (
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--foreground)] truncate">
                    {user.email}
                  </p>
                  <p className="text-[10px] text-[var(--nav-text-color)] capitalize">
                    {user.role}
                    {user.role === "regional" && user.region
                      ? ` · ${user.region.replace("_", " ")}`
                      : ""}
                  </p>
                </div>
              )}
              <div className="flex flex-col gap-1.5 shrink-0">
                {!collapsed && <RegionSwitcher />}
                <button
                  onClick={() => logout()}
                  title="Log out"
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--nav-text-color)] hover:text-red-500 hover:bg-[var(--card-bg)] transition-all duration-150 shrink-0"
                >
                  <LogOut size={16} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Footer — Theme toggle + Collapse ─────────────── */}
        <div className="border-t border-[var(--sidebar-border)] px-3 py-3 shrink-0">
          {mounted ? (
            <div className="flex items-center justify-between">
              {/* Theme toggle */}
              <ThemeToggleButton collapsed={collapsed} />

              {/* Collapse toggle */}
              <button
                onClick={() => setCollapsed((c) => !c)}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--nav-text-color)] hover:text-[var(--nav-text-active-color)] hover:bg-[var(--card-bg)] transition-all duration-150"
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? (
                  <ChevronRight size={16} strokeWidth={1.5} />
                ) : (
                  <ChevronLeft size={16} strokeWidth={1.5} />
                )}
              </button>
            </div>
          ) : (
            <div className="h-8" />
          )}
        </div>
      </aside>
    </>
  );
}

/* ─── Theme toggle button (internal) ───────────────────────────── */
function ThemeToggleButton({
  collapsed,
  iconOnly = false,
}: {
  collapsed: boolean;
  iconOnly?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  if (!mounted) return null;

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[var(--nav-text-color)] hover:text-[var(--nav-text-active-color)] hover:bg-[var(--card-bg)] transition-all duration-150"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {/* Icon */}
      <div className="flex items-center justify-center w-5 h-5 shrink-0">
        {isDark ? <Sun size={15} strokeWidth={1.5} /> : <Moon size={15} strokeWidth={1.5} />}
      </div>

      {/* Label */}
      {!collapsed && !iconOnly && (
        <span className="text-xs font-medium whitespace-nowrap">{isDark ? "Light mode" : "Dark mode"}</span>
      )}
    </button>
  );
}

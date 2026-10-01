"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
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
  RefreshCw,
  User,
  Globe,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { MobileTabBar } from "@/src/components/MobileTabBar";
import { useMobileChrome } from "@/src/components/MobileChromeContext";

/* ─── Navigation items ─────────────────────────────────────────── */
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid, adminOnly: false },
  { href: "/operations", label: "Operations", icon: BarChart3, adminOnly: false },
  { href: "/admin", label: "Admin", icon: Shield, adminOnly: false },
  { href: "/all-regions", label: "All Regions", icon: BarChart3, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: false },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, adminOnly: false },
] as const;

/* ─── Sidebar artwork geometry ───────────────────────────────────────
   alr-truck-sidebar.png is 724×2171 (3:1) drawn across the 256px rail,
   so it renders 768px tall. The truck sits in the upper two thirds and is
   positioned purely for how the vehicle reads: ART_TOP is where the layer
   fades in and ART_LIFT is how far the render is held off the sidebar floor
   (78px, which puts the whole print above the control bar on the reference
   viewport).

   The words "PEOPLE / FREIGHT / SOLUTIONS / ALWAYS FURTHER" are baked into
   the PNG at source rows 1752–2032. Because they live in a photograph, they
   move and clip with every crop — which is why ART_LIFT kept having to be
   retuned. They are now hidden by ART_SCUT, a navy ramp over the bottom of
   the layer, and the same wording is rendered as real markup (see BRAND_*) so
   the branding is laid out against the UI rather than the image. The truck
   can now be positioned for the truck and the words for the words. */
const ART_RENDER_H = 768; // 724 × 2171 artwork drawn at the 256px rail width
const ART_TOP = "31%"; // where the fade-in begins (was 38%)
const ART_LIFT = 78; // px the artwork sits above the sidebar floor
const ART_FLOOR = "#02203b"; // the artwork's own bottom-edge colour
/* Softer and longer than the old 26% ramp, so the sky washes in behind
   Settings and Calendar with no hard edge where the layer begins. */
const ART_FADE =
  "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.10) 15%, rgba(0,0,0,0.38) 30%, #000 48%)";
const ART_WASH =
  "linear-gradient(to bottom, rgba(6,14,28,0.55) 0%, rgba(6,14,28,0.22) 16%, rgba(6,14,28,0) 34%)";
/* Hides the branding printed into the PNG (rows 1752–2032 of 2171) without
   touching the truck or the road above it. Starts fully transparent in the
   empty road, then ramps into ART_FLOOR so the layer still reaches the
   sidebar floor with no seam and no rectangular edge. */
const ART_SCUT_H = 300; // px of artwork covered by the bottom ramp
const ART_SCUT =
  "linear-gradient(to bottom, rgba(2,32,59,0) 0%, rgba(2,32,59,0.45) 34%, #02203b 62%, #02203b 100%)";

/* ─── Sidebar branding (rendered, not part of the artwork) ───────────
   Independent of the image, so it holds the same position at any viewport
   height. BRAND_BOTTOM is measured from the sidebar floor and is set to
   clear the top of the control bar (40px tall, inset 10px) by ~18px. */
const BRAND_BOTTOM = 68; // px from the sidebar floor
const BRAND_LINE_H = 19; // px per stacked line, keeps the block compact

/* ─── Custom hook for mounted check ────────────────────────────── */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);
  return mounted;
}

/* ─── Region switcher (Stage 4) ─────────────────────────────────────
   Rendered inside the mobile chrome and inside the sidebar's Region
   popover. The selector, its options and its permission gate are
   unchanged — only where it lives in the chrome moved. */
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

/* ─── Hover tooltip ────────────────────────────────────────────────
   Every control in the bottom bar is icon-only, so each one needs a
   label. Tooltips escape to the right of the rail so they never cover
   the control they describe, and they are hover/focus driven only —
   pointer-events stay off so they can never eat a click. */
function SidebarTip({ label, danger = false }: { label: string; danger?: boolean }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[rgba(6,14,28,0.94)] px-2.5 py-1.5 text-[11px] font-medium shadow-xl backdrop-blur-md opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      style={danger ? { color: "#fca5a5" } : { color: "rgba(255,255,255,0.9)" }}
    >
      {label}
    </div>
  );
}

/* ─── Icon-only control for the bottom bar ───────────────────────── */
function IconBarButton({
  label,
  onClick,
  size = "md",
  danger = false,
  title,
  className = "",
  buttonRef,
  trigger,
  children,
}: {
  label: string;
  onClick?: () => void;
  size?: "md" | "sm";
  danger?: boolean;
  /* Native tooltip. Only used where an external audit script targets
     the button by title; the styled tooltip above is what users see. */
  title?: string;
  className?: string;
  /* Anchors the popover that this control opens. */
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  trigger?: { open: boolean; controls: string };
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={onClick}
      aria-label={label}
      title={title}
      aria-haspopup={trigger ? "dialog" : undefined}
      aria-expanded={trigger ? trigger.open : undefined}
      aria-controls={trigger ? trigger.controls : undefined}
      className={`group relative flex shrink-0 items-center justify-center rounded-lg transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#06B6D4] ${
        size === "md" ? "h-8 w-8" : "h-6 w-6"
      } ${
        danger
          ? "text-white/65 hover:bg-white/10 hover:text-red-300"
          : "text-white/65 hover:bg-white/10 hover:text-white"
      } ${className}`}
    >
      {children}
      <SidebarTip label={label} danger={danger} />
    </button>
  );
}

/* ─── Sidebar popover ──────────────────────────────────────────────
   Portalled to <body> on purpose: .glass-sidebar sets backdrop-filter
   and the rail sets transform-gpu, and either one makes the sidebar a
   containing block for position: fixed — an in-rail popover would be
   positioned against the rail instead of the viewport, and clipped by
   the nav scroller. Kept mounted with `hidden` while closed so the
   panel keeps its identity (and its Region <select> stays in the DOM)
   without ever being reachable by keyboard or pointer. */
function SidebarPopover({
  id,
  open,
  anchorRef,
  onClose,
  children,
}: {
  id: string;
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const mounted = useMounted();

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const w = panelRef.current?.offsetWidth || 232;
      const h = panelRef.current?.offsetHeight || 0;
      const left = Math.max(12, Math.min(anchor.right + 10, window.innerWidth - w - 12));
      const centred = anchor.top + anchor.height / 2 - h / 2;
      const top = h ? Math.max(12, Math.min(centred, window.innerHeight - h - 12)) : anchor.top;
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label={id === "sidebar-profile-popover" ? "Account" : "Region"}
      hidden={!open}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0 }}
      className="fixed z-[100] w-[232px] rounded-xl border border-white/10 bg-[rgba(6,14,28,0.94)] p-3 shadow-2xl backdrop-blur-xl animate-fade-up-sm"
    >
      {children}
    </div>,
    document.body
  );
}

/* ─── Main navigation component ────────────────────────────────── */
export default function Navigation() {
  const pathname = usePathname();
  const { user, logout, regionFilter } = useAuth();
  const { minimized } = useMobileChrome();
  const [collapsed, setCollapsed] = useState(false);
  const [popover, setPopover] = useState<"profile" | "region" | null>(null);
  const profileRef = useRef<HTMLButtonElement>(null);
  const regionRef = useRef<HTMLButtonElement>(null);
  const mounted = useMounted();

  const isActive = useCallback(
    (href: string) => {
      if (href === "/dashboard") return pathname === href;
      return pathname.startsWith(href);
    },
    [pathname]
  );

  const isAdmin = user?.role === "admin";
  const regionLabel =
    REGION_OPTIONS.find((o) => o.value === regionFilter)?.label ?? "All Regions";
  const closePopover = useCallback(() => setPopover(null), []);
  const togglePopover = useCallback(
    (which: "profile" | "region") => setPopover((p) => (p === which ? null : which)),
    []
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
            <RefreshButton />
            {mounted && <ThemeToggleButton />}
          </div>
        </header>
      )}

      {/* ─── Mobile bottom tab bar (Dashboard + Input) ─────────── */}
      {!minimized && <MobileTabBar />}

      {/* ─── Sidebar (desktop only) ───────────────────────────── */}
      <aside
        aria-label="Navigation"
        className="hidden md:flex flex-col h-full relative glass-sidebar shrink-0 select-none transform-gpu transition-[width] duration-300 ease-in-out"
        style={{
          // Collapsed rail fits the enlarged nav icons (icon-only — the
          // wordmark fades out, see the brand header below).
          width: collapsed ? 72 : 256,
        }}
      >
        {/* ─── Artwork layer (expanded only) ─────────────────────────
            Decorative background fading in from 31% down. z-0, behind the
            navigation (z-10) and the control bar (z-20). Drawn at its
            natural 256px-rail height and lifted ART_LIFT px off the floor
            so the printed branding clears the bar; the strip it vacates is
            filled with the artwork's own bottom colour, so there is no seam
            and no hard line where the layer begins. pointer-events-none. */}
        {!collapsed && (
          <div
            className="absolute inset-x-0 bottom-0 z-0 overflow-hidden pointer-events-none"
            style={{ top: ART_TOP }}
          >
            <div
              className="absolute inset-0"
              style={{ WebkitMaskImage: ART_FADE, maskImage: ART_FADE }}
            >
              {/* Continues the artwork's flat road colour across the lifted gap */}
              <div
                className="absolute inset-x-0 bottom-0"
                style={{ height: ART_LIFT, background: ART_FLOOR }}
              />
              <div
                className="absolute inset-x-0 overflow-hidden"
                style={{ height: ART_RENDER_H, bottom: -ART_LIFT }}
              >
                <Image
                  src="/images/branding/alr-truck-sidebar.png"
                  alt="Anton Le Roux truck on the open road"
                  fill
                  sizes="256px"
                  draggable={false}
                  className="object-cover"
                  style={{ objectPosition: "center bottom" }}
                />
              </div>
              {/* Very subtle dark wash behind the nav rows over the sky band */}
              <div className="absolute inset-0" style={{ background: ART_WASH }} />
            </div>
            {/* Bottom ramp — covers only the branding baked into the PNG. Sits
                outside the mask above, so the words are gone outright rather
                than dimmed, and the layer still meets the floor in ART_FLOOR. */}
            <div
              className="absolute inset-x-0 bottom-0"
              style={{ height: ART_SCUT_H, background: ART_SCUT }}
            />
          </div>
        )}

        {/* ─── Brand header (no bell — the FleetCore logo is the header) ── */}
        <div className="relative z-10 flex items-center h-14 px-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0 overflow-hidden">
            {/* Logo mark — teal-to-blue gradient square with bar-chart icon */}
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-[#06B6D4] to-[#0891B2] shadow-lg shadow-[rgba(6,182,212,0.3)] shrink-0">
              <BarChart3 size={18} className="text-white" strokeWidth={2} />
            </div>
            {/* Brand text — fades out when the sidebar is collapsed so the
                minimized rail shows only the logo mark */}
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
        </div>

        {/* ─── Divider ──────────────────────────────────────── */}
        <div className="relative z-10 mx-4 h-px bg-[var(--sidebar-border)] shrink-0" />

        {/* ─── Navigation items ─────────────────────────────── */}
        <nav className="relative z-10 flex-1 min-h-0 flex flex-col gap-3 px-3 py-5 overflow-y-auto scrollbar-hidden">
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
                ${collapsed ? "justify-center gap-0" : ""}
                ${
                  active
                    ? "nav-item-active text-white font-bold"
                    : "text-[var(--nav-text-color)] hover:text-[var(--nav-text-active-color)]"
                }
              `}
                title={collapsed ? item.label : undefined}
              >
                {/* Icon — enlarged (22px in a 24px box) */}
                <div className="flex items-center justify-center w-6 h-6 shrink-0">
                  <Icon
                    size={22}
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

                {/* Collapsed tooltip — label only, no pointer arrow */}
                {collapsed && (
                  <div className="absolute left-full ml-3 px-3 py-1.5 rounded-lg bg-[var(--foreground)] text-[var(--background)] text-xs font-medium whitespace-nowrap shadow-xl z-50 animate-fade-up-sm border border-[var(--card-border)] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">
                    {item.label}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* ─── Branding — real markup, positioned against the UI ────────
            Replaces the words baked into the artwork (which ART_SCUT now
            hides). Anchored to the sidebar floor, so it clears the control
            bar at any viewport height and needs no artwork tuning. Hidden
            with the rest of the expanded rail — the 72px rail has no room
            for it. pointer-events-none: it can overlap the nav's scroll
            area and must never intercept a link. */}
        {!collapsed && (
          <div
            className="pointer-events-none absolute left-4 z-20 select-none"
            style={{ bottom: BRAND_BOTTOM }}
            aria-hidden="true"
          >
            <p
              className="font-[var(--font-heading)] font-semibold uppercase text-white/80"
              style={{ fontSize: 12, letterSpacing: "0.22em", lineHeight: `${BRAND_LINE_H}px` }}
            >
              People
              <br />
              Freight
              <br />
              Solutions
            </p>
            <p
              className="font-[var(--font-heading)] font-bold uppercase text-[#06B6D4]"
              style={{ fontSize: 11.5, letterSpacing: "0.22em", lineHeight: `${BRAND_LINE_H}px`, marginTop: 4 }}
            >
              Always Further
            </p>
          </div>
        )}

        {/* ─── Control bar — one icon-only cluster floating over the artwork ──
            Deliberately a single translucent container with no dividers: the
            account, region, theme and logout affordances are icon-only, and the
            chevron trails at the far right so it stays subordinate. Above the
            branding (z-30) so the words can never sit on top of a control. */}
        <div className="relative z-30 shrink-0 px-3 pb-2.5">
          <div
            className={`flex items-center rounded-xl border border-white/10 bg-[rgba(6,14,28,0.45)] px-1.5 py-1 backdrop-blur-md ${
              collapsed ? "flex-col gap-1 px-1 py-1.5" : "gap-1.5"
            }`}
          >
            <div className={`flex items-center gap-1 ${collapsed ? "flex-col" : ""}`}>
              {/* Admin / profile — the email and role live in its popover now,
                  so they never sit permanently in the rail. */}
              {user && (
                <IconBarButton
                  label={isAdmin ? "Admin" : "Profile"}
                  onClick={() => togglePopover("profile")}
                  buttonRef={profileRef}
                  trigger={{ open: popover === "profile", controls: "sidebar-profile-popover" }}
                >
                  <User size={16} strokeWidth={1.75} />
                </IconBarButton>
              )}

              {/* Region — admin only, mirroring RegionSwitcher's own gate */}
              {isAdmin && (
                <IconBarButton
                  label={`Region: ${regionLabel}`}
                  onClick={() => togglePopover("region")}
                  buttonRef={regionRef}
                  trigger={{ open: popover === "region", controls: "sidebar-region-popover" }}
                >
                  <Globe size={16} strokeWidth={1.75} />
                </IconBarButton>
              )}

              <ThemeToggleButton variant="bar" />

              <IconBarButton label="Log out" danger onClick={() => logout()}>
                <LogOut size={16} strokeWidth={1.75} />
              </IconBarButton>
            </div>

            {!collapsed && <div className="flex-1" />}

            {/* Collapse — kept out of the primary group and dimmed so the four
                controls above stay the thing you reach for. */}
            <IconBarButton
              label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              size="sm"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setCollapsed((c) => !c)}
              className="opacity-55 hover:opacity-100"
            >
              {collapsed ? (
                <ChevronRight size={14} strokeWidth={1.75} />
              ) : (
                <ChevronLeft size={14} strokeWidth={1.75} />
              )}
            </IconBarButton>
          </div>
        </div>
      </aside>

      {/* ─── Popovers (portalled — see SidebarPopover) ─────────── */}
      <SidebarPopover
        id="sidebar-profile-popover"
        open={popover === "profile"}
        anchorRef={profileRef}
        onClose={closePopover}
      >
        {user && (
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{user.email}</p>
            <p className="mt-1 text-[11px] capitalize text-white/55">
              {user.role}
              {user.role === "regional" && user.region
                ? ` · ${user.region.replace("_", " ")}`
                : ""}
            </p>
          </div>
        )}
      </SidebarPopover>

      <SidebarPopover
        id="sidebar-region-popover"
        open={popover === "region"}
        anchorRef={regionRef}
        onClose={closePopover}
      >
        <p className="mb-2 text-[11px] font-medium text-white/55">Region</p>
        <RegionSwitcher />
      </SidebarPopover>
    </>
  );
}

/* ─── Refresh button (mobile top bar) ─────────────────────────────
   PWA users have no browser refresh, so the top bar carries a
   refresh icon. It spins briefly for feedback, then reloads the page
   so every screen re-fetches fresh data. */
function RefreshButton() {
  const [spinning, setSpinning] = useState(false);

  const refresh = () => {
    if (spinning) return;
    setSpinning(true);
    setTimeout(() => window.location.reload(), 450);
  };

  return (
    <button
      onClick={refresh}
      title="Refresh page"
      aria-label="Refresh page"
      className="flex items-center justify-center px-2 py-1.5 rounded-lg text-[var(--nav-text-color)] hover:text-[var(--nav-text-active-color)] hover:bg-[var(--card-bg)] transition-all duration-150 shrink-0"
    >
      <div className="flex items-center justify-center w-5 h-5 shrink-0">
        <RefreshCw size={15} strokeWidth={1.75} className={spinning ? "animate-spin" : ""} />
      </div>
    </button>
  );
}

/* ─── Theme toggle button (internal) ─────────────────────────────────
   Two presentations: "bar" for the sidebar control cluster (dark navy
   glass palette, hover tooltip, never unmounted so the bar keeps a stable
   width) and the default for the mobile top bar (design tokens). Both
   show the icon for the theme you would switch *to*. */
function ThemeToggleButton({ variant = "chrome" }: { variant?: "bar" | "chrome" }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  const isDark = mounted && theme === "dark";
  const label = isDark ? "Light mode" : "Dark mode";

  if (variant === "chrome") {
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[var(--nav-text-color)] hover:text-[var(--nav-text-active-color)] hover:bg-[var(--card-bg)] transition-all duration-150 shrink-0"
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        <div className="flex items-center justify-center w-5 h-5 shrink-0">
          {mounted && (isDark ? <Sun size={15} strokeWidth={1.5} /> : <Moon size={15} strokeWidth={1.5} />)}
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="group relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/65 transition-colors duration-150 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#06B6D4]"
    >
      {mounted && (isDark ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />)}
      <SidebarTip label={label} />
    </button>
  );
}

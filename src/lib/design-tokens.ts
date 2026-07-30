/**
 * FleetCore Design Tokens
 *
 * Source of truth for all visual tokens used across the app.
 * Import these values to ensure consistent styling between sidebar,
 * navigation, and all screen-level components.
 *
 * ─── Usage ──────────────────────────────────────────────────────────
 *   import { tokens } from "@/src/lib/design-tokens";
 *
 *   // Tailwind classes
 *   className={tokens.btn.primary}
 *
 *   // CSS variable string
 *   className={`bg-[${tokens.color.primary}]`}
 */

// ─── Color Palette ──────────────────────────────────────────────────
export const palette = {
  /** Primary teal — main accent */
  teal: "#06B6D4",
  /** Darker teal — gradient end, hover states */
  tealDark: "#0891B2",
  /** Light teal — highlights, glow */
  tealLight: "#22D3EE",
  /** Slate-based neutrals */
  slate: {
    50: "#F8FAFC",
    100: "#F1F5F9",
    200: "#E2E8F0",
    300: "#CBD5E1",
    400: "#94A3B8",
    500: "#64748B",
    600: "#475569",
    700: "#334155",
    800: "#1E293B",
    900: "#0F172A",
    950: "#0B1220",
  },
  /** Status colors */
  status: {
    green: "#10B981",
    amber: "#F59E0B",
    red: "#EF4444",
    purple: "#8B5CF6",
    blue: "#3B82F6",
  },
} as const;

// ─── Table Row Tokens ──────────────────────────────────────────────
export const tableRow = {
  /** Even row background (zebra stripe) */
  even: "bg-[var(--table-row-even)]",
  /** Odd row background (zebra stripe) */
  odd: "bg-[var(--table-row-odd)]",
  /** Row hover state */
  hover: "hover:bg-[var(--table-row-hover)]",
  /** Header row background */
  header: "bg-[var(--table-row-header)]",
  /** Domain-semantic highlight (MTO Forestry, shipment refs) */
  highlightBg: "bg-[var(--table-highlight-bg)]",
  /** Domain-semantic highlight text */
  highlightText: "text-[var(--table-highlight-text)]",
  /** Editable cell hover (indicates clickable/editable) */
  editableHover: "hover:bg-[rgba(6,182,212,0.06)]",
} as const;

// ─── Gradient Definitions ──────────────────────────────────────────
export const gradients = {
  /** Primary teal-to-blue gradient — used for active nav items, primary buttons, logos */
  primary: "bg-gradient-to-br from-[#06B6D4] to-[#0891B2]",
  /** Soft primary for subtle backgrounds */
  primarySoft: "bg-gradient-to-br from-[rgba(6,182,212,0.12)] to-[rgba(6,182,212,0.04)]",
  /** Glass surface for cards */
  glass: "bg-[var(--card-bg)] backdrop-blur-[16px] saturate-[180%]",
} as const;

// ─── Shadow Definitions ────────────────────────────────────────────
export const shadows = {
  /** Active nav item / primary button glow */
  primary: "shadow-lg shadow-[rgba(6,182,212,0.3)]",
  /** Card shadow (elevation 1) */
  card: "shadow-sm",
  /** Card shadow (elevation 2) */
  cardHover: "shadow-md",
  /** Sidebar nav item */
  nav: "",
  /** Tooltip / dropdown */
  dropdown: "shadow-xl",
} as const;

// ─── Border Radius ─────────────────────────────────────────────────
export const radii = {
  /** Navigation items, cards, large surfaces */
  xl: "rounded-xl",
  /** Buttons, inputs, compact cards */
  lg: "rounded-lg",
  /** Badges, chips, small indicators */
  md: "rounded-md",
  /** Full pill shape */
  full: "rounded-full",
} as const;

// ─── Typography ────────────────────────────────────────────────────
export const typography = {
  /** Navigation item label */
  nav: "text-sm font-medium",
  /** Active navigation item */
  navActive: "text-white font-bold",
  /** Card title / section header */
  sectionTitle: "text-[11px] font-bold uppercase tracking-wider",
  /** KPI label */
  kpiLabel: "text-[10px] font-semibold uppercase tracking-wider",
  /** KPI value */
  kpiValue: "text-lg font-black",
  /** Data table header */
  tableHeader: "text-[11px] font-bold uppercase tracking-wider",
  /** Data table cell */
  tableCell: "text-[12px]",
  /** Button label */
  button: "text-xs font-bold",
  /** Small helper text */
  caption: "text-[10px]",
} as const;

// ─── Spacing ───────────────────────────────────────────────────────
export const spacing = {
  /** Nav item padding */
  navItem: "px-3 py-2.5",
  /** Card inner padding */
  card: "p-3",
  /** Card inner padding (large) */
  cardLg: "p-4",
  /** Section gap */
  sectionGap: "gap-3",
  /** Compact gap */
  compactGap: "gap-1.5",
  /** Grid gap between stat cards */
  statGridGap: "gap-1.5",
} as const;

// ─── Base single tokens (no circular deps) ──────────────────────────
/** Focus ring for inputs/buttons */
export const focusRing = "focus:outline-none focus:ring-2 focus:ring-[#06B6D4] focus:border-transparent";

// ─── Compound Tokens (pre-built Tailwind class strings) ────────────
export const tokens = {
  /** Active nav item / primary button — full gradient pill */
  primary: `${gradients.primary} ${shadows.primary} ${radii.xl} ${typography.navActive}`,

  /** Secondary / inactive nav item */
  secondary: `${radii.xl} text-[var(--nav-text-color)] hover:text-[var(--nav-text-active-color)]`,

  /** Stat / KPI card — compact glass surface */
  statCard: `${radii.xl} border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm p-3`,

  /** Stat / KPI card (compact bar variant) */
  statCardCompact: `${radii.lg} border border-[var(--card-border)] bg-[var(--card-bg)]/60 px-3 py-2`,

  /** Data table header cell */
  tableHeaderCell: `px-2 py-2 ${radii.xl} border-r border-[var(--card-border)] last:border-r-0 flex items-center`,
  /** 
   * Data table header row — 
   * Note: use full class string since gradient on header is not appropriate
   * Use palette slate-200 instead
   */
  tableHeaderRow: `bg-[var(--table-row-header)] border-b-2 border-[var(--card-border)]`,

  /** Interactive link (truck/load number) */
  link: "text-[#06B6D4] font-medium underline cursor-pointer hover:text-[#0891B2]",

  /** Primary button (gradient pill) */
  btn: {
    primary: `${gradients.primary} ${shadows.primary} ${radii.lg} text-white ${typography.button} px-3 py-2 ${focusRing}`,
    secondary: `${radii.lg} border border-[var(--card-border)] bg-[var(--card-bg)]/60 ${typography.button} text-[var(--foreground)] hover:bg-[var(--card-bg)] ${focusRing}`,
    ghost: `${radii.lg} ${typography.button} text-[var(--nav-text-color)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)]`,
    danger: `${radii.lg} border border-red-200 text-red-600 ${typography.button} hover:bg-red-50`,
  },

  /** Input fields */
  input: `${radii.lg} border border-[var(--card-border)] bg-[var(--card-bg)] px-2 text-xs text-[var(--foreground)] ${focusRing}`,

  /** Toggle / tab group container */
  toggleGroup: `${radii.lg} border border-[var(--card-border)] bg-[var(--card-bg)]/60 p-0.5 flex items-center`,

  /** Active toggle tab (matches sidebar active nav) */
  toggleActive: `${gradients.primary} text-white ${shadows.primary} ${radii.md}`,

  /** Inactive toggle tab */
  toggleInactive: `text-[var(--nav-text-color)] hover:text-[var(--nav-text-active-color)]`,
} as const;

export default tokens;

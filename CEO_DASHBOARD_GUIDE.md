# CEO Dashboard — Guide

> **Refreshed**: 2026-08-08 — matches the current implementation.
> The dashboard is a single page (`src/app/dashboard/page.tsx`) with inline
> sections and a drill-down panel. Region-scoped, ZAR-formatted, mobile-aware.

## Overview

The CEO dashboard provides real-time business intelligence for fleet
operations — profitability, efficiency, and operational quality — built on
Convex analytics queries and rendered with recharts. Every KPI and row is
tappable and drills down to the supporting routes.

## Dashboard Structure

### 1. Header & Filters

- **Region master filter** (`RegionMasterFilter`): the region is the *master
  filter* for every number on the screen.
  - Admin: dropdown — All Regions / Garden Route / Eastern Cape (synced with
    the sidebar switcher).
  - Regional user: read-only badge — data is server-locked to their region.
- **Date filter bar** (`FilterBar`) with three modes:
  - **Day** — pick a single date
  - **Month** — month picker with ‹ › navigation
  - **Range** — start → end date inputs
  - Default: current month.

### 2. Upcoming Birthdays Card

- `BirthdaysCard` (via `useBirthdays`) — driver birthdays in the next 7 days,
  dismissible per user per year, with today's birthdays highlighted.

### 3. Period KPIs

Five cards, each tappable to drill down:

| KPI | Source | Drill-down |
|---|---|---|
| **Revenue** | `getExecutiveSummary.totalRevenue` | All routes this period |
| **Routes** | `totalRoutes` | All routes this period |
| **Loads** | `totalLoads` | Loads breakdown |
| **Total KM** | `totalKm` | KM breakdown |
| **Completion** | `completionRate` (green ≥80%, yellow <80%) | Completed routes |

### 4. Revenue by Day

- Progress-bar list of daily revenue across the selected range
- Tap a day → drill down to `Routes on {date}`

### 5. Top Clients

- Top 8 clients by revenue with `% of total` progress bars and load counts
- Tap a client → drill down to that client's routes

### 6. Month-to-Month Comparison

- Two month selectors (defaults: last month vs current month)
- Powered by `getMonthToMonthComparison` — revenue/loads/KM deltas

### 7. Drill-Down Panel

Opened by tapping any KPI, day, or client:

- **Header**: breadcrumb ("← Back to Range") when drilled from a period to a date
- **Summary strip**: Routes · Revenue · KM + an **Analytics** button
- **Route list**: truck/trailer, status badge (completed/locked/planned),
  date/driver/km, revenue, loads, notes; **edit** (slide-in `EditRouteForm`)
  and **delete** (confirm dialog) per route
- **Analytics side panel** (toggled via the Analytics card):
  - KPI cards with progress bars — Routes, Revenue, Distance, Revenue/KM
  - **Daily Revenue Trend** line chart (click a point to drill into that day)
  - **Routes per Day** bar chart (click a bar to drill into that day)
  - Averages — Avg Revenue, Avg Distance, Routes/Day
  - Per-chart **Filter by Client** toggles

## Backend Analytics Queries (convex/dashboard.ts)

| Query | Purpose |
|---|---|
| `getExecutiveSummary` | Revenue, routes, loads, km, completion rate for a period |
| `getCustomerAnalytics` | Top customers by revenue + counts |
| `getRevenueOverTime` | Daily revenue series |
| `getMonthToMonthComparison` | Month-over-month revenue/loads/km deltas |
| `getDashboardLoadsSummary` / `getLoadsOverTime` | Loads summaries |
| `getDashboardRevenueSummary` / `getRevenueByTruck` | Revenue summaries / per-truck |
| `getRoutesByStatus` | Route counts by status |
| `getClientBreakdown` | Client revenue breakdown |
| `getFleetPerformance` | Truck-level efficiency |
| `getOperationalEfficiency` | Route/load efficiency metrics |

Period queries accept `{ startDate, endDate, token, region }`;
`getMonthToMonthComparison` instead takes `{ month1, month2, token, region }`
(months as `YYYY-MM`). Region is resolved server-side via
`resolveEffectiveRegion` — regional users never see other regions. Load
amounts are computed with `calculateLoadAmount` (flat/full → rate, else
qty × rate).

> **Notes**:
> - The drill-down panel reads `dailyRoutes.getForSheets` directly for the
>   route list. The legacy widget components (`dashboard/ceo/*`), the
>   `getFinancialHealth` query, and the old `dashboard/operations/*` files
>   (`LoadsTab.tsx`, `RevenueTab.tsx`, `KpiCard.tsx`, `DrillDownPanel.tsx`,
>   `EditRouteModal.tsx`) and `DashboardCard.tsx` were removed (2026-08-08) —
>   the current page renders all sections inline.

## KPI Thresholds (interpretation guidance)

### Revenue Efficiency
- **Healthy**: R/KM > R5, R/Load > R200
- **Warning**: R2–R5 per KM
- **Critical**: < R2/KM

### Operational Quality
- **Completion Rate Target**: 80%+
- **Loads Per Route**: 1.5+ (higher = better consolidation)
- **Average Route Length**: 200–500 km typical

### Customer Health
- **Concentration Ratio Target**: < 60% from top 10 customers
- Track unique customer growth month-over-month

### Fleet Efficiency
- **Utilization Rate**: Routes ÷ Total Trucks (target 0.7–0.9)
- **Revenue Per KM**: fleet-wide efficiency metric

## Data Flow

```
Convex Database (dailyRoutes, drivers, trucks, invoices, ...)
    ↓
Backend Queries (convex/dashboard.ts — region-scoped)
    ↓
Dashboard Page (useQuery → inline sections)
    ↓
Drill-down: dailyRoutes.getForSheets + Analytics panel (recharts)
```

## Mobile Behavior

- Sections render as **collapsible cards** on phones (`CollapsibleSection`) —
  title + summary + chevron; desktop shows all sections expanded.
- Drill-down panel is full-screen on mobile; analytics panel overlays it.
- Dashboard is one of the four phone app screens (bottom tab bar).

## Notes

- All dates use ISO format (YYYY-MM-DD); currency displayed in ZAR
  (`R 1 234` on the dashboard, `R 1 234,56` in exports/invoices).
- Dashboard defaults to the current month.
- `isDayMode` (theme-aware) drives light/dark-specific styling across the page.
- See `PROJECT_CONTEXT.md` §6 for the full dashboard query inventory.

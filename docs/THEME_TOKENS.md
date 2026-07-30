# FleetCore Theme Tokens

> Last updated: 2026-07-29

All theme tokens are defined in `src/app/globals.css` and referenced throughout the app via Tailwind's arbitrary value syntax (`var(--token-name)`). Two theme modes exist: `:root` (light) and `.dark` (dark), toggled by `next-themes`.

---

## 1. CSS Custom Properties (Design Tokens)

### 1.1 Core Surfaces

| Token | Light Value | Dark Value | Usage |
|---|---|---|---|
| `--background` | `#F0F4F8` | `#0B1220` | Page body background (set on `<body>`) |
| `--foreground` | `#0F172A` | `#E2E8F0` | Primary text color |
| `--card-bg` | `rgba(255,255,255,0.75)` | `rgba(15,23,42,0.65)` | Card/panel surface background |
| `--card-border` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.08)` | Card/panel borders, dividers, input borders |
| `--card-shadow` | multi-stop soft shadow | multi-stop shadow | Default card shadow |
| `--card-shadow-hover` | multi-stop shadow | multi-stop shadow | Card hover shadow |

**Tailwind usage:**
```tsx
className="text-[var(--foreground)]"      // Primary text
className="bg-[var(--card-bg)]"           // Card/panel background
className="border-[var(--card-border)]"   // Borders, dividers
className="shadow-[var(--card-shadow)]"   // Shadow (rare — use .glass-card instead)
```

### 1.2 Sidebar

| Token | Light Value | Dark Value | Usage |
|---|---|---|---|
| `--sidebar-bg` | `rgba(255,255,255,0.85)` | `rgba(11,18,32,0.88)` | Sidebar background |
| `--sidebar-border` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.06)` | Sidebar right border |
| `--nav-text-color` | `#475569` | `#94A3B8` | Secondary/tertiary text, nav links, labels, placeholders |
| `--nav-text-active-color` | `#0F172A` | `#F1F5F9` | Active nav item text |
| `--nav-icon-color` | `#64748B` | `#64748B` | Inactive nav icon color |
| `--nav-icon-active-color` | `#06B6D4` | `#22D3EE` | Active nav icon color |
| `--nav-item-active-bg` | teal gradient (12%) | teal gradient (15%) | Active nav item background |
| `--nav-item-active-indicator` | `#06B6D4` | `#06B6D4` | Active nav indicator dot glow |

**Tailwind usage:**
```tsx
className="text-[var(--nav-text-color)]"  // Secondary text, labels, descriptions
```

### 1.3 Primary / Accent Colors

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#06B6D4` | Primary teal |
| `--color-primary-dark` | `#0891B2` | Teal gradient end |
| `--color-primary-light` | `#22D3EE` | Teal highlight |
| `--color-accent-emerald` | `#10B981` | Success / active status |
| `--color-accent-amber` | `#F59E0B` | Warning |
| `--color-accent-red` | `#EF4444` | Error / danger |
| `--color-accent-purple` | `#8B5CF6` | Subcontractor / ownership badges |
| `--color-accent-teal` | `#14B8A6` | Secondary teal accent |

**Usage — status badges (semantic colors, NOT replaced by CSS vars):**
```tsx
// These are intentional semantic colors — keep hardcoded:
bg-green-100 text-green-800   // Success badge
bg-blue-100 text-blue-800     // Info badge
bg-red-100 text-red-800       // Error badge
bg-yellow-100 text-yellow-800 // Warning badge
```

**Usage — accent via inline styles (badge backgrounds):**
```tsx
style={{ backgroundColor: "var(--color-accent-purple)", color: "#fff" }}
style={{ backgroundColor: status === "inactive" ? "var(--card-border)" : "var(--color-accent-emerald)", color: "#fff" }}
```

---

## 2. Glass Utility Classes

Defined in `globals.css` — use these instead of manually applying `bg-[var(--card-bg)]` + `border-[var(--card-border)]` + backdrop blur.

### `glass-card`
Standard glass panel with blur, border, and shadow.
```tsx
<div className="glass-card rounded-xl p-4">
```
- `background: var(--card-bg)`
- `backdrop-filter: blur(16px) saturate(180%)`
- `border: 1px solid var(--card-border)`
- Hover: increases `box-shadow`

### `glass-card-premium`
Premium glass panel with larger radius and lift-on-hover.
```tsx
<div className="glass-card-premium p-6">
```
- Same as `glass-card` but:
  - `border-radius: 1rem`
  - Hover: `translateY(-1px)` + shadow increase

### `glass-sidebar`
Sidebar-specific glass with sidebar variables.
```
background: var(--sidebar-bg)
backdrop-filter: blur(24px) saturate(200%)
border-right: 1px solid var(--sidebar-border)
```

### `nav-item-active`
Active sidebar navigation pill — teal gradient with glow.
```
background: linear-gradient(135deg, #06B6D4, #0891B2) !important
box-shadow: teal glow
```
```tsx
<Link className={active ? "nav-item-active text-white" : "text-[var(--nav-text-color)]"} />
```

---

## 3. Component-Level Classes

### `settings-input`
Form input fields in the Settings page — glass-style with teal focus ring.
```tsx
<input className="settings-input" />
```
- `background: var(--card-bg)` + `border: var(--card-border)`
- Focus: teal border + teal ring glow

### `skeleton-shimmer`
Loading placeholder shimmer animation.
```tsx
<div className="skeleton-shimmer h-4 w-24 rounded" />
```

### `gradient-text`
Teal gradient text fill.
```tsx
<span className="gradient-text">FleetCore</span>
```

### `noise-overlay`
Fixed noise texture overlay across the entire viewport.
```tsx
<body className="noise-overlay">
```

---

## 4. Common Tailwind Patterns

### Teal Gradient Buttons (primary CTA)
```tsx
className="bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white hover:opacity-90 shadow-sm"
```

### Teal Active Toggle / Tab
```tsx
// Active state
className="bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-sm"
// Inactive state
className="text-[var(--nav-text-color)] hover:text-[var(--foreground)]"
```

### Form Inputs (non-settings pages)
```tsx
className="w-full h-10 px-3 rounded border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)]
  focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 focus:outline-none"
```

### Focus Ring Teal (form controls)
```tsx
focus:ring-[#06B6D4] focus:border-[#06B6D4]
```

### Dividers (between table rows, list items)
```tsx
divide-y divide-[var(--card-border)]
```

### Checkboxes / Radios
```tsx
className="h-4 w-4 text-[var(--foreground)] border-[var(--card-border)] rounded focus:ring-[#06B6D4]"
```

### Placeholder Text
```tsx
placeholder="Enter value" // Color inherits from text var or use:
placeholder-[var(--nav-text-color)]
```

### Page Headers
```tsx
<div className="glass-card-premium px-6 py-4 mb-6">
  <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
    Page Title
  </h1>
  <p className="text-sm text-[var(--nav-text-color)]">
    Description
  </p>
</div>
```

---

## 5. Animated Classes

| Class | Animation | Duration |
|---|---|---|
| `animate-fade-up` | fade + translateY(12px) | 0.5s |
| `animate-fade-up-sm` | fade + translateY(12px) | 0.35s |
| `animate-glow-pulse` | box-shadow pulse | 2s |
| `animate-glow-soft` | opacity pulse | 3s |
| `animate-shimmer` | gradient sweep (skeleton) | 1.5s |
| `animate-blob-drift` / `-reverse` / `-slow` | background blob drift | 20-35s |
| `animate-sidebar-item` | slide-in from left | 0.2s |
| `animate-pulse-indicator` | indicator dot glow | 2s |

**Usage:**
```tsx
<div className="animate-fade-up">Content fades in</div>
```

---

## 6. Scrollbar Classes

| Class | Description |
|---|---|
| `scrollbar-fleet` | Thin custom scrollbar (gray thumb, transparent track) |
| `scrollbar-hidden` | Completely hides scrollbar (IE/FF/Webkit) |

```tsx
<div className="overflow-y-auto scrollbar-fleet">
<div className="overflow-y-auto scrollbar-hidden">
```

---

## 7. Semantic Colors — DO NOT REPLACE

The following color classes carry semantic meaning and should **not** be replaced with CSS variables:

### Status Badges
```tsx
bg-green-100 text-green-800       // Completed / Active / Valid
bg-blue-100 text-blue-800         // Planned / Info
bg-gray-100 text-[var(--foreground)] // Locked
bg-red-100 text-red-800           // Invalid / Error
bg-yellow-100 text-yellow-800     // Pending / Warning
```

### Alert / Notification Boxes
```tsx
bg-green-50 border-green-200 text-green-800       // Success
bg-red-50 border-red-200 text-red-800             // Error
bg-amber-50 border-amber-200 text-amber-800       // Warning
bg-blue-50 border-blue-100 text-blue-800          // Info
```

### Import Status Tags
```tsx
bg-green-100 text-green-700 border-green-200   // New
bg-yellow-100 text-yellow-700 border-yellow-200 // Update
bg-red-100 text-red-600 border-red-200          // Skipped / Error
```

### Chart / Data Viz Colors
```tsx
// Gradient accents for KPI cards
from-slate-500/20 to-slate-100/10
from-blue-500/20 to-cyan-100/10
from-emerald-500/20 to-green-100/10
from-violet-500/20 to-fuchsia-100/10
from-amber-500/20 to-yellow-100/10
from-rose-500/20 to-red-100/10

// Chart color tokens (used in recharts)
text-blue-400, text-purple-400, text-yellow-400  // Legend/dot colors
bg-blue-600, bg-yellow-400                        // Chart bar/line colors
```

### Export Format Colors (text-label pairs)
```tsx
text-green-600  // xlsx
text-blue-600   // csv
text-yellow-600 // json
text-red-600    // pdf
```

---

## 8. Migration Reference

When writing new components or pages, use this mapping:

| Old Hardcoded | New CSS Variable |
|---|---|
| `text-gray-900` / `text-gray-700` / `text-slate-900` | `text-[var(--foreground)]` |
| `text-gray-600` / `text-gray-500` / `text-gray-400` | `text-[var(--nav-text-color)]` |
| `bg-white` / `bg-gray-50` / `bg-slate-50` | `bg-[var(--card-bg)]` |
| `border-gray-200` / `border-slate-700` | `border-[var(--card-border)]` |
| `dark:bg-gray-800` / `dark:bg-slate-900` | *(remove — var handles dark mode)* |
| `dark:text-gray-100` / `dark:text-slate-400` | *(remove — var handles dark mode)* |
| `divide-gray-200` | `divide-[var(--card-border)]` |
| `placeholder-gray-400` | `placeholder-[var(--nav-text-color)]` |
| `focus:ring-blue-500` / `focus:border-blue-500` | `focus:ring-[#06B6D4]` / `focus:border-[#06B6D4]` |
| `focus:ring-black` / `focus:border-black` | `focus:ring-[#06B6D4]` / `focus:border-[#06B6D4]` |
| `bg-black text-white` (nav active) | `nav-item-active text-white` |
| `className={isDayMode ? "bg-X" : "bg-Y"}` | `bg-[var(--card-bg)]` *(CSS var handles both)* |
| `text-black` (on radios/checkboxes) | `text-[var(--foreground)]` |

# FleetCore — driver birthdays feature spec

## Overview
Surface upcoming driver birthdays to the user across three touchpoints — a notification bell, a dismissible dashboard card, and a monthly calendar view — with a one-click WhatsApp message to wish the driver well. Birthdates are derived from each driver's existing South African ID number rather than stored separately.

## Data layer

### Birthdate derivation
South African ID numbers encode birthdate as the first 6 digits: `YYMMDD`.

```ts
function getBirthdayFromSAID(idNumber: string) {
  const yy = idNumber.slice(0, 2);
  const mm = idNumber.slice(2, 4);
  const dd = idNumber.slice(4, 6);
  const year = Number(yy) > (new Date().getFullYear() - 2000 - 16)
    ? `19${yy}`
    : `20${yy}`;
  return { month: Number(mm), day: Number(dd), year: Number(year) };
}
```
Countdown/calendar logic uses `month`/`day` only; `year` is only needed if age display is added later.

### Convex query: upcoming birthdays
- Input: `windowDays` (default 7)
- For each driver: compute `{month, day}` from ID number, compute `daysUntil` from today (handle year wraparound, e.g. Dec → Jan)
- Filter to `daysUntil <= windowDays`
- Sort ascending by `daysUntil`
- Return: `driverId, name, phoneNumber, month, day, daysUntil`

Same query powers the bell dropdown, the dashboard card, and the "Today" panel (the panel just filters client-side to `daysUntil === 0`).

### New table: `dismissedBirthdayAlerts`
- `userId`, `driverId`, `birthdayDate` (this year's occurrence, e.g. `2026-08-04`)
- Dismissal is per-user, per-driver, per-year — so it reappears next year and doesn't hide it for other users viewing the same account
- Card checks this table and excludes any driver already dismissed for the current year's date before rendering

## UI components

### 1. Notification bell
- Badge count = number of drivers returned by the 7-day query
- Click opens dropdown listing each driver: avatar/initials, name, "Today" / "In N days", and a "Wish" button
- Does not respect dismissal state — bell always shows the full 7-day window regardless of dashboard card dismissals

### 2. Dashboard birthday card
- Same list as the bell, minus anything in `dismissedBirthdayAlerts` for this user/year
- Per-driver ✕ to dismiss (writes to `dismissedBirthdayAlerts`)
- Card-level ✕ dismisses all currently-shown entries for the session/year in one action (optional — confirm if wanted)

### 3. "Today" panel
- Small stat-card style panel on the main dashboard, alongside existing metrics (e.g. active loads)
- Shows only exact-today birthdays with a cake icon; empty/hidden if none today

### 4. Calendar page (`/calendar`)
- Defaults to current month view, grid layout
- Birthdays plotted as a small badge on their date (icon + first name)
- Two tabs: "Birthdays" (active) and "Tasks" (disabled, labeled "soon") — placeholder for the future todo feature, no functionality yet
- Month navigation (prev/next)

### 5. WhatsApp "wish" button
- Click-to-chat link: `https://wa.me/<driverPhoneNumber>?text=<url-encoded prefilled message>`
- Opens in new tab, no WhatsApp Business API integration needed
- Phone numbers already exist in the backend alongside ID numbers

## Open decisions before/during build
- Exact wording of the prefilled WhatsApp message
- Whether the card-level "dismiss all" action is wanted, or per-driver dismissal only
- Whether calendar birthday badges should be clickable to jump straight to that driver's "wish" action

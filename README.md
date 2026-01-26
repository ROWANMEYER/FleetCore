# FleetCore

FleetCore is a production-focused fleet operations system designed for
daily route planning, load management, and operational reporting.

This project prioritizes:
- Stability over cleverness
- Predictability over premature optimization
- Progressive disclosure in the UI
- Explicit, intentional architecture

---

## 🔒 CURRENT PROJECT STATUS: LOCKED BASELINE

As of **2026-01-23**, FleetCore is in a **locked, production-ready state**.

This means:
- The system is stable
- The build passes
- Core UI patterns are finalized
- Architectural intent is documented

All work after this point is **feature-driven**, not cleanup-driven.

---

## ✅ VERIFIED BASELINE (LOCKED)

The following have been explicitly verified and are considered stable:

- TypeScript strict mode enabled (0 errors)
- Production build passes
- Sheets table uses progressive disclosure:
  - Collapsed summary rows
  - Chevron-based expansion
  - Full detail cards on demand
- Status + Risk column is computed (not user-entered)
- Backend queries are intentionally separated by use case
- Legacy routes are supported but clearly marked
- No dead code or unused mutations remain
- Suspense boundaries are applied correctly and minimally

---

## 🧠 IMPORTANT RULE

> Do not refactor core structure "just to clean it up".

If something looks duplicated or complex, it is likely intentional.
Refer to `ARCHITECTURE_LOCK.md` before making structural changes.

---

## 🚦 WHAT CHANGES ARE SAFE

- Adding new features
- Adding new routes or reports
- Adding new status rules (explicitly)
- Styling and layout refinements
- Performance optimizations (with profiling)

---

## 🚫 WHAT REQUIRES EXPLICIT DECISION

- Changing table structure
- Merging or removing routes
- Merging backend queries
- Changing Status + Risk logic
- Global refactors
- Introducing new architectural patterns

If in doubt: **assume it is locked**.

---

## 🏁 PHILOSOPHY

FleetCore is built for real operators, real loads, and real consequences.

Silent bugs are worse than visible ones.
Stable systems beat clever systems.

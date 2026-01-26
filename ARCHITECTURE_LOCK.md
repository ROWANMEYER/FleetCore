# FleetCore Architecture Lock

This document defines **intentionally locked architectural decisions**.

These decisions were made deliberately after hardening and verification.
They must not be changed casually.

---

## 🔐 LOCKED UI CONTRACTS

### Sheets Table (Daily Planner)

- Default view is **collapsed summary rows**
- Expanded details are revealed via **chevron dropdown**
- No nested tables are visible by default
- One route = one visual unit

Collapsed columns are fixed to:
- Truck (fleet number only)
- Trailer (fleet number only)
- Driver
- From (all pickups)
- To (all drop-offs)
- Amount
- Status + Risk

All other details belong in the expanded card.

---

## 🔐 STATUS + RISK SYSTEM

Status is **computed**, not user-entered.

Priority order is locked:

1. 🔴 Incomplete
2. 🟡 Missing KM
3. 🟡 Multi-drop
4. 🟡 Multi-pick
5. 🔵 Finalized
6. 🟢 Clean

Rules:
- Status helpers are pure functions
- No hooks
- No mutations
- No side effects
- No UI actions in collapsed view

---

## 🔐 ROUTING INTENT

- `/operations/daily-planner/*` is the canonical system
- `/planner` and `/sheets` are legacy but valid
- Legacy routes must not be removed without migration
- Deprecation is documented, not implicit

Duplicate routing is **intentional**, not accidental.

---

## 🔐 BACKEND QUERY STRATEGY

Backend queries are separated by **consumer intent**:
- UI display
- Reporting
- Email exports
- QuickSend summaries

Do not merge queries into "god queries".
Shared logic belongs in helpers, not conditionals.

---

## 🔐 SUSPENSE USAGE

- Suspense boundaries are localized
- No global Suspense wrappers
- `fallback={null}` unless explicitly required
- Only applied where Next.js requires it

---

## 🚫 PROHIBITED CHANGES WITHOUT PHASE 3+

The following require an explicit refactor phase:

- Removing legacy routes
- Consolidating routing systems
- Merging backend queries
- Replacing table architecture
- Introducing global state systems
- Major component splitting

---

## 🧠 ENGINEERING PRINCIPLE

If a change:
- Reduces clarity
- Introduces cleverness
- Requires explanation

It probably violates the lock.

Prefer boring, explicit, stable solutions.

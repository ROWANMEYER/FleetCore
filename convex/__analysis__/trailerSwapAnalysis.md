# Backend Analysis: Trailer Swaps & Combinations

**Date:** 2026-02-26
**Scope:** `convex/` directory (Backend)
**Status:** AUDIT MODE (No changes applied)

---

## 1. DATA MODEL SOURCE OF TRUTH

The "current truck-trailer combination" is stored in the **`trucks` table**.

*   **Table:** `trucks`
*   **Field:** `currentTrailerId` (Type: `v.optional(v.string())`)
*   **Indexing:** `by_currentTrailerId` index exists on `trucks` to allow reverse lookups (finding which truck has a specific trailer).

**Findings:**
*   The `trailers` table does **NOT** store a `currentTruckId`. It relies entirely on the `trucks` table to define the relationship.
*   The `trailerSwaps` table is a **historical log** only and does not determine the current active state.

---

## 2. TRAILER SWAP FLOW TRACE

The following mutations affect trailer swaps or truck-trailer associations:

### A. `convex/trailerSwaps.ts`

| Function Name | Action Type | Tables Patched | Updates `currentTrailerId`? |
| :--- | :--- | :--- | :--- |
| **`create`** | **INSERT ONLY** | `trailerSwaps` | **NO** ❌ (Log only) |
| `pairTruckAndTrailer` | ATOMIC | `trucks`, `trailerSwaps` | **YES** ✅ |
| `unpairByTruck` | ATOMIC | `trucks`, `trailerSwaps` | **YES** ✅ (Sets to `undefined`) |
| `unpairByTrailer` | ATOMIC | `trucks`, `trailerSwaps` | **YES** ✅ (Sets to `undefined`) |
| `recordTrailerSwap` | ATOMIC | `trucks`, `trailerSwaps` | **YES** ✅ |
| `swapTwoTrucks` | ATOMIC | `trucks` (x2), `trailerSwaps` (x2) | **YES** ✅ |

### B. `convex/trucks.ts`

| Function Name | Action Type | Tables Patched | Updates `currentTrailerId`? |
| :--- | :--- | :--- | :--- |
| `assignTrailer` | **PATCH ONLY** | `trucks` | **YES** ✅ (No Swap Record) |
| `updateTruckTrailer` | **PATCH ONLY** | `trucks` | **YES** ✅ (No Swap Record) |

### C. `convex/fleet.ts`

| Function Name | Action Type | Tables Patched | Updates `currentTrailerId`? |
| :--- | :--- | :--- | :--- |
| `updateTruck` | **PATCH ONLY** | `trucks` | **YES** ✅ (No Swap Record) |

---

## 3. CURRENT COMBINATION QUERY TRACE

The following queries determine the "Current Combination" displayed in reports/dashboards:

| Query Name | Source Table | Field Read | Purpose |
| :--- | :--- | :--- | :--- |
| **`trucks:getWithTrailers`** | `trucks` | `currentTrailerId` | Returns all trucks with their mapped trailer fleet number. |
| **`trucks:getAllWithTrailer`** | `trucks` | `currentTrailerId` | Returns ONLY paired trucks. |
| `trailerSwaps:getDashboardData` | `trucks` | `currentTrailerId` | Calculates `pairedTrucks` count. |
| `trucks:list` | `trucks` | `currentTrailerId` | Returns raw truck data. |

**Key Insight:** All "Current Combination" reports read directly from `trucks.currentTrailerId`. They do **NOT** calculate state from the `trailerSwaps` history.

---

## 4. STATE CONSISTENCY CHECK

**Scenario: A user executes a trailer swap.**

1.  **If `trailerSwaps:create` is called:**
    *   **Result:** A record is added to `trailerSwaps`.
    *   **State Change:** `trucks.currentTrailerId` is **NOT** updated.
    *   **Inconsistency Risk:** **CRITICAL**. The history says a swap happened, but the "Current Combination" report will show the *old* state.

2.  **If `trucks:assignTrailer` / `updateTruckTrailer` is called:**
    *   **Result:** `trucks.currentTrailerId` is updated.
    *   **State Change:** No record is added to `trailerSwaps`.
    *   **Inconsistency Risk:** **HIGH**. The state changes "magically" without a historical audit trail.

3.  **If `trailerSwaps:pairTruckAndTrailer` / `unpair` / `recordTrailerSwap` is called:**
    *   **Result:** Both tables are updated atomically.
    *   **Inconsistency Risk:** **NONE**.

---

## 5. FRONTEND DEPENDENCY MAP

Based on standard usage patterns:

*   **Swap Entry Screen ("Record Swap"):**
    *   Likely calls **`trailerSwaps:create`** (based on user report of "data inconsistency").
    *   *Recommendation:* Should call `trailerSwaps:recordTrailerSwap` or `trailerSwaps:create` must be patched.

*   **"Current Combination" Report:**
    *   Calls **`trucks:getWithTrailers`** or **`trucks:getAllWithTrailer`**.
    *   *Impact:* Because `trailerSwaps:recordTrailerSwap` updates the source of truth, this report will be accurate.

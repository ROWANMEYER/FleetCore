import type { Id } from "@/convex/_generated/dataModel";

/**
 * Shape of the rows the list filters. Structural, not the Convex doc type:
 * the component feeds it `customers` rows plus the per-customer sheet
 * lookup, and tests construct plain objects.
 */
export interface FilterableCustomer {
  _id: Id<"customers">;
  name: string;
  accountNumber?: string | null;
  isActive: boolean;
}

export interface SheetSummary {
  customerId: Id<"customers">;
  laneCount: number;
  /** Absent until the first save claims it, which is why the list can show a sheet with no date yet. */
  effectiveDate?: string;
  updatedAt: number;
}

/** Which sheets the table shows: everything, only customers with a sheet, or only without. */
export type SheetFilter = "all" | "with_sheet" | "without_sheet";

/**
 * Split a raw search box value into matchable terms.
 *
 * Comma and semicolon separate "OR" terms (any of them matches); whitespace
 * inside a term splits into "AND" words (all of them must match the same
 * customer). "timber, city" finds Timber City *and* Timber ... whatever the
 * second thing is, without making the user choose a mode.
 *
 * An empty result means "no search" and must show every customer.
 */
export function parseSearchTerms(raw: string): string[][] {
  return raw
    .split(/[,;]+/)
    .map(term => term.trim().toLowerCase())
    .filter(term => term.length > 0)
    .map(term => term.split(/\s+/).filter(word => word.length > 0));
}

function customerMatchesTerm(customer: FilterableCustomer, words: string[]): boolean {
  const haystacks = [customer.name.toLowerCase(), (customer.accountNumber ?? "").toLowerCase()];
  // Every whitespace-separated word must appear in the name or the account number.
  return words.every(word => haystacks.some(h => h.includes(word)));
}

/**
 * Filter the active customers for the table.
 *
 * - inactive customers are never listed (the rate sheet screen manages live rates)
 * - every comma-separated search term is an alternative; words inside one term
 *   must all match
 * - sheetFilter narrows to customers with/without a rate sheet
 */
export function filterCustomers(
  customers: FilterableCustomer[],
  sheetByCustomer: Map<Id<"customers">, SheetSummary>,
  rawSearch: string,
  sheetFilter: SheetFilter
): FilterableCustomer[] {
  const terms = parseSearchTerms(rawSearch);
  return customers.filter(c => {
    if (!c.isActive) return false;
    const hasSheet = sheetByCustomer.has(c._id);
    if (sheetFilter === "with_sheet" && !hasSheet) return false;
    if (sheetFilter === "without_sheet" && hasSheet) return false;
    if (terms.length === 0) return true;
    return terms.some(words => customerMatchesTerm(c, words));
  });
}

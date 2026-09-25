/* Pure helpers for the 6.4A "Add Client from Quick Capture" flow.
   No React/Convex imports — unit-testable client logic only.

   Customer master data stays authoritative in the existing `customers`
   table. These helpers only present/classify; creation always flows through
   the existing customers.createCustomer mutation. */

import type { CustomerRecord } from "./parser";

/* Present the raw client token as a customer display name.
   Presentation cleanup ONLY: trim, collapse internal whitespace, Title Case
   each word. Never invents or reorders words and never fabricates
   punctuation — the dispatcher edits the proposal freely before saving. */
export function presentClientName(rawToken: string): string {
  return rawToken
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* Duplicate protection + inactive detection for the Add Client dialog.
   Reuses the EXACT deterministic normalization used by client resolution
   (customers.normalizedName equality, falling back to name.toLowerCase
   equality) over the CURRENT live customer list. Inactive records are
   intentionally included so an inactive match surfaces an explicit message
   instead of a duplicate create (backend never blocks on name). */
export function findMatchingCustomer(
  token: string,
  customers: readonly CustomerRecord[]
): CustomerRecord | null {
  const searchName = token.toLowerCase().trim().replace(/\s+/g, " ");
  const match = customers.find(
    (c) =>
      c.normalizedName === searchName ||
      c.name.toLowerCase().replace(/\s+/g, " ").trim() === searchName
  );
  return match ?? null;
}

/* The Add Client action is offered ONLY when the parser specifically knows
   the problem is an unknown customer: the line is SYNTACTICALLY valid
   (x / na delimiters present, non-empty segments) AND resolution classifies
   it "unknown". Malformed lines, matched lines, ambiguous and alias-missing
   statuses never offer Add Client. */
export function shouldOfferAddClient(
  loadValid: boolean,
  resolutionStatus?: string
): boolean {
  return loadValid && resolutionStatus === "unknown";
}
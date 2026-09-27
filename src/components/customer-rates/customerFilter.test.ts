import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { filterCustomers, parseSearchTerms, type FilterableCustomer, type SheetSummary } from "./customerFilter";

const id = (n: number) => `id${n}` as Id<"customers">;

const customer = (n: number, name: string, accountNumber?: string, isActive = true): FilterableCustomer => ({
  _id: id(n),
  name,
  accountNumber,
  isActive,
});

const customers: FilterableCustomer[] = [
  customer(1, "Timber City George", "TC001"),
  customer(2, "Timber Warehouse Knysna", "TW002"),
  customer(3, "City Hardware", "CH003"),
  customer(4, "Old Farm Supplies", "OF004", false),
];

const sheet = (customerId: Id<"customers">): SheetSummary => ({ customerId, laneCount: 3, effectiveDate: "2026-09-01", updatedAt: 1 });

const sheets = new Map([
  [id(1), sheet(id(1))],
  [id(3), sheet(id(3))],
]);

const noSheets = new Map();

describe("parseSearchTerms", () => {
  it("splits comma-separated terms into OR alternatives", () => {
    expect(parseSearchTerms("timber, city")).toEqual([["timber"], ["city"]]);
  });
  it("splits whitespace inside a term into AND words", () => {
    expect(parseSearchTerms("timber city")).toEqual([["timber", "city"]]);
  });
  it("accepts semicolons as separators too", () => {
    expect(parseSearchTerms("timber; city hardware")).toEqual([["timber"], ["city", "hardware"]]);
  });
  it("returns empty for blank input so the list shows everyone", () => {
    expect(parseSearchTerms("")).toEqual([]);
    expect(parseSearchTerms("   ")).toEqual([]);
    expect(parseSearchTerms(", ;,")).toEqual([]);
  });
  it("is case-insensitive", () => {
    expect(parseSearchTerms("Timber CITY")).toEqual([["timber", "city"]]);
  });
});

describe("filterCustomers", () => {
  it("shows every active customer when there is no search and no sheet filter", () => {
    expect(filterCustomers(customers, noSheets, "", "all")).toHaveLength(3);
  });

  it("never lists inactive customers", () => {
    const rows = filterCustomers(customers, noSheets, "farm", "all");
    expect(rows).toHaveLength(0);
  });

  it("matches a single term against name or account number", () => {
    expect(filterCustomers(customers, noSheets, "timber", "all").map(c => c.name)).toEqual([
      "Timber City George",
      "Timber Warehouse Knysna",
    ]);
    expect(filterCustomers(customers, noSheets, "ch003", "all").map(c => c.name)).toEqual(["City Hardware"]);
  });

  it("ANDs words inside one term: both words must hit the same customer", () => {
    expect(filterCustomers(customers, noSheets, "timber george", "all").map(c => c.name)).toEqual(["Timber City George"]);
  });

  it("ORs comma-separated terms: any alternative matches", () => {
    expect(filterCustomers(customers, noSheets, "george, hardware", "all").map(c => c.name)).toEqual([
      "Timber City George",
      "City Hardware",
    ]);
  });

  it("matches account numbers in multi-term search", () => {
    expect(filterCustomers(customers, noSheets, "tw002, ch003", "all").map(c => c.name)).toEqual([
      "Timber Warehouse Knysna",
      "City Hardware",
    ]);
  });

  it("combines words and alternatives: 'timber knysna, hardware'", () => {
    expect(filterCustomers(customers, noSheets, "timber knysna, hardware", "all").map(c => c.name)).toEqual([
      "Timber Warehouse Knysna",
      "City Hardware",
    ]);
  });

  it("filters to customers that have a rate sheet", () => {
    expect(filterCustomers(customers, sheets, "", "with_sheet").map(c => c.name)).toEqual([
      "Timber City George",
      "City Hardware",
    ]);
  });

  it("filters to customers without a rate sheet", () => {
    expect(filterCustomers(customers, sheets, "", "without_sheet").map(c => c.name)).toEqual(["Timber Warehouse Knysna"]);
  });

  it("combines search and sheet filter", () => {
    expect(filterCustomers(customers, sheets, "timber", "with_sheet").map(c => c.name)).toEqual(["Timber City George"]);
    expect(filterCustomers(customers, sheets, "timber", "without_sheet").map(c => c.name)).toEqual(["Timber Warehouse Knysna"]);
  });
});

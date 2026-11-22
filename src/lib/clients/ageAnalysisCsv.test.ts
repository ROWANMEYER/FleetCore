import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseAgeAnalysisCustomers, parseCsvRecords } from "./ageAnalysisCsv";
import { planCustomerImport } from "@/convex/customerImportRules";

describe("Age Analysis customer CSV", () => {
  it("handles BOM, commas, escaped quotes, multiline fields, CRLF and leading zeroes", () => {
    const rows = parseAgeAnalysisCustomers('\uFEFFRekno,Name,Blocked,Telephone,Delivery Address 1\r\n0012,"A, \"\"Company\"\"",No,0440123456,"First street\nSecond floor"\r\n');
    expect(rows[0]).toMatchObject({ accountNumber: "0012", name: 'A, "Company"', phone: "0440123456", address: "First street\nSecond floor", isActive: true });
  });
  it("maps blocked status and uses postal/mobile fallbacks", () => {
    const rows = parseAgeAnalysisCustomers('Rekno,Name,Blocked,Mobile,Postal Address 1,Postal Address 2,Postal Code,Tax Reference\n1,Customer,Yes,0821234567,Box 1,George,6530,001234');
    expect(rows[0]).toMatchObject({ isActive: false, phone: "0821234567", address: "Box 1\nGeorge\n6530", vatNumber: "001234" });
  });
  it("preserves secondary contact/address details and aliases in notes", () => {
    const rows = parseAgeAnalysisCustomers('Rekno,Name,Blocked,Aliases,COD,Fax,Delivery Address 1,Postal Address 1\n1,Customer,No,Client alias,Yes,044123,Main street,Box 123');
    expect(rows[0].address).toBe("Main street"); expect(rows[0].note).toContain("Age Analysis aliases: Client alias"); expect(rows[0].note).toContain("Postal address: Box 123");
  });
  it("rejects wrong headers, mismatched columns and broken quoted fields", () => {
    expect(() => parseAgeAnalysisCustomers("Name,Email\nA,a@example.com")).toThrow("Rekno");
    expect(() => parseAgeAnalysisCustomers("Rekno,Name,Blocked\n1,A")).toThrow("columns");
    expect(() => parseCsvRecords('a,b\n1,"unfinished')).toThrow("quoted field");
    expect(() => parseCsvRecords('a,b\n1,"name"extra')).toThrow("quoting");
  });
  it("rejects ambiguous blocked flags and duplicate headers", () => {
    expect(() => parseAgeAnalysisCustomers("Rekno,Name,Blocked\n1,A,Maybe")).toThrow("Blocked");
    expect(() => parseAgeAnalysisCustomers("Rekno,Name,Blocked,Name\n1,A,No,B")).toThrow("duplicate column");
  });
  it("skips every ambiguous duplicate name and placeholder, without selecting an arbitrary account", () => {
    const rows = parseAgeAnalysisCustomers("Rekno,Name,Blocked\n001,A,No\n002,a,No\n003,*** MISSING DESCRIPTION ***,No\n004,Unique,No");
    const plan = planCustomerImport(rows, []);
    expect(plan.filter(p => !p.reason).map(p => p.row.accountNumber)).toEqual(["004"]);
    expect(plan[0].reason).toContain("Duplicate name"); expect(plan[1].reason).toContain("Duplicate name");
  });
  it("skips account and inactive-name matches and never proposes updates", () => {
    const rows = parseAgeAnalysisCustomers("Rekno,Name,Blocked\n001,Renamed,No\n002,Inactive name,No");
    const plan = planCustomerImport(rows, [{ name: "Original", normalizedName: "original", accountNumber: "001", isActive: true }, { name: "Inactive name", normalizedName: "inactive name", isActive: false }]);
    expect(plan[0].reason).toContain("Original"); expect(plan[1].reason).toContain("inactive");
  });
});


describe("Ageanalysis customer screen export compatibility", () => {
  const exportedCsv = readFileSync(new URL("./__fixtures__/age-analysis-customers.csv", import.meta.url), "utf8");
  it("imports the actual 17-column exporter format with contact, address and status intact", () => {
    const rows = parseAgeAnalysisCustomers(exportedCsv);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ accountNumber: "0007", name: 'Transfer Crème, "Timber"', isActive: true, contactPerson: 'Anne "A"', email: "anne@example.test", phone: "0440123456", address: "First floor\nWarehouse, George\nGeorge\nWestern Cape", vatNumber: "00001234" });
    expect(rows[0].note).toBe("Age Analysis aliases: Timber | CT\nCOD: Yes\nMobile: 0820000000\nFax: 0440000001\nPostal address: Box 1\nGeorge\n0653");
    expect(rows[1]).toMatchObject({ accountNumber: "0008", name: "Transfer Blocked", isActive: false, phone: "0820123456", address: "Box 2\nKnysna\n0657" });
  });
  it("keeps existing customers unchanged and makes importing the same list again a no-op", () => {
    const rows = parseAgeAnalysisCustomers(exportedCsv);
    const existing = [{ name: "Acceptance Legacy", normalizedName: "acceptance legacy", accountNumber: "existing-account", isActive: true }];
    const preview = planCustomerImport(rows, existing);
    expect(preview.filter(entry => !entry.reason).map(entry => entry.row.accountNumber)).toEqual(["0007", "0008"]);
    expect(preview[2].reason).toContain("Name already exists");
    const afterImport = [...existing, ...rows.slice(0, 2).map(row => ({ name: row.name, normalizedName: row.name.toLowerCase(), accountNumber: row.accountNumber, isActive: row.isActive }))];
    expect(planCustomerImport(rows, afterImport).every(entry => entry.reason)).toBe(true);
    expect(existing[0]).toEqual({ name: "Acceptance Legacy", normalizedName: "acceptance legacy", accountNumber: "existing-account", isActive: true });
  });
});


describe("CSV line endings", () => {
  it.each(["\n", "\r\n", "\r"])("normalizes quoted multiline addresses for %j", newline => {
    const csv = `Rekno,Name,Blocked,Delivery Address 1${newline}0001,Example,No,"First floor${newline}Warehouse"${newline}`;
    expect(parseAgeAnalysisCustomers(csv)[0].address).toBe("First floor\nWarehouse");
  });
});

import { describe, expect, it } from "vitest";
import { buildCustomersCsv, customersCsvFilename } from "./exportCustomersCsv";
import { parseAgeAnalysisCustomers } from "./ageAnalysisCsv";

const FIELDS = (row: Record<string, unknown>) => {
  const mapped: Record<string, unknown> = {
    accountNumber: row.accountNumber,
    name: row.name,
    isActive: row.isActive,
    contactPerson: row.contactPerson,
    email: row.email,
    phone: row.phone,
    address: row.address,
    vatNumber: row.vatNumber,
    note: row.note,
  };
  return Object.fromEntries(Object.entries(mapped).filter(([, value]) => value !== undefined));
};

describe("client CSV export", () => {
  it("round-trips every customer field through the Age Analysis importer", () => {
    const customers = [
      {
        accountNumber: "0012",
        name: 'A, "Company"',
        isActive: true,
        contactPerson: "Jane Doe",
        email: "jane@example.com",
        phone: "0440123456",
        address: "First street\nSecond floor",
        vatNumber: "0012345678",
        note: "Call before delivery\nCOD: Yes",
      },
      { accountNumber: "0099", name: "Blocked Client", isActive: false, note: "Mobile: 0821234567" },
      { accountNumber: "", name: "No Account Number", isActive: true },
    ];
    const rows = parseAgeAnalysisCustomers(buildCustomersCsv(customers));
    expect(rows.map(FIELDS)).toEqual(customers);
    expect(rows.map((row) => row.sourceRow)).toEqual([2, 3, 4]);
  });

  it("keeps an Age Analysis style note verbatim instead of folding it into label columns", () => {
    const rows = parseAgeAnalysisCustomers(buildCustomersCsv([{ accountNumber: "1", name: "Client", isActive: true, note: "Age Analysis aliases: Alias\nPostal address: Box 1\n6530" }]));
    expect(rows[0].note).toBe("Age Analysis aliases: Alias\nPostal address: Box 1\n6530");
    expect(rows[0].address).toBeUndefined();
  });

  it("writes a BOM, CRLF lines and quoted cells", () => {
    const csv = buildCustomersCsv([{ accountNumber: "1", name: "Client", isActive: false }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toBe('\uFEFF"Rekno","Name","Blocked","Contact","Email","Telephone","Delivery Address 1","Tax Reference","Note"\r\n"1","Client","Yes","","","","","",""\r\n');
  });

  it("names the file by date", () => {
    expect(customersCsvFilename(new Date(2026, 0, 5))).toBe("fleetcore-clients_2026-01-05.csv");
    expect(customersCsvFilename(new Date(2026, 11, 31))).toBe("fleetcore-clients_2026-12-31.csv");
  });
});
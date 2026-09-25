import { describe, it, expect } from "vitest";
import { filterClients, type ClientRow } from "./searchClients";

const CLIENTS: ClientRow[] = [
  {
    name: "Test Timber",
    accountNumber: "ACC-001",
    vatNumber: "VAT-111",
    contactPerson: "Jane Doe",
    phone: "082 111 2222",
    email: "jane@testtimber.co.za",
    isActive: true,
  },
  {
    name: "Shaveco",
    accountNumber: "ACC-002",
    vatNumber: "VAT-222",
    contactPerson: "John Smith",
    phone: "083 333 4444",
    email: "john@shaveco.co.za",
    isActive: true,
  },
  {
    name: "Old Mills",
    accountNumber: "ACC-003",
    contactPerson: "Sue Lee",
    phone: "084 555 6666",
    email: "sue@oldmills.co.za",
    isActive: false,
  },
];

describe("K — client search", () => {
  it("C-mirror: search by client name, case-insensitive", () => {
    expect(filterClients(CLIENTS, "TEST TIMBER", "all").map((c) => c.name)).toEqual(["Test Timber"]);
    expect(filterClients(CLIENTS, "shaveco", "all").map((c) => c.name)).toEqual(["Shaveco"]);
  });

  it("D-mirror: search by account number (case-insensitive, trimmed)", () => {
    expect(filterClients(CLIENTS, "  acc-001  ", "all").map((c) => c.name)).toEqual(["Test Timber"]);
  });

  it("search by contact person", () => {
    expect(filterClients(CLIENTS, "john smith", "all").map((c) => c.name)).toEqual(["Shaveco"]);
  });

  it("search by phone", () => {
    expect(filterClients(CLIENTS, "083 333", "all").map((c) => c.name)).toEqual(["Shaveco"]);
  });

  it("search by email", () => {
    expect(filterClients(CLIENTS, "OLDMILLS", "all").map((c) => c.name)).toEqual(["Old Mills"]);
  });

  it("search by VAT number", () => {
    expect(filterClients(CLIENTS, "vat-222", "all").map((c) => c.name)).toEqual(["Shaveco"]);
  });

  it("no fuzzy matching — a non-matching substring finds nothing", () => {
    expect(filterClients(CLIENTS, "timberr", "all")).toHaveLength(0);
    expect(filterClients(CLIENTS, "shavek", "all")).toHaveLength(0);
  });

  it("matches any field at once and stays trim + case-insensitive", () => {
    expect(filterClients(CLIENTS, "  082  ", "all").map((c) => c.name)).toEqual(["Test Timber"]);
  });
});

describe("K — status filter", () => {
  it("active only", () => {
    expect(filterClients(CLIENTS, "", "active").map((c) => c.name)).toEqual(["Test Timber", "Shaveco"]);
  });

  it("inactive only", () => {
    expect(filterClients(CLIENTS, "", "inactive").map((c) => c.name)).toEqual(["Old Mills"]);
  });

  it("all includes both states", () => {
    expect(filterClients(CLIENTS, "", "all")).toHaveLength(3);
  });

  it("status + search compose", () => {
    expect(filterClients(CLIENTS, "timber", "inactive")).toHaveLength(0);
    expect(filterClients(CLIENTS, "timber", "active").map((c) => c.name)).toEqual(["Test Timber"]);
  });
});
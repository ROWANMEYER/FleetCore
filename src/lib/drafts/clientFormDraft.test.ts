import { describe, it, expect } from "vitest";
import {
  DEFAULT_BOARD_FILTERS,
  isBoardStatusFilter,
  sanitizeBoardFilters,
} from "./boardFilters";
import {
  EMPTY_CLIENT_FORM,
  clientFormFromCustomer,
  isClientFormEmpty,
  sanitizeClientForm,
} from "./clientFormDraft";

describe("sanitizeBoardFilters", () => {
  it("keeps a valid stored filter pair", () => {
    expect(sanitizeBoardFilters({ search: "TRK-01", status: "ready" })).toEqual({
      search: "TRK-01",
      status: "ready",
    });
  });

  it("falls back per field instead of rejecting the whole draft", () => {
    expect(sanitizeBoardFilters({ search: 42, status: "bogus" })).toEqual(
      DEFAULT_BOARD_FILTERS
    );
    expect(sanitizeBoardFilters({})).toEqual(DEFAULT_BOARD_FILTERS);
  });

  it("rejects values that are not filter objects", () => {
    expect(sanitizeBoardFilters(null)).toBeNull();
    expect(sanitizeBoardFilters("ready")).toBeNull();
    expect(sanitizeBoardFilters(["ready"])).toBeNull();
  });

  it("accepts every known status and nothing else", () => {
    for (const status of ["all", "planned", "ready", "available", "unavailable"]) {
      expect(isBoardStatusFilter(status)).toBe(true);
    }
    expect(isBoardStatusFilter("ALL")).toBe(false);
    expect(isBoardStatusFilter("delayed")).toBe(false);
    expect(isBoardStatusFilter(undefined)).toBe(false);
  });

  it("drops unknown keys so a tampered draft cannot widen the filter shape", () => {
    const result = sanitizeBoardFilters({ search: "x", status: "all", injected: "boom" });
    expect(result).toEqual({ search: "x", status: "all" });
    expect(result).not.toHaveProperty("injected");
  });
});

describe("sanitizeClientForm", () => {
  it("keeps a valid stored client form", () => {
    expect(sanitizeClientForm({ name: "Acme", email: "a@b.co" })).toMatchObject({
      name: "Acme",
      email: "a@b.co",
      phone: "",
    });
  });

  it("coerces wrongly typed fields to empty strings", () => {
    expect(sanitizeClientForm({ name: 5, phone: null, note: ["x"] })).toEqual(
      EMPTY_CLIENT_FORM
    );
  });

  it("rejects non-object payloads", () => {
    expect(sanitizeClientForm(null)).toBeNull();
    expect(sanitizeClientForm("Acme")).toBeNull();
    expect(sanitizeClientForm([{ name: "Acme" }])).toBeNull();
  });

  it("ignores unknown keys", () => {
    const result = sanitizeClientForm({ name: "Acme", role: "admin" });
    expect(result).not.toHaveProperty("role");
  });
});

describe("isClientFormEmpty", () => {
  it("detects an untouched form", () => {
    expect(isClientFormEmpty(EMPTY_CLIENT_FORM)).toBe(true);
    expect(isClientFormEmpty({ ...EMPTY_CLIENT_FORM, note: "   " })).toBe(true);
  });

  it("detects any entered field", () => {
    expect(isClientFormEmpty({ ...EMPTY_CLIENT_FORM, accountNumber: "ACC-1" })).toBe(false);
  });
});

describe("clientFormFromCustomer", () => {
  it("maps a customer document onto the form shape", () => {
    expect(
      clientFormFromCustomer({
        name: "Acme",
        accountNumber: "ACC-1",
        vatNumber: null,
        contactPerson: "Jane",
        phone: "0820000000",
        email: "jane@acme.co",
        address: "1 Main St",
        note: "gate 2",
      })
    ).toEqual({
      name: "Acme",
      accountNumber: "ACC-1",
      vatNumber: "",
      contactPerson: "Jane",
      phone: "0820000000",
      email: "jane@acme.co",
      address: "1 Main St",
      note: "gate 2",
    });
  });
});

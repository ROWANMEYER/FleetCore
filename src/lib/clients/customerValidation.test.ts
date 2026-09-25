import { describe, it, expect } from "vitest";
import {
  normalizeCustomerName,
  checkNameAvailability,
  describeNameUnavailable,
  findRenameCollision,
  renameCollisionError,
  accountNumberConflictMessage,
  updateAccountNumberConflictMessage,
  toggleCustomerStatus,
  type CustomersDb,
  type CustomersRow,
} from "@/convex/customerValidation";

const ACTIVE: Pick<CustomersRow, "name" | "isActive"> = {
  name: "Test Timber",
  isActive: true,
};
const INACTIVE: Pick<CustomersRow, "name" | "isActive"> = {
  name: "Test Timber",
  isActive: false,
};

function makeFakeDb(rows: CustomersRow[]): { db: CustomersDb; map: Map<string, CustomersRow> } {
  const map = new Map(rows.map((r) => [r._id, { ...r }]));
  return {
    db: {
      get: async (id: string) => map.get(id) ?? null,
      patch: async (id: string, patch: { isActive: boolean }) => {
        const row = map.get(id);
        if (row) Object.assign(row, patch);
      },
    },
    map,
  };
}

describe("A — duplicate ACTIVE customer rejected", () => {
  it("normalizes Test Timber / test timber / TEST TIMBER to one name", () => {
    expect(normalizeCustomerName("Test Timber")).toBe("test timber");
    expect(normalizeCustomerName(" test timber ")).toBe("test timber");
    expect(normalizeCustomerName("TEST TIMBER")).toBe("test timber");
  });

  it("active name collision blocks creation with the plain duplicate message", () => {
    const availability = checkNameAvailability(ACTIVE);
    expect(availability).toMatchObject({ ok: false, inactive: false, existingName: "Test Timber" });
    expect(describeNameUnavailable(availability)).toBe(
      "A client named Test Timber already exists."
    );
  });
});

describe("B — duplicate INACTIVE customer rejected with inactive message", () => {
  it("inactive name collision is NOT silently reactivated and NOT silently duplicated", () => {
    const availability = checkNameAvailability(INACTIVE);
    expect(availability).toMatchObject({ ok: false, inactive: true, existingName: "Test Timber" });
    expect(describeNameUnavailable(availability)).toBe(
      "A client named Test Timber already exists but is inactive."
    );
  });

  it("no existing record → ok (creation allowed)", () => {
    expect(describeNameUnavailable(checkNameAvailability(null))).toBeNull();
  });
});

describe("C — account-number duplicate behavior preserved", () => {
  it("create message preserved verbatim", () => {
    expect(accountNumberConflictMessage("ACC-1", "Existing Co")).toBe(
      "Customer with account number ACC-1 already exists (Existing Co)."
    );
  });

  it("update message preserved verbatim", () => {
    expect(updateAccountNumberConflictMessage("ACC-1", "Existing Co")).toBe(
      "Account number ACC-1 is already taken by Existing Co."
    );
  });
});

describe("D — edit updates normalizedName consistently", () => {
  it("updateCustomer recomputes normalizedName from the same canonical rule", () => {
    expect(normalizeCustomerName("Timber Group Ops")).toBe("timber group ops");
    // create + update share the SAME normalization, so a rename keeps the
    // invariant and Quick Capture matching stays compatible.
    expect(normalizeCustomerName(" Timber Group Ops  ")).toBe("timber group ops");
  });
});

describe("E — rename collision rejected", () => {
  const rows: CustomersRow[] = [
    { _id: "c1", name: "Timber Co", normalizedName: "timber co", isActive: true },
    { _id: "c2", name: "Timber Deux", normalizedName: "timber deux", isActive: false },
  ];

  it("renaming onto another existing client's name is rejected", () => {
    const collision = findRenameCollision(rows, "c1");
    expect(collision?._id).toBe("c2");
    expect(renameCollisionError(collision!.name)).toBe(
      "Cannot rename: a client named Timber Deux already exists."
    );
  });

  it("renaming onto another client sharing the SAME normalizedName is rejected", () => {
    // by_normalizedName returns self + any collision; self must be skipped.
    const go: CustomersRow[] = [
      { _id: "c1", name: "Timber Co", normalizedName: "timber co", isActive: true },
      { _id: "c2", name: "Timber Co", normalizedName: "timber co", isActive: false },
    ];
    expect(findRenameCollision(go, "c1")).toMatchObject({ _id: "c2" });
    // only self in the result → no collision
    expect(findRenameCollision([go[0]], "c1")).toBeNull();
  });

  it("renaming onto an INACTIVE client's name is also rejected", () => {
    const collision = findRenameCollision(rows, "c1");
    expect(collision?.isActive).toBe(false);
  });
});

describe("F / G — activate and deactivate set isActive exactly", () => {
  it("deactivate sets isActive false (soft — record kept)", async () => {
    const { db, map } = makeFakeDb([
      { _id: "c1", name: "Timber Co", normalizedName: "timber co", isActive: true },
    ]);
    await toggleCustomerStatus(db, "c1", false);
    expect(map.get("c1")!.isActive).toBe(false);
    expect(map.has("c1")).toBe(true);
  });

  it("activate sets isActive true", async () => {
    const { db, map } = makeFakeDb([
      { _id: "c1", name: "Timber Co", normalizedName: "timber co", isActive: false },
    ]);
    await toggleCustomerStatus(db, "c1", true);
    expect(map.get("c1")!.isActive).toBe(true);
  });

  it("missing record → throws, nothing patched", async () => {
    const { db } = makeFakeDb([]);
    await expect(toggleCustomerStatus(db, "missing", false)).rejects.toThrow("Document not found");
  });
});
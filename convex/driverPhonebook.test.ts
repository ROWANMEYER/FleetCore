import { describe, expect, it, vi } from "vitest";
import * as phonebook from "./driverPhonebook";
import { createDriver, updateDriver } from "./fleet";

type Row = Record<string, unknown> & { _id: string };
type Directory = { page: Row[]; isDone: boolean; continueCursor: string };

function fixture() {
  const rows = new Map<string, Row>([
    ["users:1", { _id: "users:1", role: "admin" }],
    ["users:2", { _id: "users:2", role: "regional" }],
    ["sessions:1", { _id: "sessions:1", token: "valid", userId: "users:1", expiresAt: Date.now() + 60_000 }],
    ["sessions:2", { _id: "sessions:2", token: "expired", userId: "users:1", expiresAt: Date.now() - 1 }],
    ["sessions:3", { _id: "sessions:3", token: "regional", userId: "users:2", expiresAt: Date.now() + 60_000 }],
    ["drivers:1", { _id: "drivers:1", driverName: "Example Driver", driverId: "D1", phone: "0821234567", status: "active", photoStorageId: "storage:photo", photoUrl: "https://old-photo", photoOriginalUrl: "https://original-photo", idNumber: "private-id", pinHash: "private-hash", accessToken: "private-token" }],
    ["drivers:2", { _id: "drivers:2", driverName: "Inactive", status: "inactive" }],
    ["drivers:3", { _id: "drivers:3", name: "Legacy Driver", phone: "0832345678", photoUrl: "https://legacy-photo" }],
    ["drivers:4", { _id: "drivers:4", driverName: "Test Driver", status: "active", isTest: true }],
  ]);
  let sequence = 10;
  const db = {
    get: async (id: string) => rows.get(id) ?? null,
    system: { normalizeId: (_table: string, id: string) => id.startsWith("storage:") ? id : null },
    patch: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const row = rows.get(id);
      if (!row) throw new Error("Missing driver");
      rows.set(id, { ...row, ...patch });
    }),
    insert: async (table: string, body: Record<string, unknown>) => {
      const id = `${table}:${++sequence}`;
      rows.set(id, { ...body, _id: id });
      return id;
    },
    query: (table: string) => ({
      withIndex: (_index: string, range?: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
        const matching = [...rows.values()].filter(row => row._id.startsWith(`${table}:`));
        let field: string | undefined;
        let value: unknown;
        range?.({ eq: (key, expected) => { field = key; value = expected; } });
        const selected = field ? matching.filter(row => row[field!] === value) : matching;
        return {
          first: async () => selected[0] ?? null,
          paginate: async () => ({ page: selected, isDone: true, continueCursor: "next" }),
        };
      },
    }),
  };
  const getUrl = vi.fn(async () => "https://current-photo");
  const call = async (fn: unknown, args: Record<string, unknown>) =>
    (fn as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler({ db, storage: { getUrl } }, args);
  const list = async () => await call(phonebook.list, { paginationOpts: { numItems: 100, cursor: null } }) as Directory;
  return { rows, db, call, list, getUrl };
}

describe("live driver phonebook", () => {
  it("publishes active contacts with current photos, omitting private fields and test drivers", async () => {
    const { list, getUrl } = fixture();
    const result = await list();
    expect(result.page.map(d => d.name)).toEqual(["Example Driver", "Legacy Driver"]);
    expect(result.page[0]).toMatchObject({ photoUrl: "https://current-photo", photoOriginalUrl: "https://original-photo", numbers: [{ label: "Primary", number: "0821234567", whatsapp: true }] });
    expect(result.page[1]).toMatchObject({ photoUrl: "https://legacy-photo" });
    expect(getUrl).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ isDone: true, continueCursor: "next" });
    for (const row of result.page) for (const key of ["idNumber", "accessToken", "pinHash", "photoStorageId", "failedPinAttempts"]) expect(row).not.toHaveProperty(key);
  });
  it("rejects guest and expired-session edits without saving anything", async () => {
    const { call, db } = fixture();
    for (const token of ["", "invalid", "expired"]) {
      await expect(call(phonebook.saveNumbers, { token, driverId: "drivers:1", phone: "0821234567", additionalPhones: [] })).rejects.toThrow(/Sign in/);
    }
    expect(db.patch).not.toHaveBeenCalled();
  });
  it("saves from mobile and immediately reads the same numbers without changing the photo or ID", async () => {
    const { call, list, rows } = fixture();
    await call(phonebook.saveNumbers, { token: "regional", driverId: "drivers:1", phone: "0821234567", additionalPhones: [{ label: "Work", number: "0832345678", whatsapp: false }] });
    expect((await list()).page[0].numbers).toEqual([
      { label: "Primary", number: "0821234567", whatsapp: true },
      { label: "Work", number: "0832345678", whatsapp: false },
    ]);
    expect(rows.get("drivers:1")).toMatchObject({ idNumber: "private-id", photoUrl: "https://old-photo", photoStorageId: "storage:photo" });
  });
  it("rejects duplicate numbers before a database write", async () => {
    const { call, db } = fixture();
    await expect(call(phonebook.saveNumbers, { token: "valid", driverId: "drivers:1", phone: "0821234567", additionalPhones: [{ label: "Work", number: "+27821234567", whatsapp: true }] })).rejects.toThrow("more than once");
    expect(db.patch).not.toHaveBeenCalled();
  });
  it("supports web create and edit, preserving extra numbers on legacy updates", async () => {
    const { call, rows } = fixture();
    const id = await call(createDriver, { token: "valid", driverId: "D2", driverName: "New Driver", idNumber: "private", phone: "0843456789", status: "active", additionalPhones: [{ label: "Work", number: "0854567890", whatsapp: true }] }) as string;
    expect(rows.get(id)).not.toHaveProperty("token");
    expect(rows.get(id)?.additionalPhones).toHaveLength(1);
    await call(updateDriver, { id, patch: { driverName: "Renamed Driver" } });
    expect(rows.get(id)?.additionalPhones).toHaveLength(1);
    await call(updateDriver, { token: "valid", id, patch: { additionalPhones: [] } });
    expect(rows.get(id)?.additionalPhones).toEqual([]);
    expect(rows.get(id)?.phone).toBe("0843456789");
  });
  it("requires login for the extra-number fields on the existing web mutations", async () => {
    const { call, db } = fixture();
    await expect(call(updateDriver, { id: "drivers:1", patch: { additionalPhones: [] } })).rejects.toThrow("Sign in");
    await expect(call(createDriver, { driverId: "D3", driverName: "New Driver", idNumber: "private", phone: "0843456789", status: "active", additionalPhones: [] })).rejects.toThrow("Sign in");
    expect(db.patch).not.toHaveBeenCalled();
  });
});

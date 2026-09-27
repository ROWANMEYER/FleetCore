import { beforeEach, describe, expect, it } from "vitest";
import * as sheets from "./rateSheets";

type Row = Record<string, unknown> & { _id: string };
/** A tiny in-memory stand-in for the Convex database, enough to exercise the rate sheet rules. */
function memoryDb() {
  const rows = new Map<string, Row>();
  const tables = new Map<string, string[]>();
  let counter = 0, id = 0;
  const db = {
    get: async (key: string) => rows.get(key) ?? null,
    insert: async (table: string, value: Record<string, unknown>) => {
      const key = `${table}:${++id}`;
      rows.set(key, { ...value, _id: key, _creationTime: ++counter });
      tables.set(table, [...(tables.get(table) ?? []), key]);
      return key;
    },
    patch: async (key: string, value: Record<string, unknown>) => {
      const row = rows.get(key);
      if (!row) throw new Error(`Not found: ${key}`);
      rows.set(key, { ...row, ...value });
    },
    delete: async (key: string) => {
      rows.delete(key);
      for (const [table, keys] of tables) {
        const i = keys.indexOf(key);
        if (i >= 0) { keys.splice(i, 1); tables.set(table, keys); }
      }
    },
    query: (table: string) => {
      const all = () => (tables.get(table) ?? []).map(k => rows.get(k)!);
      const match = (rowsIn: Row[], predicate: (row: Row) => boolean) => ({
        first: async () => rowsIn.filter(predicate).at(0) ?? null,
        unique: async () => {
          const found = rowsIn.filter(predicate);
          if (found.length > 1) throw new Error("More than one match.");
          return found.at(0) ?? null;
        },
        collect: async () => rowsIn.filter(predicate),
      });
      return {
        ...match(all(), () => true),
        withIndex: (_index: string, filter: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
          const predicate = filter({ eq: (field: string, value: unknown) => (row: Row) => row[field] === value }) as (row: Row) => boolean;
          return match(all(), predicate);
        },
      };
    },
    all: (table: string) => (tables.get(table) ?? []).map(k => rows.get(k)!),
  };
  return db;
}

async function fixture() {
  const db = memoryDb();
  // The registered query and mutation objects are invoked through their handler, which is the only part that holds the rules being tested here.
  const call = async (fn: unknown, args: Record<string, unknown>) =>
    (fn as { _handler: (ctx: { db: ReturnType<typeof memoryDb> }, args: Record<string, unknown>) => Promise<unknown> })._handler({ db }, args);
  const userId = await db.insert("users", { email: "admin@example.com", role: "admin" });
  const customerId = await db.insert("customers", { name: "George Agri", isActive: true });
  const inactiveId = await db.insert("customers", { name: "Dormant Ltd", isActive: false });
  await db.insert("sessions", { userId, token: "valid", expiresAt: Date.now() + 60_000 });
  await db.insert("sessions", { userId, token: "expired", expiresAt: Date.now() - 1 });
  const regionalId = await db.insert("users", { email: "regional@example.com", role: "regional" });
  const regionalSession = await db.insert("sessions", { userId: regionalId, token: "regional", expiresAt: Date.now() + 60_000 });
  const args = { token: "valid", customerId };
  const lane = (id: string, rate: number, sortOrder = 0): { id: string; loadingPoint: string; destination: string; rate: number; sortOrder: number; pricingUnit?: string } =>
    ({ id, loadingPoint: "George", destination: id === "a" ? "Cape Town" : "Durban", rate, sortOrder });
  const save = (lanes: ReturnType<typeof lane>[], patch: Record<string, unknown> = {}) =>
    call(sheets.saveLanes, { ...args, effectiveDate: "2026-09-02", notes: "", oldDieselPrice: 20, newDieselPrice: 23.15, lanes, ...patch });
  return { db, call, args, lane, save, userId, customerId, inactiveId, regionalSession };
}

describe("access", () => {
  it("refuses a missing or expired session", async () => {
    const h = await fixture();
    await expect(h.call(sheets.list, { token: "nope" })).rejects.toThrow("Sign in again");
    await expect(h.call(sheets.list, { token: "expired" })).rejects.toThrow("Sign in again");
  });
  it("refuses a non-admin", async () => {
    const h = await fixture();
    await expect(h.call(sheets.list, { token: "regional" })).rejects.toThrow("Admin access");
    await expect(h.call(sheets.create, { token: "regional", customerId: h.customerId, defaultPricingUnit: "full" })).rejects.toThrow("Admin access");
  });
  it("allows an admin", async () => {
    const h = await fixture();
    await expect(h.call(sheets.list, { token: "valid" })).resolves.toEqual([]);
  });
});

describe("create", () => {
  it("starts one sheet per customer", async () => {
    const h = await fixture();
    const first = await h.call(sheets.create, { ...h.args, defaultPricingUnit: "ton" });
    const second = await h.call(sheets.create, { ...h.args, defaultPricingUnit: "pallet" });
    expect(first).toBe(second);
    expect(h.db.all("rateSheets")).toHaveLength(1);
  });
  it("refuses an inactive customer", async () => {
    const h = await fixture();
    await expect(h.call(sheets.create, { token: "valid", customerId: h.inactiveId, defaultPricingUnit: "full" })).rejects.toThrow("active customer");
  });
});

describe("saveLanes", () => {
  let h: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    h = await fixture();
    await h.call(sheets.create, { ...h.args, defaultPricingUnit: "full" });
  });
  it("stores the lanes, the date, the notes and the diesel in one write", async () => {
    await h.save([h.lane("a", 1500)], { notes: "delivered by email" });
    expect(h.db.all("rateSheets")[0]).toMatchObject({ effectiveDate: "2026-09-02", notes: "delivered by email", oldDieselPrice: 20, newDieselPrice: 23.15 });
    expect((h.db.all("rateSheets")[0].lanes as Row[])[0]).toMatchObject({ loadingPoint: "George", destination: "Cape Town", rate: 1500 });
  });
  it("refuses a save that changes nothing", async () => {
    await h.save([h.lane("a", 1500)]);
    await expect(h.save([h.lane("a", 1500)])).rejects.toThrow("Nothing changed");
  });
  it("rounds a rate to cents", async () => {
    await h.save([h.lane("a", 1500.126)]);
    expect((h.db.all("rateSheets")[0].lanes as { rate: number }[])[0].rate).toBe(1500.13);
  });
  it("keeps a lane id across saves so a renamed lane is still the same row", async () => {
    await h.save([h.lane("a", 1000)]);
    const stored = (h.db.all("rateSheets")[0].lanes as { id: string }[])[0];
    await h.save([{ ...h.lane("a", 1500), id: stored.id, destination: "Mossel Bay" }]);
    const lanes = h.db.all("rateSheets")[0].lanes as { id: string; destination: string; rate: number }[];
    expect(lanes[0].id).toBe(stored.id);
    expect(lanes[0]).toMatchObject({ destination: "Mossel Bay", rate: 1500 });
  });
  it("hands back the id it minted for a new lane, so the next save keeps that same id", async () => {
    // A new lane arrives with no id, because the browser cannot mint one.
    const first = await h.call(sheets.saveLanes, { ...h.args, effectiveDate: "2026-09-02", notes: "", oldDieselPrice: 20, newDieselPrice: 23.15, lanes: [{ ...h.lane("a", 1000), id: "" }] }) as { lanes: { id: string }[] };
    expect(first.lanes[0].id).toBeTruthy();
    const second = await h.call(sheets.saveLanes, { ...h.args, effectiveDate: "2026-09-02", notes: "", oldDieselPrice: 20, newDieselPrice: 23.15, lanes: [{ ...h.lane("a", 1200), id: first.lanes[0].id }] }) as { lanes: { id: string }[] };
    expect(second.lanes[0].id).toBe(first.lanes[0].id);
  });
  it("saves the order the rows are in", async () => {
    await h.save([h.lane("a", 1000, 0), h.lane("b", 2000, 1)]);
    await h.save([h.lane("b", 2000, 0), h.lane("a", 1000, 1)]);
    expect((h.db.all("rateSheets")[0].lanes as { destination: string; sortOrder: number }[]).map(l => [l.destination, l.sortOrder])).toEqual([["Durban", 0], ["Cape Town", 1]]);
  });
  it("treats lanes that differ only in spacing or case as duplicates", async () => {
    await expect(h.save([h.lane("a", 1), { ...h.lane("b", 1), destination: " cape   town " }])).rejects.toThrow("listed twice");
  });
  it("refuses a lane with no loading point or destination", async () => {
    await expect(h.save([{ ...h.lane("a", 1), destination: "  " }])).rejects.toThrow("loading point and a destination");
  });
  it("refuses an empty sheet", async () => {
    await expect(h.save([])).rejects.toThrow("at least one lane");
  });
  it("allows a rate of zero but refuses a negative one", async () => {
    await h.save([h.lane("a", 0)]);
    expect((h.db.all("rateSheets")[0].lanes as { rate: number }[])[0].rate).toBe(0);
    await expect(h.save([{ ...h.lane("a", -1) }])).rejects.toThrow("rate of zero or more");
  });
  it("refuses an unknown pricing unit", async () => {
    await expect(h.save([{ ...h.lane("a", 1), pricingUnit: "crate" }])).rejects.toThrow("valid pricing unit");
  });
  it("accepts a diesel price of zero, which is how a sheet that was never given one saves", async () => {
    await h.save([h.lane("a", 1000)], { oldDieselPrice: 0, newDieselPrice: 0 });
    expect(h.db.all("rateSheets")[0]).toMatchObject({ oldDieselPrice: 0, newDieselPrice: 0 });
  });
  it("still refuses a negative diesel price", async () => {
    await expect(h.save([h.lane("a", 1000)], { oldDieselPrice: -1 })).rejects.toThrow("valid non-negative amount");
  });
  it("refuses a date that is not a real calendar date", async () => {
    await expect(h.save([h.lane("a", 1000)], { effectiveDate: "2026-02-31" })).rejects.toThrow("valid date");
  });
  it("refuses a sheet that does not exist yet", async () => {
    await expect(h.call(sheets.saveLanes, { token: "valid", customerId: h.inactiveId, effectiveDate: "2026-09-02", notes: "", oldDieselPrice: 20, newDieselPrice: 23, lanes: [h.lane("a", 1)] })).rejects.toThrow("no rate sheet");
  });
});

describe("the date the rates were added", () => {
  let h: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    h = await fixture();
    await h.call(sheets.create, { ...h.args, defaultPricingUnit: "full" });
  });
  it("starts out with no date, so the day the sheet was opened is not the day the rates count from", async () => {
    expect(h.db.all("rateSheets")[0].effectiveDate).toBeUndefined();
  });
  it("refuses a first save that does not say what date the rates were added", async () => {
    await expect(h.save([h.lane("a", 1000)], { effectiveDate: undefined })).rejects.toThrow("Set the date these rates were added");
    await expect(h.save([h.lane("a", 1000)], { effectiveDate: "   " })).rejects.toThrow("Set the date these rates were added");
  });
  it("locks the typed date on the first save", async () => {
    await h.save([h.lane("a", 1000)], { effectiveDate: "2026-01-15" });
    expect(h.db.all("rateSheets")[0].effectiveDate).toBe("2026-01-15");
  });
  it("dates a lane added later by the sheet, not by the day it was typed in", async () => {
    await h.save([h.lane("a", 1000)], { effectiveDate: "2026-01-15" });
    // A month later the editor is read only, so it sends the locked date back with the new lane.
    const later = new Date();
    const laterMonth = later.toISOString().slice(0, 5);
    expect(laterMonth).not.toBe("2026-01");
    await h.save([h.lane("a", 1200), h.lane("b", 1400)], { effectiveDate: "2026-01-15" });
    const sheet = h.db.all("rateSheets")[0];
    expect(sheet.effectiveDate).toBe("2026-01-15");
    // One date governs the whole sheet, and the later lane is covered by it: no lane carries a date of its own.
    expect((sheet.lanes as Row[])).toHaveLength(2);
    expect((sheet.lanes as Row[]).every(l => !("effectiveDate" in l))).toBe(true);
  });
  it("moves the stored date when a later save sends a different one, re-dating every lane at once", async () => {
    await h.save([h.lane("a", 1000)], { effectiveDate: "2026-01-15" });
    await h.save([h.lane("a", 1200), h.lane("b", 1400)], { effectiveDate: "2026-06-01" });
    const sheet = h.db.all("rateSheets")[0];
    expect(sheet.effectiveDate).toBe("2026-06-01");
    // The save that moved the date still applied its lane changes; one write carries both.
    expect((sheet.lanes as { rate: number }[]).map(l => l.rate)).toEqual([1200, 1400]);
  });
  it("refuses to move the date to a day that does not exist", async () => {
    await h.save([h.lane("a", 1000)], { effectiveDate: "2026-01-15" });
    await expect(h.save([h.lane("a", 1200)], { effectiveDate: "2026-02-31" })).rejects.toThrow("valid date");
    // The refused save must not have half-applied its rate change either.
    expect(h.db.all("rateSheets")[0].effectiveDate).toBe("2026-01-15");
    expect((h.db.all("rateSheets")[0].lanes as { rate: number }[])[0].rate).toBe(1000);
  });
  it("keeps the stored date when a later save arrives without one, so omission cannot wipe it", async () => {
    await h.save([h.lane("a", 1000)], { effectiveDate: "2026-01-15" });
    await h.save([h.lane("a", 1500)], { effectiveDate: undefined });
    expect(h.db.all("rateSheets")[0].effectiveDate).toBe("2026-01-15");
    expect((h.db.all("rateSheets")[0].lanes as { rate: number }[])[0].rate).toBe(1500);
  });
  it("trims the typed date, so a stray space does not become part of it", async () => {
    await h.save([h.lane("a", 1000)], { effectiveDate: "  2026-01-15  " });
    expect(h.db.all("rateSheets")[0].effectiveDate).toBe("2026-01-15");
  });
  it("accepts a later save that sends the stored date back unchanged", async () => {
    await h.save([h.lane("a", 1000)], { effectiveDate: "2026-01-15" });
    await h.save([h.lane("a", 1500)], { effectiveDate: "2026-01-15" });
    expect((h.db.all("rateSheets")[0].lanes as { rate: number }[])[0].rate).toBe(1500);
  });
  it("hands the settled date back so the editor can show exactly what is stored", async () => {
    const result = await h.call(sheets.saveLanes, { ...h.args, effectiveDate: "  2026-01-15 ", notes: "", oldDieselPrice: 20, newDieselPrice: 23, lanes: [h.lane("a", 1000)] }) as { effectiveDate: string };
    expect(result.effectiveDate).toBe("2026-01-15");
  });
});

describe("list and get", () => {
  it("reports a sheet per customer for the table", async () => {
    const h = await fixture();
    await h.call(sheets.create, { ...h.args, defaultPricingUnit: "full" });
    await h.save([h.lane("a", 1500), h.lane("b", 1600)]);
    const rows = await h.call(sheets.list, { token: "valid" }) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ customerName: "George Agri", laneCount: 2, effectiveDate: "2026-09-02", oldDieselPrice: 20, newDieselPrice: 23.15, isActive: true });
  });
  it("returns null for a customer with no sheet rather than failing", async () => {
    const h = await fixture();
    await expect(h.call(sheets.get, { token: "valid", customerId: h.inactiveId })).resolves.toBeNull();
  });
});

describe("setDefaultUnit", () => {
  it("changes the default and leaves it alone when unchanged", async () => {
    const h = await fixture();
    await h.call(sheets.create, { ...h.args, defaultPricingUnit: "full" });
    await h.call(sheets.setDefaultUnit, { ...h.args, defaultPricingUnit: "ton" });
    expect(h.db.all("rateSheets")[0].defaultPricingUnit).toBe("ton");
    await h.call(sheets.setDefaultUnit, { ...h.args, defaultPricingUnit: "ton" });
    expect(h.db.all("rateSheets")[0].defaultPricingUnit).toBe("ton");
  });
});

describe("deleteSheet", () => {
  it("refuses a non-admin", async () => {
    const h = await fixture();
    await h.call(sheets.create, { ...h.args, defaultPricingUnit: "full" });
    await expect(h.call(sheets.deleteSheet, { token: "regional", customerId: h.customerId, confirmName: "George Agri" })).rejects.toThrow("Admin access");
  });
  it("refuses when the customer has no sheet to delete", async () => {
    const h = await fixture();
    await expect(h.call(sheets.deleteSheet, { token: "valid", customerId: h.inactiveId, confirmName: "Dormant Ltd" })).rejects.toThrow("no rate sheet");
  });
  it("refuses a wrong, misspelled or differently-cased confirm word", async () => {
    const h = await fixture();
    await h.call(sheets.create, { ...h.args, defaultPricingUnit: "full" });
    // Surrounding whitespace is trimmed by the server, but case and wording must match exactly.
    for (const wrong of ["george agri", "George Agri Ltd", "George  Agri", ""])
      await expect(h.call(sheets.deleteSheet, { token: "valid", customerId: h.customerId, confirmName: wrong })).rejects.toThrow("Type \"George Agri\" exactly");
    expect(h.db.all("rateSheets")).toHaveLength(1);
  });
  it("deletes the sheet, keeps the customer, and the customer can start a fresh sheet", async () => {
    const h = await fixture();
    await h.call(sheets.create, { ...h.args, defaultPricingUnit: "full" });
    await h.save([h.lane("a", 1500)]);
    await h.call(sheets.deleteSheet, { token: "valid", customerId: h.customerId, confirmName: "  George Agri  " });
    expect(h.db.all("rateSheets")).toHaveLength(0);
    // The customer is untouched and still active.
    expect(await h.db.get(h.customerId)).toMatchObject({ name: "George Agri", isActive: true });
    // And a brand new sheet can be started for the same customer.
    const again = await h.call(sheets.create, { ...h.args, defaultPricingUnit: "ton" });
    expect(again).toBeTruthy();
    expect(h.db.all("rateSheets")).toHaveLength(1);
  });
});

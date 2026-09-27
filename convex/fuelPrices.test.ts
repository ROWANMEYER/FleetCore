import { describe, expect, it } from "vitest";
import * as prices from "./fuelPrices";
import { compositionEffect, percentChange, priceChange, priceProblem } from "./fuelPriceFields";

type Row = Record<string, unknown> & { _id: string };
/** A tiny in-memory stand-in for the Convex database, enough to exercise the diesel price rules. */
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
      // Convex removes a field when a patch sets it to undefined, so the stand-in drops the key rather than keeping it set to undefined.
      const next: Row = { ...row };
      for (const [field, v] of Object.entries(value)) {
        if (v === undefined) delete next[field];
        else next[field] = v;
      }
      rows.set(key, next);
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
        withIndex: (_index: string, filter?: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
          if (!filter) return match(all(), () => true);
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
  await db.insert("sessions", { userId, token: "valid", expiresAt: Date.now() + 60_000 });
  await db.insert("sessions", { userId, token: "expired", expiresAt: Date.now() - 1 });
  const regionalId = await db.insert("users", { email: "regional@example.com", role: "regional" });
  await db.insert("sessions", { userId: regionalId, token: "regional", expiresAt: Date.now() + 60_000 });
  const save = (effectiveDate: string, pricePerLitre: number, patch: Record<string, unknown> = {}) =>
    call(prices.save, { token: "valid", effectiveDate, pricePerLitre, ...patch });
  return { db, call, save };
}

describe("priceChange", () => {
  it("works out the movement from the price before it", () => {
    expect(priceChange(25.28, 22.98)).toBe(2.3);
    expect(priceChange(24.4, 25.28)).toBe(-0.88);
    expect(priceChange(20.37, 19.37)).toBe(1);
  });
  it("has no movement for the first price, rather than claiming the price never moved", () => {
    expect(priceChange(22.98, null)).toBeNull();
  });
  it("reports an unchanged price as a real zero", () => {
    expect(priceChange(20.37, 20.37)).toBe(0);
  });
});

describe("percentChange", () => {
  it("measures the movement against the price before it", () => {
    expect(percentChange(25.28, 22.98)).toBe(10.01);
    expect(percentChange(24.4, 25.28)).toBe(-3.48);
    expect(percentChange(23.94, 24.4)).toBe(-1.89);
    expect(percentChange(24.09, 23.94)).toBe(0.63);
  });
  it("has no percentage for the first price", () => {
    expect(percentChange(22.98, null)).toBeNull();
  });
  it("has no percentage against a price of zero, which has nothing to divide by", () => {
    expect(percentChange(22.98, 0)).toBeNull();
  });
  it("reproduces the real published diesel history, row for row", () => {
    // Every row of the published SA diesel history, with the movement it reported. Only the rows whose
    // percentage survived the paste carry one here; from 2024 the sheet kept a levy figure in that column
    // instead, so those changes are checked and no percentage is invented for them.
    const history: [string, number, number | null, number | null][] = [
      ["2022-06-01", 22.98, null, null], ["2022-07-06", 25.28, 2.3, 10.01], ["2022-08-03", 24.4, -0.88, -3.48],
      ["2022-09-07", 23.94, -0.46, -1.89], ["2022-10-05", 24.09, 0.15, 0.63], ["2022-11-02", 25.52, 1.43, 5.94],
      ["2022-12-07", 24.0, -1.52, -5.96], ["2023-01-04", 21.35, -2.65, -11.04], ["2023-02-01", 21.34, -0.01, -0.05],
      ["2023-03-01", 21.65, 0.31, 1.45], ["2023-04-05", 20.83, -0.82, -3.79], ["2023-05-03", 20.36, -0.47, -2.26],
      ["2023-06-07", 19.56, -0.8, -3.93], ["2023-07-05", 19.68, 0.12, 0.61], ["2023-08-02", 20.39, 0.71, 3.61],
      ["2023-09-06", 23.15, 2.76, 13.54], ["2023-10-04", 25.09, 1.94, 8.38], ["2023-11-01", 24.27, -0.82, -3.27],
      ["2023-12-06", 21.86, -2.41, -9.93], ["2024-01-03", 20.6, -1.26, -5.76], ["2024-02-07", 21.3, 0.7, 3.4],
      ["2024-03-06", 22.49, 1.19, 5.59], ["2024-04-03", 22.4, -0.09, -0.4], ["2024-05-01", 22.04, -0.36, -1.61],
      ["2024-06-05", 20.96, -1.08, null], ["2024-07-03", 20.72, -0.24, null], ["2024-08-07", 20.55, -0.17, null],
      ["2024-09-04", 19.5, -1.05, null], ["2024-10-02", 18.38, -1.12, null], ["2024-11-06", 18.58, 0.2, null],
      ["2024-12-04", 19.14, 0.56, null], ["2025-01-01", 19.25, 0.11, null], ["2025-02-05", 20.26, 1.01, null],
      ["2025-03-05", 20.22, -0.04, null], ["2025-04-02", 19.12, -1.1, null], ["2025-05-06", 18.71, -0.41, null],
      ["2025-06-04", 18.34, -0.37, null], ["2025-07-02", 19.18, 0.84, null], ["2025-08-06", 19.81, 0.63, null],
      ["2025-09-03", 19.24, -0.57, null], ["2025-10-01", 19.16, -0.08, null], ["2025-11-05", 18.97, -0.19, null],
      ["2025-12-03", 19.79, 0.82, null], ["2026-01-07", 18.29, -1.5, null], ["2026-02-04", 17.72, -0.57, null],
      ["2026-03-04", 18.37, 0.65, null], ["2026-03-12", 19.37, 1, null], ["2026-03-24", 20.37, 1, null],
      ["2026-04-01", 27.88, 7.51, null], ["2026-05-06", 33.15, 5.27, null], ["2026-06-03", 30.53, -2.62, null],
      ["2026-07-01", 26.94, -3.59, null], ["2026-08-05", 28.17, 1.23, null], ["2026-09-02", 31.32, 3.15, null],
    ];
    history.forEach(([date, price, expectedChange, expectedPercent], index) => {
      const before = index > 0 ? history[index - 1][1] : null;
      if (expectedChange !== null) expect(priceChange(price, before), `change on ${date}`).toBe(expectedChange);
      if (expectedPercent !== null) expect(percentChange(price, before), `percent on ${date}`).toBe(expectedPercent);
    });
  });
});

describe("compositionEffect", () => {
  it("carries the stated share of the move, such as half of the percentage", () => {
    expect(compositionEffect(10.01, 50)).toBe(5.01);
    expect(compositionEffect(10, 50)).toBe(5);
    expect(compositionEffect(10, 40)).toBe(4);
  });
  it("carries a fall as a fall, rather than making it look like a rise", () => {
    expect(compositionEffect(-5.11, 40)).toBe(-2.04);
  });
  it("rounds to two decimals, because that is how the percentage is shown", () => {
    // -5.11% of which 40% is carried works out to -2.044.
    expect(compositionEffect(-5.11, 40)).toBe(-2.04);
  });
  it("carries the whole move at a composition of 100, and none at zero", () => {
    expect(compositionEffect(7.51, 100)).toBe(7.51);
    expect(compositionEffect(7.51, 0)).toBe(0);
  });
  it("carries an unchanged price as a real zero", () => {
    expect(compositionEffect(0, 40)).toBe(0);
  });
  it("has no carried figure for the first price, because there is no move to carry", () => {
    expect(compositionEffect(null, 40)).toBeNull();
  });
  it("has no carried figure when no composition was recorded", () => {
    expect(compositionEffect(10.01, undefined)).toBeNull();
  });
  it("does not treat a missing composition as zero, which would claim the move is carried in full", () => {
    expect(compositionEffect(10.01, null)).toBeNull();
  });
});

describe("priceProblem", () => {
  const form = (patch: Partial<{ effectiveDate: string; price: string; compositionPercent: string }> = {}) => ({ effectiveDate: "2026-09-02", price: "31.32", ...patch });

  it("accepts a complete price", () => {
    expect(priceProblem(form())).toBeNull();
  });
  it("rejects a date that is not a real calendar date", () => {
    expect(priceProblem(form({ effectiveDate: "2026-02-31" }))).toBe("needs an effective date");
    expect(priceProblem(form({ effectiveDate: "02/09/2026" }))).toBe("needs an effective date");
    expect(priceProblem(form({ effectiveDate: "" }))).toBe("needs an effective date");
  });
  it("rejects a price that is not a number", () => {
    expect(priceProblem(form({ price: "abc" }))).toBe("needs a diesel price");
    expect(priceProblem(form({ price: "" }))).toBe("needs a diesel price");
  });
  it("rejects free fuel, which is a typo rather than a discount", () => {
    expect(priceProblem(form({ price: "0" }))).toBe("needs a price above zero");
    expect(priceProblem(form({ price: "-5" }))).toBe("needs a price above zero");
  });
  it("rejects a misplaced decimal, which would become a hundred rand a litre", () => {
    expect(priceProblem(form({ price: "310" }))).toBe("needs a price below 100");
  });
  it("accepts a composition, or none at all", () => {
    expect(priceProblem(form({ compositionPercent: "40" }))).toBeNull();
    expect(priceProblem(form({ compositionPercent: "40.5" }))).toBeNull();
    expect(priceProblem(form({ compositionPercent: "" }))).toBeNull();
    expect(priceProblem(form())).toBeNull();
  });
  it("rejects a composition that is not a share of the price", () => {
    expect(priceProblem(form({ compositionPercent: "-1" }))).toBe("needs a composition between 0 and 100%");
    expect(priceProblem(form({ compositionPercent: "101" }))).toBe("needs a composition between 0 and 100%");
  });
  it("rejects a composition that is not a number", () => {
    expect(priceProblem(form({ compositionPercent: "abc" }))).toBe("needs a composition of zero or more, or leave it blank");
  });
  it("still refuses a bad price, because a composition does not excuse one", () => {
    expect(priceProblem(form({ price: "0", compositionPercent: "40" }))).toBe("needs a price above zero");
  });
});

describe("access", () => {
  it("refuses a missing or expired session", async () => {
    const h = await fixture();
    await expect(h.call(prices.list, { token: "nope" })).rejects.toThrow("Sign in again");
    await expect(h.call(prices.list, { token: "expired" })).rejects.toThrow("Sign in again");
  });
  it("refuses a non-admin, who must not be able to set the price of fuel", async () => {
    const h = await fixture();
    await expect(h.call(prices.list, { token: "regional" })).rejects.toThrow("Admin access");
    await expect(h.save("2026-09-02", 31.32, { token: "regional" })).rejects.toThrow("Admin access");
  });
});

describe("save", () => {
  it("stores the date and the price", async () => {
    const h = await fixture();
    await h.save("2026-09-02", 31.32);
    expect(h.db.all("fuelPrices")[0]).toMatchObject({ effectiveDate: "2026-09-02", pricePerLitre: 31.32, notes: "" });
  });
  it("rounds the stored price to cents rather than keeping floating point noise", async () => {
    const h = await fixture();
    await h.save("2026-09-02", 31.3249);
    expect(h.db.all("fuelPrices")[0].pricePerLitre).toBe(31.32);
  });
  it("amends the price for a date that already has one instead of stacking a second row", async () => {
    const h = await fixture();
    const first = await h.save("2026-09-02", 31.32);
    const second = await h.save("2026-09-02", 30.1);
    expect(second).toBe(first);
    expect(h.db.all("fuelPrices")).toHaveLength(1);
    expect(h.db.all("fuelPrices")[0].pricePerLitre).toBe(30.1);
  });
  it("refuses a date that is not a real calendar date", async () => {
    const h = await fixture();
    await expect(h.save("2026-02-31", 31.32)).rejects.toThrow("valid effective date");
  });
  it("refuses a price of zero, and says so in the terms a user would use", async () => {
    const h = await fixture();
    await expect(h.save("2026-09-02", 0)).rejects.toThrow("above zero");
    await expect(h.save("2026-09-02", -1)).rejects.toThrow("above zero");
  });
  it("refuses a price with a misplaced decimal", async () => {
    const h = await fixture();
    await expect(h.save("2026-09-02", 310)).rejects.toThrow("misplaced decimal");
  });
  it("refuses notes past the limit", async () => {
    const h = await fixture();
    await expect(h.save("2026-09-02", 31.32, { notes: "x".repeat(401) })).rejects.toThrow("Notes are limited to 400");
  });
  it("stores the composition the user entered", async () => {
    const h = await fixture();
    await h.save("2026-09-02", 31.32, { compositionPercent: 40 });
    expect(h.db.all("fuelPrices")[0].compositionPercent).toBe(40);
  });
  it("keeps a composition of zero apart from no composition at all", async () => {
    const h = await fixture();
    await h.save("2026-09-02", 31.32, { compositionPercent: 0 });
    await h.save("2026-09-03", 31.5);
    const rows = h.db.all("fuelPrices");
    expect(rows.find(r => r.effectiveDate === "2026-09-02")!.compositionPercent).toBe(0);
    // Nothing recorded is genuinely absent, not a hidden zero that would read as "recorded as 0%".
    expect(rows.find(r => r.effectiveDate === "2026-09-03")!.compositionPercent).toBeUndefined();
  });
  it("rounds the composition to two decimals, matching the way percentages are shown", async () => {
    const h = await fixture();
    await h.save("2026-09-02", 31.32, { compositionPercent: 40.567 });
    expect(h.db.all("fuelPrices")[0].compositionPercent).toBe(40.57);
  });
  it("clears the composition when an amended price is saved without one", async () => {
    const h = await fixture();
    await h.save("2026-09-02", 31.32, { compositionPercent: 40 });
    await h.save("2026-09-02", 31.4);
    expect(h.db.all("fuelPrices")).toHaveLength(1);
    expect(h.db.all("fuelPrices")[0].compositionPercent).toBeUndefined();
  });
  it("refuses a composition that is not a share of the price", async () => {
    const h = await fixture();
    await expect(h.save("2026-09-02", 31.32, { compositionPercent: 101 })).rejects.toThrow("between 0 and 100%");
    await expect(h.save("2026-09-02", 31.32, { compositionPercent: -1 })).rejects.toThrow("between 0 and 100%");
  });
  it("carries the composition through to the list", async () => {
    const h = await fixture();
    await h.save("2022-07-06", 25.28, { compositionPercent: 45 });
    await h.save("2026-06-01", 22.98, { compositionPercent: 40 });
    const rows = await h.call(prices.list, { token: "valid" }) as { compositionPercent?: number }[];
    // Oldest first, so the 2022 row with its 45 comes before the 2026 one.
    expect(rows.map(r => r.compositionPercent)).toEqual([45, 40]);
  });
  it("works the carried percentage out for each row from its own move", async () => {
    const h = await fixture();
    await h.save("2022-06-01", 22.98, { compositionPercent: 40 });
    await h.save("2022-07-06", 25.28, { compositionPercent: 50 });
    await h.save("2022-08-03", 24.4, { compositionPercent: 50 });
    const rows = await h.call(prices.list, { token: "valid" }) as { effectiveDate: string; percentChange: number | null; carriedPercent: number | null }[];
    // The first price has no move to carry, so it carries nothing.
    expect(rows[0]).toMatchObject({ effectiveDate: "2022-06-01", percentChange: null, carriedPercent: null });
    // Half of a 10.01% rise, then half of a 3.48% fall.
    expect(rows[1]).toMatchObject({ percentChange: 10.01, carriedPercent: 5.01 });
    expect(rows[2]).toMatchObject({ percentChange: -3.48, carriedPercent: -1.74 });
  });
  it("leaves the carried percentage empty on a row with no composition", async () => {
    const h = await fixture();
    await h.save("2022-06-01", 22.98, { compositionPercent: 40 });
    await h.save("2022-07-06", 25.28);
    const rows = await h.call(prices.list, { token: "valid" }) as { percentChange: number | null; carriedPercent: number | null }[];
    expect(rows[1].percentChange).toBe(10.01);
    // The move happened, but with no composition recorded there is nothing to say it is carried.
    expect(rows[1].carriedPercent).toBeNull();
  });
});

describe("list", () => {
  it("reports the movement on every row, oldest effective date first", async () => {
    const h = await fixture();
    await h.save("2022-06-01", 22.98);
    await h.save("2022-07-06", 25.28);
    await h.save("2022-08-03", 24.4);
    const rows = await h.call(prices.list, { token: "valid" }) as { effectiveDate: string; change: number | null; percentChange: number | null }[];
    expect(rows.map(r => r.effectiveDate)).toEqual(["2022-06-01", "2022-07-06", "2022-08-03"]);
    expect(rows[1]).toMatchObject({ change: 2.3, percentChange: 10.01 });
    expect(rows[2]).toMatchObject({ change: -0.88, percentChange: -3.48 });
  });
  it("gives the earliest price no movement at all, because nothing came before it", async () => {
    const h = await fixture();
    await h.save("2022-06-01", 22.98);
    const rows = await h.call(prices.list, { token: "valid" }) as { change: number | null; percentChange: number | null }[];
    expect(rows[0].change).toBeNull();
    expect(rows[0].percentChange).toBeNull();
  });
  it("returns nothing rather than failing when no price has been recorded", async () => {
    const h = await fixture();
    expect(await h.call(prices.list, { token: "valid" })).toEqual([]);
  });
  it("sorts by date, not by the order the rows were entered", async () => {
    const h = await fixture();
    await h.save("2022-08-03", 24.4);
    await h.save("2022-06-01", 22.98);
    await h.save("2022-07-06", 25.28);
    const rows = await h.call(prices.list, { token: "valid" }) as { effectiveDate: string }[];
    expect(rows.map(r => r.effectiveDate)).toEqual(["2022-06-01", "2022-07-06", "2022-08-03"]);
  });
  it("works the movements out from the prices that are left after a removal", async () => {
    const h = await fixture();
    await h.save("2022-06-01", 22.98);
    await h.save("2022-07-06", 25.28);
    const middle = await h.save("2022-08-03", 24.4);
    await h.call(prices.remove, { token: "valid", id: middle });
    const rows = await h.call(prices.list, { token: "valid" }) as { effectiveDate: string; change: number | null }[];
    expect(rows).toHaveLength(2);
    // The row left at the end now measures against the one before it, because the price between them is gone.
    expect(rows[1]).toMatchObject({ effectiveDate: "2022-07-06", change: 2.3 });
  });
});

describe("remove", () => {
  it("removes one price", async () => {
    const h = await fixture();
    const id = await h.save("2026-09-02", 31.32);
    await h.call(prices.remove, { token: "valid", id });
    expect(h.db.all("fuelPrices")).toHaveLength(0);
  });
  it("says so plainly when the price is already gone, rather than reporting a missing id", async () => {
    const h = await fixture();
    const id = await h.save("2026-09-02", 31.32);
    await h.call(prices.remove, { token: "valid", id });
    await expect(h.call(prices.remove, { token: "valid", id })).rejects.toThrow("already been removed");
  });
  it("refuses a non-admin removing a price", async () => {
    const h = await fixture();
    const id = await h.save("2026-09-02", 31.32);
    await expect(h.call(prices.remove, { token: "regional", id })).rejects.toThrow("Admin access");
    expect(h.db.all("fuelPrices")).toHaveLength(1);
  });
});

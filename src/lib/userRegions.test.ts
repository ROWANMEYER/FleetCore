import { describe, expect, it } from "vitest";
import { createUserInternal, updateUserInternal, selectScopeRegion, canAccessRegion, getSessionUser } from "@/convex/userSessions";
import { getUserRegions, getUserRegionOptions } from "./regions";

type Row = Record<string, unknown>;
type Definition = { _handler: (ctx: unknown, args: Row) => Promise<unknown> };
function fixture() {
  const users = new Map<string, Row>();
  let sequence = 0;
  const put = (id: string, row: Row) => users.set(id, { _id: id, ...row });
  const db = {
    get: async (id: string) => users.get(id) ?? null,
    insert: async (_table: string, row: Row) => { const id = `user-${++sequence}`; put(id, row); return id; },
    patch: async (id: string, patch: Row) => { const row = users.get(id)!; for (const [key, value] of Object.entries(patch)) { if (value === undefined) delete row[key]; else row[key] = value; } },
    query: (table: string) => {
      const filters: ((row: Row) => boolean)[] = [];
      const index = { eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return index; } };
      const rows = () => table === "sessions" ? [{ userId: "legacy", expiresAt: Date.now() + 60000 }] : [...users.values()].filter(row => filters.every(filter => filter(row)));
      const chain = { withIndex: (_name: string, cb: (q: typeof index) => unknown) => { cb(index); return chain; }, first: async () => rows()[0] ?? null, take: async (n: number) => rows().slice(0, n) };
      return chain;
    },
  };
  const run = (definition: unknown, args: Row) => (definition as Definition)._handler({ db }, args);
  return { users, put, run };
}
const newUser = { email: "new@example.invalid", passwordHash: "synthetic-unused", role: "regional" };
describe("Exclusive ownership of multiple regions", () => {
  it("preserves legacy assignments and returns them in the session view", async () => {
    const f = fixture(); f.put("legacy", { role: "regional", email: "legacy@example.invalid", region: "garden_route" });
    const result = await f.run(getSessionUser, { token: "synthetic" });
    expect(result).toMatchObject({ user: { region: "garden_route", regions: ["garden_route"] } });
    expect(f.users.get("legacy")).not.toHaveProperty("regions");
  });
  it("stores several regions and deduplicates repeated choices", async () => {
    const f = fixture(); await f.run(createUserInternal, { ...newUser, regions: ["transvaal", "kaap", "transvaal"] });
    expect([...f.users.values()][0]).toMatchObject({ region: "transvaal", regions: ["transvaal", "kaap"] });
  });
  it.each([{ region: "kaap" }, { regions: ["kaap", "durban"] }])("rejects overlap with existing ownership %j atomically", async assigned => {
    const f = fixture(); f.put("owner", { email: "owner@example.invalid", role: "regional", ...assigned });
    await expect(f.run(createUserInternal, { ...newUser, regions: ["transvaal", "kaap"] })).rejects.toThrow("KAAP is already allocated");
    expect(f.users.size).toBe(1);
  });
  it("retains the same user's regions, releases a removed region and permits reassignment afterwards", async () => {
    const f = fixture(); f.put("owner", { role: "regional", email: "owner@example.invalid", region: "kaap", regions: ["kaap", "transvaal"] });
    await f.run(updateUserInternal, { userId: "owner", regions: ["kaap", "transvaal", "durban"] });
    await expect(f.run(createUserInternal, { ...newUser, region: "transvaal" })).rejects.toThrow("already allocated");
    await f.run(updateUserInternal, { userId: "owner", regions: ["kaap", "durban"] });
    await f.run(createUserInternal, { ...newUser, region: "transvaal" });
    expect(f.users.size).toBe(2);
    expect(f.users.get("owner")!.regions).toEqual(["kaap", "durban"]);
  });
  it("rejects an empty assignment and an overlapping edit without partially changing the user", async () => {
    const f = fixture(); f.put("owner", { role: "regional", email: "owner@example.invalid", region: "kaap" });
    f.put("edited", { role: "regional", email: "edited@example.invalid", region: "durban" });
    const before = structuredClone(f.users.get("edited"));
    for (const regions of [[], ["durban", "kaap"]]) await expect(f.run(updateUserInternal, { userId: "edited", regions })).rejects.toThrow();
    expect(f.users.get("edited")).toEqual(before);
  });
  it("does not let a password-only update replace region assignments", async () => {
    const f = fixture(); f.put("owner", { role: "regional", region: "kaap", regions: ["kaap", "durban"] });
    await f.run(updateUserInternal, { userId: "owner", passwordHash: "new-synthetic" });
    expect(f.users.get("owner")!.regions).toEqual(["kaap", "durban"]);
  });
  it("releases exclusive ownership when a regional user becomes an administrator", async () => {
    const f = fixture(); f.put("owner", { role: "regional", region: "kaap", regions: ["kaap", "durban"] });
    await f.run(updateUserInternal, { userId: "owner", role: "admin" });
    expect(f.users.get("owner")).not.toHaveProperty("region"); expect(f.users.get("owner")).not.toHaveProperty("regions");
    await f.run(createUserInternal, { ...newUser, regions: ["kaap", "durban"] });
  });
  it("selects only assigned regions, excludes other choices and fails closed with no assignment", () => {
    const user = { role: "regional", region: "kaap" as const, regions: ["kaap", "durban"] as ("kaap" | "durban")[] };
    expect(selectScopeRegion(user, "durban")).toBe("durban");
    expect(selectScopeRegion(user, "transvaal")).toBe("kaap");
    expect(() => selectScopeRegion(user, "transvaal", true)).toThrow("not assigned");
    expect(selectScopeRegion(user, "durban", true)).toBe("durban");
    expect(canAccessRegion(user, "durban")).toBe(true); expect(canAccessRegion(user, "transvaal")).toBe(false);
    expect(getUserRegionOptions(user).map(option => option.value)).toEqual(["kaap", "durban"]);
    expect(getUserRegions({ region: "kaap", regions: [] })).toEqual([]);
    expect(() => selectScopeRegion({ role: "regional", region: null })).toThrow("no region assigned");
  });
});

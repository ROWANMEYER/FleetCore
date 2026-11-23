import { describe, expect, it } from "vitest";
import { getRegionLabel, isRegion, REGIONS } from "./regions";
import { regionValidator } from "@/convex/regionFields";
import { updateRouteRegion } from "@/convex/dailyRoutes";
import { resolveEffectiveRegion } from "@/convex/userSessions";

describe("Operating region contract and access scope", () => {
  it("keeps UI keys in sync with persisted backend values", () => {
    expect(regionValidator.members.map(member => member.value)).toEqual([...REGIONS]);
    for (const unknown of ["all", "", "Cape Town", undefined, null]) {
      expect(isRegion(unknown)).toBe(false);
      expect(getRegionLabel(unknown as string)).toBeNull();
    }
  });
  it.each(["transvaal", "kaap", "durban"] as const)("locks a regional user to %s while allowing admin filters", async region => {
    let role = "regional";
    const ctx = { db: {
      query: () => ({ withIndex: () => ({ first: async () => ({ userId: "user", expiresAt: Date.now() + 60000 }) }) }),
      get: async () => ({ role, region }),
    } };
    expect(await resolveEffectiveRegion(ctx, "synthetic", "garden_route")).toBe(region);
    expect(await resolveEffectiveRegion(ctx, "synthetic")).toBe(region);
    role = "admin";
    expect(await resolveEffectiveRegion(ctx, "synthetic", region)).toBe(region);
    expect(await resolveEffectiveRegion(ctx, "synthetic")).toBeNull();
  });
  it.each(["transvaal", "kaap", "durban"])("allows only admins to reassign Planner routes to %s", async region => {
    let role = "admin";
    const route: Record<string, unknown> = { region: "garden_route", status: "planned", rate: 1234, loads: [{ client: "Preserve" }] };
    const before = structuredClone(route);
    const ctx = { db: {
      query: () => ({ withIndex: () => ({ first: async () => ({ userId: "user", expiresAt: Date.now() + 60000 }) }) }),
      get: async (id: string) => id === "user" ? { role, region } : route,
      patch: async (_id: string, patch: Record<string, unknown>) => Object.assign(route, patch),
    } };
    const run = () => (updateRouteRegion as unknown as { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> })._handler(ctx, { routeId: "route", region, token: "synthetic" });
    await run(); expect(route).toEqual({ ...before, region });
    role = "regional";
    await expect(run()).rejects.toThrow("Only administrators");
    role = "admin"; route.status = "locked";
    await expect(run()).rejects.toThrow("locked route");
    expect(route.rate).toBe(1234); expect(route.loads).toEqual(before.loads);
  });

});

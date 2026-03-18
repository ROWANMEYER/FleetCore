import { internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("drivers").collect();
  },
});

export const getById = query({
  args: { driverId: v.id("drivers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.driverId);
  },
});

export const getDriver = internalQuery({
  args: { driverId: v.id("drivers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.driverId);
  },
});

export const getAllDrivers = internalQuery({
  handler: async (ctx) => {
    return await ctx.db.query("drivers").collect();
  },
});

/**
 * Driver document expiries (License & PDP)
 * - Joins appSettings thresholds
 * - Emits items within stage3 window or expired
 * - Sorted by daysUntilExpiry ascending
 */
export const getDriverDocumentExpiries = query({
  handler: async (ctx) => {
    const drivers = await ctx.db.query("drivers").collect();
    const settings = await ctx.runQuery(internal.settings.getAppSettingsInternal, {});

    const s1 = settings?.stage1AlertDays ?? 3;
    const s2 = settings?.stage2AlertDays ?? 7;
    const s3 = settings?.stage3AlertDays ?? 14;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const calcDays = (dateStr?: string | null) => {
      if (!dateStr) return null;
      // Expect YYYY-MM-DD; fallback to Date parse
      const ts = new Date(dateStr + "T00:00:00Z");
      if (isNaN(ts.getTime())) return null;
      const diffMs = ts.getTime() - today.getTime();
      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    };

    type Item = {
      driverId: string;
      driverName: string;
      docType: "License" | "PDP";
      expiryDate: string;
      daysUntilExpiry: number;
      tier: "expired" | "critical" | "warning" | "notice";
    };

    const out: Item[] = [];

    for (const d of drivers as any[]) {
      const name = d.driverName || d.name || "";
      const idStr = d.driverId || d._id;

      const licenseDays = calcDays(d.licenseExpiryDate);
      if (licenseDays !== null) {
        let tier: Item["tier"] | null = null;
        if (licenseDays < 0) tier = "expired";
        else if (licenseDays <= s1) tier = "critical";
        else if (licenseDays <= s2) tier = "warning";
        else if (licenseDays <= s3) tier = "notice";
        if (tier) {
          out.push({
            driverId: String(idStr),
            driverName: String(name),
            docType: "License",
            expiryDate: String(d.licenseExpiryDate),
            daysUntilExpiry: licenseDays,
            tier,
          });
        }
      }

      const pdpDays = calcDays(d.pdpExpiryDate);
      if (pdpDays !== null) {
        let tier: Item["tier"] | null = null;
        if (pdpDays < 0) tier = "expired";
        else if (pdpDays <= s1) tier = "critical";
        else if (pdpDays <= s2) tier = "warning";
        else if (pdpDays <= s3) tier = "notice";
        if (tier) {
          out.push({
            driverId: String(idStr),
            driverName: String(name),
            docType: "PDP",
            expiryDate: String(d.pdpExpiryDate),
            daysUntilExpiry: pdpDays,
            tier,
          });
        }
      }
    }

    out.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    return out;
  },
});

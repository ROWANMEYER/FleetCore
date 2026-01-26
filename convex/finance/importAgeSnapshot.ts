import { action, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { parseAgeAnalysis } from "./lib/parseAgeAnalysis";
import { validateAgeRows } from "./lib/validateAgeRows";

// Helper query for the action check
export const getSnapshotByMonth = internalQuery({
  args: { month: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ageSnapshots")
      .withIndex("by_month", (q) => q.eq("month", args.month))
      .first();
  },
});

// Internal mutation to save the snapshot atomically
export const saveSnapshot = internalMutation({
  args: {
    month: v.string(),
    fileName: v.string(),
    rows: v.array(
      v.object({
        accountNumber: v.string(),
        clientName: v.string(),
        days120: v.number(),
        days90: v.number(),
        days60: v.number(),
        days30: v.number(),
        current: v.number(),
        totalDue: v.number(),
        originalRowIndex: v.number(),
      })
    ),
    importedBy: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Uniqueness Check (Double check to be safe)
    const existing = await ctx.db
      .query("ageSnapshots")
      .withIndex("by_month", (q) => q.eq("month", args.month))
      .first();

    if (existing) {
      throw new Error(`Snapshot for month ${args.month} already exists.`);
    }

    // 2. Insert Snapshot Header
    const snapshotId = await ctx.db.insert("ageSnapshots", {
      month: args.month,
      importedAt: Date.now(),
      importedBy: args.importedBy,
      fileName: args.fileName,
      status: "active",
    });

    // 3. Insert Rows
    for (const row of args.rows) {
      await ctx.db.insert("ageSnapshotRows", {
        snapshotId,
        ...row,
      });
    }

    return snapshotId;
  },
});

// Public Action to handle the import process
export const importSnapshot = action({
  args: {
    month: v.string(), // YYYY-MM
    fileName: v.string(),
    rows: v.array(
      v.object({
        accountNumber: v.string(),
        clientName: v.string(),
        days120: v.number(),
        days90: v.number(),
        days60: v.number(),
        days30: v.number(),
        current: v.number(),
        totalDue: v.number(),
        originalRowIndex: v.number(),
      })
    ),
    importedBy: v.string(), // For now, passed explicitly or could be auth derived
  },
  handler: async (ctx, args) => {
    // 1. Check existence (Optimistic check before parsing)
    const existing = await ctx.runQuery(internal.finance.importAgeSnapshot.getSnapshotByMonth, { month: args.month });
    if (existing) {
        throw new Error(`Snapshot for month ${args.month} already exists.`);
    }

    // 2. Validate
    const validationErrors = validateAgeRows(args.rows);
    if (validationErrors.length > 0) {
      // Format errors for return
      const errorMsg = validationErrors
        .map((e) => `Row ${e.rowIndex} (${e.accountNumber}): ${e.message}`)
        .join("\n");
      throw new Error(`Validation failed with ${validationErrors.length} errors:\n${errorMsg}`);
    }

    // 3. Atomic Save
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.runMutation((internal as any).finance.importAgeSnapshot.saveSnapshot, {
      month: args.month,
      fileName: args.fileName,
      rows: args.rows,
      importedBy: args.importedBy,
    });

    return { success: true, count: args.rows.length };
  },
});




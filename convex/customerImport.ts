import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { resolveUserScope } from "./userSessions";
import { normalizeCustomerName } from "./customerValidation";
import { invalidCustomerImportRow, planCustomerImport } from "./customerImportRules";

export const importAgeAnalysis = mutation({
  args: { token: v.string(), rows: v.array(v.object({ sourceRow: v.number(), accountNumber: v.string(), name: v.string(), isActive: v.boolean(), contactPerson: v.optional(v.string()), email: v.optional(v.string()), phone: v.optional(v.string()), address: v.optional(v.string()), vatNumber: v.optional(v.string()), note: v.optional(v.string()) })) },
  handler: async (ctx, args) => {
    const scope = await resolveUserScope(ctx, args.token);
    if (scope?.role !== "admin") throw new Error("Admin access required.");
    if (!args.rows.length || args.rows.length > 100) throw new Error("Import between 1 and 100 customer rows per batch.");
    const filePlan = planCustomerImport(args.rows, []);
    const results: { sourceRow: number; name: string; status: "imported" | "skipped"; reason: string | null }[] = [];
    for (const { row, reason: fileReason } of filePlan) {
      const normalizedName = normalizeCustomerName(row.name); const accountNumber = row.accountNumber.trim();
      let reason = invalidCustomerImportRow(row) ?? fileReason;
      if (!reason) {
        const account = await ctx.db.query("customers").withIndex("by_accountNumber", q => q.eq("accountNumber", accountNumber)).first();
        const name = await ctx.db.query("customers").withIndex("by_normalizedName", q => q.eq("normalizedName", normalizedName)).first();
        if (account) reason = `Account already belongs to ${account.name}; unchanged.`;
        else if (name) reason = `Customer name already exists${name.isActive ? "" : " (inactive)"}; unchanged.`;
      }
      if (reason) { results.push({ sourceRow: row.sourceRow, name: row.name, status: "skipped", reason }); continue; }
      await ctx.db.insert("customers", { name: row.name.trim(), normalizedName, accountNumber, isActive: row.isActive, contactPerson: row.contactPerson?.trim() || undefined, email: row.email?.trim() || undefined, phone: row.phone?.trim() || undefined, address: row.address?.trim() || undefined, vatNumber: row.vatNumber?.trim() || undefined, note: row.note?.trim() || undefined, createdAt: Date.now() });
      results.push({ sourceRow: row.sourceRow, name: row.name, status: "imported", reason: null });
    }
    return results;
  },
});

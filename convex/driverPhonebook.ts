import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { driverPhoneNumber } from "./driverPhoneFields";
import { requireDriverContactEditor } from "./lib/driverContactAccess";
import { cleanAdditionalPhones, driverContactNumbers } from "../src/lib/driverPhones";

const contact = v.object({
  _id: v.id("drivers"),
  name: v.string(),
  driverId: v.string(),
  phone: v.string(),
  additionalPhones: v.array(driverPhoneNumber),
  numbers: v.array(driverPhoneNumber),
  photoUrl: v.union(v.string(), v.null()),
  photoOriginalUrl: v.union(v.string(), v.null()),
});

/** Public mobile directory: only contact fields, never identity or access data. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(contact), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    const result = await ctx.db.query("drivers").withIndex("by_driverName").paginate(args.paginationOpts);
    const active = result.page.filter(d => !d.isTest && (d.subcontractorId ? d.subStatus !== "inactive" : d.status !== "inactive"));
    const page = await Promise.all(active.map(async d => {
      const storageId = d.photoStorageId ? ctx.db.system.normalizeId("_storage", d.photoStorageId) : null;
      const storedPhoto = storageId ? await ctx.storage.getUrl(storageId) : null;
      const photoUrl = storedPhoto || d.photoUrl || d.photoOriginalUrl || null;
      return {
        _id: d._id, name: d.driverName || d.name || "Unnamed driver", driverId: d.driverId || "",
        phone: d.phone || "", additionalPhones: d.additionalPhones || [],
        numbers: driverContactNumbers(d.phone, d.additionalPhones),
        photoUrl, photoOriginalUrl: d.photoOriginalUrl || photoUrl,
      };
    }));
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

export const saveNumbers = mutation({
  args: { token: v.string(), driverId: v.id("drivers"), phone: v.string(), additionalPhones: v.array(driverPhoneNumber) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireDriverContactEditor(ctx, args.token);
    const driver = await ctx.db.get(args.driverId);
    if (!driver || driver.isTest) throw new Error("Driver not found.");
    const phone = args.phone.trim();
    const additionalPhones = cleanAdditionalPhones(phone, args.additionalPhones);
    await ctx.db.patch(args.driverId, { phone, additionalPhones });
    return null;
  },
});

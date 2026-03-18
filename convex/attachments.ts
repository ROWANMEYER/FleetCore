import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ============================================================================
// UPLOAD LOGIC
// ============================================================================

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveAttachment = mutation({
  args: {
    taskId: v.optional(v.id("tasks")),
    refId: v.optional(v.string()),
    refType: v.optional(v.string()),
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    uploadedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const fileUrl = await ctx.storage.getUrl(args.storageId);
    if (!fileUrl) throw new Error("Failed to get file URL");

    return await ctx.db.insert("attachments", {
      taskId: args.taskId,
      refId: args.refId,
      refType: args.refType,
      storageId: args.storageId,
      fileUrl,
      fileName: args.fileName,
      fileType: args.fileType,
      uploadedAt: Date.now(),
      uploadedBy: args.uploadedBy ?? "user",
    });
  },
});

export const getAttachments = query({
  args: { 
    taskId: v.optional(v.id("tasks")),
    refId: v.optional(v.string()) 
  },
  handler: async (ctx, args) => {
    if (args.taskId) {
      return await ctx.db
        .query("attachments")
        .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
        .collect();
    }
    if (args.refId) {
      return await ctx.db
        .query("attachments")
        .withIndex("by_refId", (q) => q.eq("refId", args.refId))
        .collect();
    }
    return [];
  },
});

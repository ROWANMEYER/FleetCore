import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getUserRegions, REGION_LABELS, type Region } from "../src/lib/regions";

/** The indexed read and user write share a transaction, including concurrent saves. */
export async function assertRegionsAvailable(ctx: MutationCtx, regions: Region[], excludeUserId?: Id<"users">): Promise<void> {
  if (!regions.length) throw new Error("Assign at least one region to a regional user.");
  const users = await ctx.db.query("users").withIndex("by_role", q => q.eq("role", "regional")).take(1001);
  if (users.length > 1000) throw new Error("Too many regional users to validate ownership safely. Contact support.");
  for (const region of regions) {
    const owner = users.find(user => user._id !== excludeUserId && getUserRegions(user).includes(region));
    if (owner) throw new Error(`${REGION_LABELS[region]} is already allocated to ${owner.email}. Remove it from that user first.`);
  }
}

import { v } from "convex/values";

/** Additive region choices; existing keys and stored records remain valid. */
export const regionValidator = v.union(
  v.literal("garden_route"), v.literal("eastern_cape"),
  v.literal("transvaal"), v.literal("kaap"), v.literal("durban"),
);

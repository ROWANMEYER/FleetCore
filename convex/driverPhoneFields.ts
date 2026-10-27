import { v } from "convex/values";

export const driverPhoneNumber = v.object({
  label: v.string(),
  number: v.string(),
  whatsapp: v.boolean(),
});

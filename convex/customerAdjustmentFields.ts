import { v } from "convex/values";
export const customerAdjustmentRate = v.object({ laneId: v.string(), rate: v.number() });
export const customerAdjustmentFields = {
  customerId: v.id("customers"), sheetId: v.id("rateSheets"), effectiveDate: v.string(), percentage: v.union(v.number(), v.null()),
  rates: v.array(customerAdjustmentRate), reference: v.string(), revision: v.number(), recordedAt: v.number(), recordedBy: v.id("users"), recordedByEmail: v.string(),
};
export const customerAdjustmentDocument = v.object({ _id: v.id("customerRateAdjustments"), _creationTime: v.number(), ...customerAdjustmentFields });

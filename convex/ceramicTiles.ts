import type { Region } from "../src/lib/regions";
import { ceramicWarehouseWeights } from "../src/lib/ceramic-tiles/monthlyReport";
import { ceramicBilling } from "./ceramicTilesFields";
import { paginationOptsValidator } from "convex/server";
import { ceramicReportRow } from "./ceramicTilesFields";
import { CERAMIC_MAIN_REGION, CERAMIC_LOCAL_TOWN, ceramicLocalLegs, ceramicMainLoad } from "../src/lib/ceramic-tiles/planning";
import { ceramicAssignmentError, syncCeramicAssignment } from "./ceramicPlanning";
import { assertCeramicStopOrder } from "../src/lib/ceramic-tiles/stopOrder";
import { ceramicStopOrder } from "./ceramicTilesFields";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { resolveUserScope, selectScopeRegion } from "./userSessions";
import { ceramicRegion, ceramicShipmentSnapshot } from "./ceramicTilesFields";

type ShipmentInput = {
  snapshot: {
    shipmentNumber: string; version: number; totalWeightKg: number | null;
    totalPallets: number | null; transporter: string | null;
    plannedLoadingDate: string | null; plannedDeliveryDate: string | null;
    destinations: { name: string; addressLines: string[]; orders: {
      deliveryNumber: string; orderNumber: string; weightKg: number;
      collectFrom: string; palletsEstimate: number | null;
    }[] }[];
    warnings: string[];
  };
  fileName: string;
  fileHash: string;
};

async function requireFinancialRegion(
  ctx: QueryCtx | MutationCtx,
  token: string,
  requested: Region,
): Promise<{ region: Region; actor: string }> {
  const scope = await resolveUserScope(ctx, token);
  if (!scope) throw new Error("Sign in again to use the Ceramic Tiles importer.");
  if (scope.role === "regional") {
    const region = selectScopeRegion(scope, requested)!;
    return { region, actor: `regional:${region}` };
  }
  return { region: requested, actor: "admin" };
}

/** Every signed-in user may dispatch Ceramic loads; general Operations scope is unchanged. */
async function requireRegion(ctx: QueryCtx | MutationCtx, token: string, requested: Region): Promise<{ region: Region; actor: string }> {
  void requested;
  const scope = await resolveUserScope(ctx, token);
  if (!scope) throw ceramicAssignmentError("Sign in again to use Ceramic dispatch.", "CERAMIC_SIGN_IN_REQUIRED");
  return { region: CERAMIC_MAIN_REGION, actor: `${scope.role}:ceramic-dispatch` };
}

function validateInput(entry: ShipmentInput): void {
  const s = entry.snapshot;
  if (!/^SH\d{6,12}$/i.test(s.shipmentNumber)) throw new Error("Invalid shipment number.");
  if (!Number.isInteger(s.version) || s.version < 1) throw new Error(`${s.shipmentNumber}: invalid version.`);
  if (!/^[a-f0-9]{64}$/.test(entry.fileHash)) throw new Error(`${s.shipmentNumber}: invalid PDF SHA-256 hash.`);
  if (!/\.pdf$/i.test(entry.fileName) || entry.fileName.length > 255) throw new Error(`${s.shipmentNumber}: invalid PDF filename.`);
  if (!s.destinations.length) throw new Error(`${s.shipmentNumber}: no destinations.`);
  if (s.totalWeightKg !== null && (!Number.isFinite(s.totalWeightKg) || s.totalWeightKg < 0)) throw new Error("Invalid shipment weight.");
  if (s.totalPallets !== null && (!Number.isFinite(s.totalPallets) || s.totalPallets < 0)) throw new Error("Invalid shipment pallet count.");
  for (const date of [s.plannedLoadingDate, s.plannedDeliveryDate]) {
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date format.");
  }
  const deliveries = new Set<string>();
  for (const destination of s.destinations) {
    if (!destination.name.trim() || !destination.orders.length) {
      throw new Error(`${s.shipmentNumber}: a delivery destination has no name or orders.`);
    }
    for (const order of destination.orders) {
      if (!/^\d+$/.test(order.deliveryNumber) || !order.orderNumber.trim() ||
          !Number.isFinite(order.weightKg) || order.weightKg < 0 ||
          (order.palletsEstimate !== null && (!Number.isFinite(order.palletsEstimate) || order.palletsEstimate < 0))) {
        throw new Error(`${s.shipmentNumber}: invalid order ${order.deliveryNumber}.`);
      }
      if (deliveries.has(order.deliveryNumber)) {
        throw new Error(`${s.shipmentNumber}: repeated delivery number ${order.deliveryNumber}.`);
      }
      deliveries.add(order.deliveryNumber);
    }
  }
}

/** Authenticated, short-lived upload URL for an original shipment PDF. */
export const generateUploadUrl = mutation({
  args: { token: v.string(), region: ceramicRegion },
  handler: async (ctx, args) => {
    await requireRegion(ctx, args.token, args.region);
    return await ctx.storage.generateUploadUrl();
  },
});

export const previewBatch = query({
  args: {
    token: v.string(),
    region: ceramicRegion,
    files: v.array(v.object({
      shipmentNumber: v.string(), version: v.number(), fileHash: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const { region } = await requireRegion(ctx, args.token, args.region);
    return await Promise.all(args.files.map(async (file) => {
      const existing = await ctx.db.query("ceramicShipments")
        .withIndex("by_region_number", (q) =>
          q.eq("region", region).eq("shipmentNumber", file.shipmentNumber.toUpperCase())).first();
      let status: "new" | "revision" | "duplicate" | "older_version" | "version_conflict" = "new";
      if (existing) {
        status = file.version < existing.version ? "older_version"
          : file.version > existing.version ? "revision"
          : file.fileHash === existing.fileHash ? "duplicate" : "version_conflict";
      }
      return {
        shipmentNumber: file.shipmentNumber,
        version: file.version,
        currentVersion: existing?.version ?? null,
        status,
      };
    }));
  },
});

/** One Convex transaction: every validated file commits or none do. */
export const commitBatch = mutation({
  args: {
    token: v.string(),
    region: ceramicRegion,
    files: v.array(v.object({
      snapshot: ceramicShipmentSnapshot,
      fileName: v.string(),
      fileHash: v.string(),
      storageId: v.optional(v.id("_storage")),
    })),
  },
  handler: async (ctx, args) => {
    const { region, actor } = await requireRegion(ctx, args.token, args.region);
    if (args.files.length < 1 || args.files.length > 25) throw new Error("Import 1 to 25 PDFs per batch.");
    const seen = new Set<string>();
    const staged = [];
    for (const file of args.files) {
      validateInput(file);
      const number = file.snapshot.shipmentNumber.toUpperCase();
      if (seen.has(number)) throw new Error(`Shipment ${number} is repeated in this batch; keep only the latest PDF.`);
      seen.add(number);
      const existing = await ctx.db.query("ceramicShipments")
        .withIndex("by_region_number", (q) => q.eq("region", region).eq("shipmentNumber", number)).first();
      if (existing && file.snapshot.version === existing.version && file.fileHash !== existing.fileHash) {
        throw new Error(`${number} version ${file.snapshot.version} differs from the imported version; review before replacing it.`);
      }
      if (!existing || file.snapshot.version > existing.version) {
        if (!file.storageId) throw new Error(`${number}: original PDF must be uploaded before import.`);
        const metadata = await ctx.db.system.get("_storage", file.storageId);
        if (!metadata) throw new Error(`${number}: uploaded PDF was not found.`);
        if (metadata.contentType !== "application/pdf" || metadata.size > 20 * 1024 * 1024) {
          throw new Error(`${number}: the uploaded file is not a valid PDF under 20 MB.`);
        }
      }
      staged.push({ file, number, existing });
    }
    const result: { shipmentNumber: string; status: "created" | "revised" | "duplicate" | "older_version"; version: number }[] = [];
    const now = Date.now();
    for (const { file, number, existing } of staged) {
      if (existing && file.snapshot.version <= existing.version) {
        result.push({
          shipmentNumber: number,
          version: file.snapshot.version,
          status: file.snapshot.version === existing.version ? "duplicate" : "older_version",
        });
        continue;
      }
      const snapshot = { ...file.snapshot, shipmentNumber: number };
      let shipmentId;
      if (existing) {
        shipmentId = existing._id;
        await ctx.db.patch(shipmentId, {
          version: snapshot.version,
          snapshot,
          fileHash: file.fileHash,
          updatedAt: now,
          updatedBy: actor,
          // Intentionally preserve truckId / driverId assignment on revised documents.
        });
      } else {
        shipmentId = await ctx.db.insert("ceramicShipments", {
          region,
          shipmentNumber: number,
          version: snapshot.version,
          fileHash: file.fileHash,
          snapshot,
          createdAt: now,
          updatedAt: now,
          updatedBy: actor,
        });
      }
      await ctx.db.insert("ceramicShipmentVersions", {
        shipmentId, region, shipmentNumber: number,
        version: snapshot.version, fileName: file.fileName,
        fileHash: file.fileHash, storageId: file.storageId, snapshot,
        importedAt: now, importedBy: actor,
      });
      result.push({
        shipmentNumber: number, version: snapshot.version,
        status: existing ? "revised" : "created",
      });
    }
    return result;
  },
});

export const list = query({
  args: { token: v.string(), region: ceramicRegion },
  handler: async (ctx, args) => {
    const { region } = await requireRegion(ctx, args.token, args.region);
    return await ctx.db.query("ceramicShipments")
      .withIndex("by_region_updated", (q) => q.eq("region", region))
      .order("desc").take(200);
  },
});

export const versions = query({
  args: { token: v.string(), region: ceramicRegion, shipmentId: v.id("ceramicShipments") },
  handler: async (ctx, args) => {
    await requireRegion(ctx, args.token, args.region);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Shipment not found.");
    const entries = await ctx.db.query("ceramicShipmentVersions")
      .withIndex("by_shipment", (q) => q.eq("shipmentId", args.shipmentId)).collect();
    return await Promise.all(entries.sort((a, b) => b.version - a.version).map(async (entry) => ({
      ...entry,
      fileUrl: entry.storageId ? await ctx.storage.getUrl(entry.storageId) : null,
    })));
  },
});

/** Authenticated removal; the anonymous mobile API cannot delete. */
export const remove = mutation({
  args: {
    token: v.string(), region: ceramicRegion, shipmentId: v.id("ceramicShipments"),
    expectedVersion: v.number(), expectedUpdatedAt: v.number(),
  },
  returns: v.object({ deleted: v.boolean() }),
  handler: async (ctx, args) => {
    const { region } = await requireFinancialRegion(ctx, args.token, args.region);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment || shipment.region !== region) throw new Error("Shipment not found.");
    if (args.expectedVersion !== shipment.version || args.expectedUpdatedAt !== shipment.updatedAt) {
      throw new Error("Shipment changed. Cancel and review the latest shipment before deleting.");
    }
    const assignment = await ctx.db.query("ceramicAssignments").withIndex("by_shipment", q => q.eq("shipmentId", shipment._id)).first();
    if (assignment) throw new Error("This shipment is linked to Planner and reporting history. Keep it for traceability; it cannot be deleted here.");
    const revisions = await ctx.db.query("ceramicShipmentVersions")
      .withIndex("by_shipment", (q) => q.eq("shipmentId", shipment._id)).take(501);
    if (revisions.length > 500) throw new Error("This shipment has too many revisions to delete here. Contact support.");
    const files = new Set(revisions.flatMap((revision) => revision.storageId ? [revision.storageId] : []));
    for (const revision of revisions) await ctx.db.delete(revision._id);
    // Reads see this transaction's deletes. Keep PDFs still referenced by another shipment.
    for (const storageId of files) {
      const remaining = await ctx.db.query("ceramicShipmentVersions")
        .withIndex("by_storage", (q) => q.eq("storageId", storageId)).first();
      if (!remaining) await ctx.storage.delete(storageId);
    }
    await ctx.db.delete(shipment._id);
    return { deleted: true };
  },
});

/** Optional assignment uses existing FleetCore records, never trailer records. */
export const assign = mutation({
  args: {
    token: v.string(), region: ceramicRegion, shipmentId: v.id("ceramicShipments"),
    driverId: v.optional(v.union(v.id("drivers"), v.null())),
    truckId: v.optional(v.union(v.id("trucks"), v.null())),
    routeDate: v.string(), expectedVersion: v.number(),
  },
  returns: v.object({ saved: v.boolean(), updatedAt: v.number(), routeId: v.id("dailyRoutes") }),
  handler: async (ctx, args) => {
    const { actor } = await requireRegion(ctx, args.token, args.region);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw ceramicAssignmentError("Shipment not found. Refresh the shipment list.");
    if (args.expectedVersion !== shipment.version) throw new Error("Shipment updated. Review the latest PDF before assigning.");
    const driverId = args.driverId === undefined ? shipment.driverId : args.driverId;
    const truckId = args.truckId === undefined ? shipment.truckId : args.truckId;
    if (!driverId || !truckId) throw new Error("Choose both a driver and truck before assigning the main load.");
    const result = await syncCeramicAssignment(ctx, shipment, { driverId, truckId, routeDate: args.routeDate, actor });
    const now = Date.now();
    await ctx.db.patch(shipment._id, { driverId, truckId, routeDate: args.routeDate, plannerVersion: shipment.version, updatedAt: now, updatedBy: actor });
    return { saved: true, updatedAt: now, routeId: result.routeId };
  },
});

/** Editable driver instructions; preserved when a later PDF revision arrives. */
export const saveDriverInstructions = mutation({
  args: {
    token: v.string(),
    region: ceramicRegion,
    shipmentId: v.id("ceramicShipments"),
    safetyNotes: v.string(),
    additionalNotes: v.string(),
    stopOrder: v.optional(ceramicStopOrder),
    expectedVersion: v.optional(v.number()),
  },
  returns: v.object({ saved: v.boolean(), updatedAt: v.number() }),
  handler: async (ctx, args) => {
    const { actor } = await requireRegion(ctx, args.token, args.region);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Shipment not found.");
    if (args.expectedVersion !== undefined && args.expectedVersion !== shipment.version) {
      throw new Error("Shipment updated. Reopen instructions and review the latest version before saving.");
    }
    if (args.safetyNotes.length > 4000 || args.additionalNotes.length > 4000) {
      throw new Error("Each instruction field has a 4,000-character limit.");
    }
    if (args.stopOrder) assertCeramicStopOrder(shipment.snapshot, args.stopOrder);
    const now = Date.now();
    await ctx.db.patch(shipment._id, {
      driverInstructions: {
        ...shipment.driverInstructions,
        ...(args.expectedVersion !== undefined ? { reviewedVersion: shipment.version } : {}),
        ...(args.stopOrder ? { stopOrder: args.stopOrder } : {}),
        safetyNotes: args.safetyNotes.trim(),
        additionalNotes: args.additionalNotes.trim(),
        updatedAt: now,
        updatedBy: actor,
      },
      updatedAt: now,
      updatedBy: actor,
    });
    return { saved: true, updatedAt: now };
  },
});

export const fleetChoices = query({
  args: { token: v.string(), region: ceramicRegion },
  returns: v.object({
    drivers: v.array(v.object({ id: v.id("drivers"), name: v.string(), phone: v.union(v.string(), v.null()) })),
    trucks: v.array(v.object({ id: v.id("trucks"), fleetNumber: v.string(), registration: v.union(v.string(), v.null()) })),
  }),
  handler: async (ctx, args) => {
    await requireRegion(ctx, args.token, args.region);
    const [drivers, trucks] = await Promise.all([
      ctx.db.query("drivers").take(5000),
      ctx.db.query("trucks").take(5000),
    ]);
    return {
      drivers: drivers.map((driver) => ({ id: driver._id, name: driver.driverName ?? driver.name ?? "", phone: driver.phone ?? null }))
        .filter((d) => d.name.trim()).sort((a, b) => a.name.localeCompare(b.name)),
      trucks: trucks.map((truck) => ({ id: truck._id, fleetNumber: String(truck.truckFleetNo || truck.fleetNumber || ""), registration: truck.registration ?? null }))
        .sort((a, b) => a.fleetNumber.localeCompare(b.fleetNumber, undefined, { numeric: true })),
    };
  },
});

/** Month-scoped, paginated reporting; no scan, no public financial/operations access. */
export const report = query({
  args: { token: v.string(), region: ceramicRegion, month: v.string(), paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(ceramicReportRow), isDone: v.boolean(), continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())),
  }),
  handler: async (ctx, args) => {
    const { region } = await requireFinancialRegion(ctx, args.token, args.region);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month)) throw new Error("Choose a valid report month.");
    if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100) throw new Error("Read 1 to 100 report rows per page.");
    const records = await ctx.db.query("ceramicAssignments").withIndex("by_region_routeDate", q =>
      q.eq("region", region).gte("routeDate", `${args.month}-01`).lt("routeDate", `${args.month}-32`))
      .paginate(args.paginationOpts);
    const page = await Promise.all(records.page.map(async row => {
      const [current, route, truck] = await Promise.all([ctx.db.get(row.shipmentId), ctx.db.get(row.routeId), ctx.db.get(row.truckId)]);
      const warehouse = ceramicWarehouseWeights(row.snapshot);
      const load = ceramicMainLoad(row.snapshot, row.shipmentId);
      return { shipmentId: row.shipmentId, routeId: row.routeId, region: row.region,
        shipmentNumber: row.snapshot.shipmentNumber, version: row.snapshot.version, routeDate: row.routeDate,
        driverName: row.driverName, truckFleetNo: row.truckFleetNo, fromLocations: load.fromLocations, toLocations: load.toLocations,
        deliveryNumbers: row.snapshot.destinations.flatMap(d => d.orders.map(o => o.deliveryNumber)),
        weightKg: row.snapshot.totalWeightKg, pallets: row.snapshot.totalPallets,
        needsReview: !current || current.version !== row.snapshot.version || !route || !!route.isDeleted ||
          route.routeDate !== row.routeDate || route.driverName !== row.driverName || route.truckFleetNoStr !== row.truckFleetNo,
        truckRegistration: row.truckRegistration ?? truck?.registration ?? "",
        ...(row.billing ? { billing: row.billing } : {}), billingUpdatedAt: row.billingUpdatedAt ?? 0,
        ...(row.billingSourceVersion !== undefined ? { billingSourceVersion: row.billingSourceVersion } : {}),
        warehouseWeights: warehouse.weights, unmappedWarehouses: warehouse.unmapped,
        locals: ceramicLocalLegs(row.snapshot) };
    }));
    return { ...records, page };
  },
});

/** Save the template's editable commercial inputs without changing Planner rates or source PDFs. */
export const saveReportBilling = mutation({
  args: { token: v.string(), region: ceramicRegion, shipmentId: v.id("ceramicShipments"), expectedVersion: v.number(), expectedBillingUpdatedAt: v.number(), billing: ceramicBilling },
  returns: v.object({ saved: v.boolean(), updatedAt: v.number() }),
  handler: async (ctx, args) => {
    const { region, actor } = await requireFinancialRegion(ctx, args.token, args.region);
    const row = await ctx.db.query("ceramicAssignments").withIndex("by_shipment", q => q.eq("shipmentId", args.shipmentId)).unique();
    if (!row || row.region !== region) throw new Error("Assigned shipment not found.");
    const [shipment, route] = await Promise.all([ctx.db.get(row.shipmentId), ctx.db.get(row.routeId)]);
    if (!shipment || shipment.version !== args.expectedVersion || row.snapshot.version !== args.expectedVersion) throw new Error("Review and save the latest shipment assignment before editing its amounts.");
    if ((row.billingUpdatedAt ?? 0) !== args.expectedBillingUpdatedAt) throw new Error("Amounts changed. Reopen the editor to avoid overwriting another user's changes.");
    if (!route || route.isDeleted || (route.status || "planned") !== "planned" ||
      await ctx.db.query("invoices").withIndex("by_routeId", q => q.eq("routeId", row.routeId)).first()) throw new Error("This load is deleted, completed, locked or invoiced. Its report amounts cannot be changed.");
    const billing = args.billing;
    const amounts = [billing.ratePerTon, billing.stops, billing.drops, ...billing.locals.map(local => local.price)];
    if (amounts.some(n => n !== null && (!Number.isFinite(n) || Math.abs(n) > 1e12))) throw new Error("Enter valid amounts.");
    if (billing.crossBorder.length > 200 || billing.load.length > 200) throw new Error("Keep cross-border and load notes under 200 characters.");
    const allowed = new Set(ceramicLocalLegs(row.snapshot).map(local => local.key));
    const keys = billing.locals.map(local => local.key);
    if (new Set(keys).size !== keys.length || keys.some(key => !allowed.has(key)) || billing.locals.some(local => local.from.length > 200 || local.to.length > 200)) throw new Error("Local stops changed or contain invalid locations. Reopen the editor.");
    const now = Math.max(Date.now(), (row.billingUpdatedAt ?? 0) + 1);
    await ctx.db.patch(row._id, { billing: { ...billing, locals: billing.locals.map(local => ({ ...local, from: CERAMIC_LOCAL_TOWN, to: CERAMIC_LOCAL_TOWN })) }, billingUpdatedAt: now, billingUpdatedBy: actor, billingSourceVersion: row.snapshot.version });
    return { saved: true, updatedAt: now };
  },
});

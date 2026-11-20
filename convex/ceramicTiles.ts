import { assertCeramicStopOrder } from "../src/lib/ceramic-tiles/stopOrder";
import { ceramicStopOrder } from "./ceramicTilesFields";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { resolveUserScope } from "./userSessions";
import { ceramicRegion, ceramicShipmentSnapshot } from "./ceramicTilesFields";

type Region = "garden_route" | "eastern_cape";
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

async function requireRegion(
  ctx: QueryCtx | MutationCtx,
  token: string,
  requested: Region,
): Promise<{ region: Region; actor: string }> {
  const scope = await resolveUserScope(ctx, token);
  if (!scope) throw new Error("Sign in again to use the Ceramic Tiles importer.");
  if (scope.role === "regional") {
    if (!scope.region) throw new Error("Your account has no region assigned.");
    return { region: scope.region, actor: `regional:${scope.region}` };
  }
  return { region: requested, actor: "admin" };
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
    const { region } = await requireRegion(ctx, args.token, args.region);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment || shipment.region !== region) throw new Error("Shipment not found.");
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
    const { region } = await requireRegion(ctx, args.token, args.region);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment || shipment.region !== region) throw new Error("Shipment not found.");
    if (args.expectedVersion !== shipment.version || args.expectedUpdatedAt !== shipment.updatedAt) {
      throw new Error("Shipment changed. Cancel and review the latest shipment before deleting.");
    }
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
  },
  handler: async (ctx, args) => {
    const { region, actor } = await requireRegion(ctx, args.token, args.region);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment || shipment.region !== region) throw new Error("Shipment not found.");
    if (args.driverId && !(await ctx.db.get(args.driverId))) throw new Error("Driver not found.");
    if (args.truckId && !(await ctx.db.get(args.truckId))) throw new Error("Truck not found.");
    await ctx.db.patch(args.shipmentId, {
      ...(args.driverId !== undefined ? { driverId: args.driverId ?? undefined } : {}),
      ...(args.truckId !== undefined ? { truckId: args.truckId ?? undefined } : {}),
      updatedAt: Date.now(), updatedBy: actor,
    });
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
    const { region, actor } = await requireRegion(ctx, args.token, args.region);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment || shipment.region !== region) throw new Error("Shipment not found.");
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

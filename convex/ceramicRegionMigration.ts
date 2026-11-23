import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { CERAMIC_MAIN_REGION, CERAMIC_LOCAL_TOWN } from "../src/lib/ceramic-tiles/planning";

const countsValidator = v.object({ shipments: v.number(), versions: v.number(), assignments: v.number(), routes: v.number(), localRoutes: v.number() });
function fingerprint(value: unknown): string {
  const text = JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
  return `${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}
async function plan(ctx: Pick<QueryCtx, "db">) {
  const [shipments, versions, assignments] = await Promise.all([
    ctx.db.query("ceramicShipments").take(501), ctx.db.query("ceramicShipmentVersions").take(2001), ctx.db.query("ceramicAssignments").take(501),
  ]);
  if (shipments.length > 500 || versions.length > 2000 || assignments.length > 500) throw new Error("Migration safety bound reached. Use a reviewed paginated migration.");
  const routeGroups = await Promise.all(shipments.map(shipment => ctx.db.query("dailyRoutes")
    .withIndex("by_ceramicShipmentId", q => q.eq("ceramicShipmentId", shipment._id)).take(3)));
  const routes = routeGroups.flat();
  const blockers: string[] = [];
  const numbers = new Set<string>(), shipmentIds = new Set(shipments.map(s => String(s._id)));
  for (const [i, shipment] of shipments.entries()) {
    const number = shipment.shipmentNumber.toUpperCase();
    if (numbers.has(number)) blockers.push(`Duplicate shipment number ${number} needs review before combining regions.`);
    numbers.add(number);
    if (routeGroups[i].length > 1) blockers.push(`${number} has more than one linked main Planner route.`);
  }
  const assigned = new Set<string>();
  for (const row of assignments) {
    if (assigned.has(row.shipmentId)) blockers.push(`Duplicate assignment for ${row.snapshot.shipmentNumber}.`);
    assigned.add(row.shipmentId);
    if (!shipmentIds.has(row.shipmentId) || !routes.some(route => route._id === row.routeId && route.ceramicShipmentId === row.shipmentId)) blockers.push(`${row.snapshot.shipmentNumber} has an invalid Planner link.`);
  }
  for (const row of versions) if (!shipmentIds.has(row.shipmentId)) blockers.push("A shipment version has no source shipment.");
  const counts = {
    shipments: shipments.filter(s => s.region !== CERAMIC_MAIN_REGION).length,
    versions: versions.filter(s => s.region !== CERAMIC_MAIN_REGION).length,
    assignments: assignments.filter(s => s.region !== CERAMIC_MAIN_REGION).length,
    routes: routes.filter(s => s.region !== CERAMIC_MAIN_REGION).length,
    localRoutes: assignments.reduce((n, s) => n + (s.billing?.locals.filter(local => local.from !== CERAMIC_LOCAL_TOWN || local.to !== CERAMIC_LOCAL_TOWN).length ?? 0), 0),
  };
  return { shipments, versions, assignments, routes, blockers, counts, fingerprint: fingerprint({ shipments, versions, assignments, routes }) };
}
/** Checked inside the transaction so unrelated live edits cannot mask migration safety. */
function protectedFingerprint(p: Awaited<ReturnType<typeof plan>>) {
  const data = structuredClone({ shipments: p.shipments, versions: p.versions, assignments: p.assignments, routes: p.routes });
  for (const rows of [data.shipments, data.versions, data.assignments, data.routes]) for (const row of rows) delete (row as { region?: unknown }).region;
  for (const row of data.assignments) {
    delete row.billingUpdatedAt; delete row.billingUpdatedBy;
    for (const local of row.billing?.locals ?? []) { delete (local as { from?: string }).from; delete (local as { to?: string }).to; }
  }
  return fingerprint(data);
}
/** Read-only, bounded preview; all commercial/source data stays inside the deployment. */
export const preview = internalQuery({
  args: {}, returns: v.object({ fingerprint: v.string(), counts: countsValidator, blockers: v.array(v.string()), shipments: v.array(v.string()) }),
  handler: async ctx => { const p = await plan(ctx); return { fingerprint: p.fingerprint, counts: p.counts, blockers: p.blockers, shipments: p.shipments.map(s => s.shipmentNumber) }; },
});
/** Explicit owner-requested classification correction; cannot create or delete loads. */
export const apply = internalMutation({
  args: { expectedFingerprint: v.string() }, returns: countsValidator,
  handler: async (ctx, args) => {
    const p = await plan(ctx);
    if (p.blockers.length) throw new Error(p.blockers.join(" "));
    if (p.fingerprint !== args.expectedFingerprint) throw new Error("Ceramic records changed. Preview the migration again before applying.");
    const protectedBefore = protectedFingerprint(p);
    for (const row of p.shipments) if (row.region !== CERAMIC_MAIN_REGION) await ctx.db.patch(row._id, { region: CERAMIC_MAIN_REGION });
    for (const row of p.versions) if (row.region !== CERAMIC_MAIN_REGION) await ctx.db.patch(row._id, { region: CERAMIC_MAIN_REGION });
    for (const row of p.routes) if (row.region !== CERAMIC_MAIN_REGION) await ctx.db.patch(row._id, { region: CERAMIC_MAIN_REGION });
    for (const row of p.assignments) {
      const changedLocals = row.billing?.locals.some(local => local.from !== CERAMIC_LOCAL_TOWN || local.to !== CERAMIC_LOCAL_TOWN);
      if (row.region !== CERAMIC_MAIN_REGION || changedLocals) await ctx.db.patch(row._id, {
        region: CERAMIC_MAIN_REGION,
        ...(changedLocals && row.billing ? { billing: { ...row.billing, locals: row.billing.locals.map(local => ({ ...local, from: CERAMIC_LOCAL_TOWN, to: CERAMIC_LOCAL_TOWN })) },
          billingUpdatedAt: Math.max(Date.now(), (row.billingUpdatedAt ?? 0) + 1), billingUpdatedBy: "migration:ceramic-transvaal-george" } : {}),
      });
    }
    const after = await plan(ctx);
    if (protectedFingerprint(after) !== protectedBefore) throw new Error("Protected Ceramic data changed. Migration rolled back.");
    return p.counts;
  },
});

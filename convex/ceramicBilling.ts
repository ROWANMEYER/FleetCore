import { v } from "convex/values";
import { query, mutation, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ceramicBillingConfig, ceramicBillingPreview, ceramicBillingRules } from "./ceramicBillingFields";
import { ceramicAssignmentError } from "./ceramicPlanning";
import { DEFAULT_CERAMIC_BILLING, ceramicBillingCalculation, ceramicBillingFingerprint, ceramicBilledMainLoad, ceramicBillingRuleIssues } from "../src/lib/ceramic-tiles/billing";
import { ceramicTariffChoices, type CeramicTariffState } from "../src/lib/ceramic-tiles/tariffs";
import { ceramicMainLoad, ceramicEqual, validCeramicDate } from "../src/lib/ceramic-tiles/planning";
import { ceramicMonthlyAmounts } from "../src/lib/ceramic-tiles/monthlyReport";

async function actor(ctx: QueryCtx, token: string) {
  const session = await ctx.db.query("sessions").withIndex("by_token", q => q.eq("token", token)).first();
  const user = session && session.expiresAt > Date.now() ? await ctx.db.get(session.userId) : null;
  if (!user) throw ceramicAssignmentError("Sign in to review internal Ceramic billing.", "CERAMIC_SIGN_IN_REQUIRED");
  return user;
}
export async function ceramicConfigOn(ctx: QueryCtx, day: string) {
  if (!validCeramicDate(day)) throw ceramicAssignmentError("Choose a valid planning/effective date.");
  const record = await ctx.db.query("ceramicBillingSettings").withIndex("by_effectiveDate", q => q.lte("effectiveDate", day)).order("desc").first();
  const config = record ? { defaultTons: record.defaultTons, extraStopPrice: record.extraStopPrice, localSmallPrice: record.localSmallPrice, localLargePrice: record.localLargePrice, localMaxWeightKg: record.localMaxWeightKg, localMaxPallets: record.localMaxPallets, billingStartDay: record.billingStartDay, effectiveDate: record.effectiveDate, version: String(record._id), ...(record.customerId ? { customerId: record.customerId } : {}) } : { ...DEFAULT_CERAMIC_BILLING, effectiveDate: "1900-01-01", version: "defaults", customerId: undefined as Id<"customers"> | undefined };
  if (!config.customerId) {
    const customers = await ctx.db.query("customers").withIndex("by_normalizedName", q => q.eq("normalizedName", "ceramic tile marketing")).take(2);
    if (customers.length === 1 && customers[0].isActive !== false) config.customerId = customers[0]._id;
  }
  const { customerId, ...rest } = config; return { ...rest, ...(customerId ? { customerId } : {}) };
}

/** Authenticated configuration only; never included in the anonymous dispatch API. */
export const settings = query({
  args: { token: v.string(), effectiveDate: v.string() },
  returns: v.object({ config: ceramicBillingConfig, customers: v.array(v.object({ id: v.id("customers"), name: v.string() })) }),
  handler: async (ctx, args) => {
    const user = await actor(ctx, args.token), config = await ceramicConfigOn(ctx, args.effectiveDate);
    const choices: { id: Id<"customers">; name: string }[] = [];
    if (user.role === "admin") {
      const sheets = await ctx.db.query("rateSheets").take(201);
      if (sheets.length > 200) throw ceramicAssignmentError("Too many rate sheets to list here. Contact support.");
      for (const sheet of sheets) { const customer = await ctx.db.get(sheet.customerId); if (customer?.isActive !== false && customer) choices.push({ id: customer._id, name: customer.name }); }
    }
    return { config, customers: choices };
  },
});
export const saveSettings = mutation({
  args: { token: v.string(), effectiveDate: v.string(), expectedVersion: v.string(), customerId: v.id("customers"), ...ceramicBillingRules },
  returns: v.object({ saved: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await actor(ctx, args.token); if (user.role !== "admin") throw ceramicAssignmentError("Only administrators can change Ceramic billing settings.");
    const current = await ceramicConfigOn(ctx, args.effectiveDate);
    if (current.version !== args.expectedVersion) throw ceramicAssignmentError("Billing settings changed. Reopen them before saving.");
    const customer = await ctx.db.get(args.customerId); if (!customer || customer.isActive === false) throw ceramicAssignmentError("Choose an active Ceramic rate-sheet customer.");
    const sheet = await ctx.db.query("rateSheets").withIndex("by_customer", q => q.eq("customerId", args.customerId)).unique();
    if (!sheet) throw ceramicAssignmentError("Choose a customer with a rate sheet.");
    const values = [args.defaultTons, args.extraStopPrice, args.localSmallPrice, args.localLargePrice, args.localMaxWeightKg, args.localMaxPallets];
    if (values.some(n => !Number.isFinite(n) || n < 0 || n > 1e9) || args.defaultTons <= 0 || args.defaultTons > 1000 || args.localMaxWeightKg <= 0 || args.localSmallPrice > args.localLargePrice || !Number.isInteger(args.billingStartDay) || args.billingStartDay < 1 || args.billingStartDay > 31) throw ceramicAssignmentError("Enter valid billing amounts, limits and a start day from 1 to 31.");
    const { token: _token, expectedVersion: _expected, ...fields } = args; void _token; void _expected;
    await ctx.db.insert("ceramicBillingSettings", { ...fields, createdAt: Date.now(), createdBy: user._id });
    return { saved: true };
  },
});

async function previewFor(ctx: QueryCtx, shipmentId: Id<"ceramicShipments">, tons?: number, tariffKey?: string, strictSelection = false) {
  const shipment = await ctx.db.get(shipmentId);
  if (!shipment || shipment.deletedAt !== undefined) throw ceramicAssignmentError("Shipment not found. Refresh the shipment list.");
  const assignment = await ctx.db.query("ceramicAssignments").withIndex("by_shipment", q => q.eq("shipmentId", shipmentId)).unique();
  if (!assignment || assignment.deletedAt !== undefined || !shipment.routeDate) throw ceramicAssignmentError("Save the driver, truck and planning date before reviewing billing.");
  const config = await ceramicConfigOn(ctx, assignment.routeDate);
  const states: CeramicTariffState[] = [];
  if (config.customerId) {
    const sheet = await ctx.db.query("rateSheets").withIndex("by_customer", q => q.eq("customerId", config.customerId!)).unique();
    const history = await ctx.db.query("rateSheetHistory").withIndex("by_customer", q => q.eq("customerId", config.customerId!)).take(201);
    if (history.length > 200) throw ceramicAssignmentError("Tariff history exceeds the review limit. Contact support; no billing was changed.");
    for (const entry of history) if (entry.action !== "delete") states.push({ ...entry.snapshot, sheetId: String(entry.sheetId), revision: entry.revision, recordedAt: entry.recordedAt });
    if (sheet) states.push({ ...sheet, sheetId: String(sheet._id), recordedAt: sheet.updatedAt });
  }
  const fuel = await ctx.db.query("fuelPrices").withIndex("by_effectiveDate", q => q.lte("effectiveDate", assignment.routeDate)).take(2001);
  if (fuel.length > 2000) throw ceramicAssignmentError("Fuel history exceeds the review limit. Contact support.");
  const chargeableTons = tons ?? assignment.billing?.automation?.chargeableTons ?? config.defaultTons;
  const preliminary = ceramicBillingCalculation(shipment.snapshot, null, chargeableTons, config);
  const variant = preliminary.pickupTownCount === 1 ? "sp" as const : "standard" as const;
  const choices = ceramicTariffChoices(states, shipment.snapshot, assignment.routeDate, fuel).filter(choice => preliminary.pickupTownCount !== null && choice.variant === variant);
  const highest = choices[0] ?? null;
  const requested = tariffKey ? choices.find(choice => choice.key === tariffKey) ?? null : highest;
  if (strictSelection && tariffKey && (!requested || !highest || requested.ratePerTon !== highest.ratePerTon)) throw ceramicAssignmentError("Select the highest applicable rate for the whole load. SP applies only to a single pickup town.");
  const selected = requested?.ratePerTon === highest?.ratePerTon ? requested : highest;
  const calculation = ceramicBillingCalculation(shipment.snapshot, selected?.ratePerTon ?? null, chargeableTons, config);
  if (!config.customerId) calculation.issues.unshift("Select the Ceramic rate-sheet customer in billing settings.");
  if (assignment.snapshot.version !== shipment.version || shipment.plannerVersion !== shipment.version) calculation.issues.unshift("Save the assignment for the latest PDF before confirming its billing.");
  const route = await ctx.db.get(assignment.routeId);
  const invoice = route ? await ctx.db.query("invoices").withIndex("by_routeId", q => q.eq("routeId", route._id)).first() : null;
  const readOnly = !route || !!route.isDeleted || (route.status || "planned") !== "planned" || !!invoice;
  if (route && !readOnly) {
    const expected = route.ceramicBillingTotal !== undefined && route.ceramicBillingTons !== undefined ? ceramicBilledMainLoad(assignment.snapshot, shipment._id, route.ceramicBillingTons, route.ceramicBillingTotal, route.ceramicRatePerTon !== undefined && route.ceramicExtraStopCharge !== undefined ? { ratePerTon: route.ceramicRatePerTon, extraStops: route.ceramicExtraStopCharge } : undefined) : ceramicMainLoad(assignment.snapshot, shipment._id);
    if (route.rate !== 0 || !ceramicEqual(route.loads, [expected])) calculation.issues.push("The Planner main load has manual pricing or load edits. Flag billing for review to preserve those values, or review the Planner load before confirming automated charges.");
  }
  const fingerprint = ceramicBillingFingerprint({ snapshot: shipment.snapshot, version: shipment.version, routeDate: assignment.routeDate, driver: assignment.driverId, truck: assignment.truckId, config, choices, selected, calculation });
  const savedBilling = assignment.billing, savedAuto = savedBilling?.automation;
  const ruleIssues = ceramicBillingRuleIssues(assignment.snapshot, savedBilling);
  const legacy = savedBilling ? ceramicMonthlyAmounts([], savedBilling) : null;
  const saved = savedBilling ? { ratePerTon: savedBilling.ratePerTon, mainTotal: savedAuto?.mainTotal ?? (savedBilling.ratePerTon !== null && savedBilling.stops !== null && savedBilling.drops !== null ? savedBilling.ratePerTon * 34 + savedBilling.stops + savedBilling.drops : legacy?.total ?? null), localTotal: savedAuto?.localTotal ?? (savedBilling.locals.some(l => l.price === null) ? null : savedBilling.locals.reduce((n, l) => n + (l.price ?? 0), 0)), chargeableTons: savedAuto?.chargeableTons ?? 34, status: ruleIssues.length ? "needs_review" : savedAuto?.status ?? "legacy", routeDate: savedAuto?.routeDate ?? assignment.routeDate, tariffLabel: savedAuto?.tariff?.destination ?? "Manually entered amounts", sourceVersion: assignment.billingSourceVersion ?? assignment.snapshot.version, tariffKey: savedAuto?.tariff?.key ?? "", fingerprint: savedAuto?.fingerprint ?? "", confirmedAt: savedAuto?.confirmedAt ?? assignment.billingUpdatedAt ?? 0 } : null;
  return { shipment, assignment, result: { ruleIssues, readOnly, routeDate: assignment.routeDate, version: shipment.version, assignmentUpdatedAt: assignment.updatedAt, billingUpdatedAt: assignment.billingUpdatedAt ?? 0, fingerprint, config, choices, selected, calculation, saved } };
}
export const preview = query({
  args: { token: v.string(), shipmentId: v.id("ceramicShipments"), chargeableTons: v.optional(v.number()), tariffKey: v.optional(v.string()) }, returns: ceramicBillingPreview,
  handler: async (ctx, args) => { await actor(ctx, args.token); return (await previewFor(ctx, args.shipmentId, args.chargeableTons, args.tariffKey)).result; },
});
/** Recompute on the server and commit Planner + both reports atomically. */
export const confirm = mutation({
  args: { token: v.string(), shipmentId: v.id("ceramicShipments"), expectedVersion: v.number(), expectedAssignmentUpdatedAt: v.number(), expectedBillingUpdatedAt: v.number(), expectedFingerprint: v.string(), chargeableTons: v.optional(v.number()), tariffKey: v.optional(v.string()), markForReview: v.optional(v.boolean()) },
  returns: v.object({ saved: v.boolean(), complete: v.boolean(), updatedAt: v.number() }),
  handler: async (ctx, args) => {
    const user = await actor(ctx, args.token), { shipment, assignment, result } = await previewFor(ctx, args.shipmentId, args.chargeableTons, args.tariffKey, true);
    if (shipment.version !== args.expectedVersion || assignment.updatedAt !== args.expectedAssignmentUpdatedAt || (assignment.billingUpdatedAt ?? 0) !== args.expectedBillingUpdatedAt || result.fingerprint !== args.expectedFingerprint) throw ceramicAssignmentError("Shipment, rates or billing changed. Review the refreshed amounts before saving.");
    const route = await ctx.db.get(assignment.routeId);
    if (!route || route.isDeleted || (route.status || "planned") !== "planned" || route.ceramicShipmentId !== shipment._id || route.region !== assignment.region || route.routeDate !== assignment.routeDate || route.driverName !== assignment.driverName || route.truckFleetNoStr !== assignment.truckFleetNo || await ctx.db.query("invoices").withIndex("by_routeId", q => q.eq("routeId", route._id)).first()) throw ceramicAssignmentError("The linked Planner load is changed, removed, completed, locked or invoiced. Review it before changing billing.");
    const c = result.calculation, complete = c.issues.length === 0;
    if (!complete && !args.markForReview) throw ceramicAssignmentError(c.issues[0]);
    if (!Number.isFinite(c.chargeableTons) || c.chargeableTons <= 0 || c.chargeableTons > 1000) throw ceramicAssignmentError("Enter valid chargeable tons before saving.");
    if (assignment.snapshot.version !== shipment.version || shipment.plannerVersion !== shipment.version) throw ceramicAssignmentError("Save the latest shipment assignment before billing.");
    if (complete) {
      const expected = route.ceramicBillingTotal !== undefined && route.ceramicBillingTons !== undefined ? ceramicBilledMainLoad(assignment.snapshot, shipment._id, route.ceramicBillingTons, route.ceramicBillingTotal, route.ceramicRatePerTon !== undefined && route.ceramicExtraStopCharge !== undefined ? { ratePerTon: route.ceramicRatePerTon, extraStops: route.ceramicExtraStopCharge } : undefined) : ceramicMainLoad(assignment.snapshot, shipment._id);
      if (route.rate !== 0 || !ceramicEqual(route.loads, [expected])) throw ceramicAssignmentError("The Planner main load has manual pricing or load edits. They were preserved. Review the Planner load before confirming automated billing.");
    }
    const now = Math.max(Date.now(), (assignment.billingUpdatedAt ?? 0) + 1), selected = result.selected;
    const { version: _settingsVersion, effectiveDate: _effectiveDate, customerId: _customerId, ...rules } = result.config; void _settingsVersion; void _effectiveDate; void _customerId;
    const automation = { status: complete ? "confirmed" as const : "needs_review" as const, routeDate: assignment.routeDate, variant: c.pickupTownCount === 1 ? "sp" as const : "standard" as const, chargeableTons: c.chargeableTons, pickupCount: c.pickups, ...(c.pickupTownCount !== null ? { pickupTownCount: c.pickupTownCount } : {}), dropCount: c.deliveries, extraPickups: c.extraPickups, extraDrops: c.extraDrops, ...rules, freight: complete ? c.freight : null, mainTotal: complete ? c.mainTotal : null, localTotal: c.localTotal, fingerprint: result.fingerprint, settingsVersion: result.config.version, confirmedAt: now, confirmedBy: String(user._id), tariff: selected ? { key: selected.key, sheetId: selected.sheetId, revision: selected.revision, laneId: selected.laneId, loadingPoint: selected.loadingPoint, destination: selected.destination, effectiveDate: selected.effectiveDate, ratePerTon: selected.ratePerTon } : null, issues: c.issues };
    const calculated = { ratePerTon: selected?.ratePerTon ?? null, stops: c.pickupCharge + c.dropCharge, drops: 0, crossBorder: assignment.billing?.crossBorder ?? "", load: assignment.billing?.load ?? "", locals: c.locals.map(leg => ({ key: leg.key, from: leg.from, to: leg.to, price: leg.price })) };
    const billing = { ...(!complete && assignment.billing ? assignment.billing : calculated), automation };
    if (assignment.billing && !await ctx.db.query("ceramicBillingHistory").withIndex("by_shipment", q => q.eq("shipmentId", shipment._id)).first()) await ctx.db.insert("ceramicBillingHistory", { shipmentId: shipment._id, routeDate: assignment.routeDate, version: assignment.billingSourceVersion ?? assignment.snapshot.version, billing: assignment.billing, recordedAt: assignment.billingUpdatedAt ?? assignment.updatedAt, recordedBy: assignment.billingUpdatedBy ?? assignment.updatedBy, reason: "preserved baseline" });
    await ctx.db.insert("ceramicBillingHistory", { shipmentId: shipment._id, routeDate: assignment.routeDate, version: shipment.version, billing, recordedAt: now, recordedBy: String(user._id), reason: complete ? "confirmed" : "needs review" });
    if (complete) await ctx.db.patch(route._id, { loads: [ceramicBilledMainLoad(shipment.snapshot, shipment._id, c.chargeableTons, c.mainTotal!, { ratePerTon: selected!.ratePerTon, extraStops: c.pickupCharge + c.dropCharge })], ceramicBillingTotal: c.mainTotal!, ceramicBillingTons: c.chargeableTons, ceramicRatePerTon: selected!.ratePerTon, ceramicExtraStopCharge: c.pickupCharge + c.dropCharge });
    await ctx.db.patch(assignment._id, { billing, billingUpdatedAt: now, billingUpdatedBy: String(user._id), billingSourceVersion: shipment.version });
    return { saved: true, complete, updatedAt: now };
  },
});

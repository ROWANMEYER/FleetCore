/**
 * Temporary test helper: seeds a single daily route for TODAY (with one load)
 * so the mobile-audit route-flow check can run against the live site.
 *
 * Usage:
 *   node scripts/seed-test-route.mjs create   # insert + print routeId
 *   node scripts/seed-test-route.mjs delete <routeId>
 */
import { ConvexHttpClient } from "convex/browser";

const client = new ConvexHttpClient("https://quixotic-gopher-969.convex.cloud");
const [, , cmd, routeIdArg] = process.argv;

const today = new Date().toISOString().slice(0, 10);

if (cmd === "create") {
  const route = await client.mutation("dailyRoutes:createDailyRoute", {
    routeDate: today,
    driverName: "Test Driver",
    truckFleetNoStr: "TEST-01",
    kilometers: 60,
    loads: [
      {
        client: "Audit Test Client",
        quantity: "10",
        quantityType: "tons",
        rate: "100",
        rateType: "per_unit",
        fromLocations: ["Pretoria"],
        toLocations: ["Johannesburg"],
        loadId: "L-AUDIT-1",
      },
    ],
  });
  console.log("CREATED_ROUTE_ID=" + (route && route._id ? route._id : JSON.stringify(route)));
} else if (cmd === "delete" && routeIdArg) {
  const res = await client.mutation("dailyRoutes:deleteDailyRoute", { id: routeIdArg });
  console.log("DELETED=" + JSON.stringify(res));
} else {
  console.log("Usage: node scripts/seed-test-route.mjs create | delete <routeId>");
}

import { ConvexHttpClient } from "convex/browser";

const client = new ConvexHttpClient("https://quixotic-gopher-969.convex.cloud");

function datePlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function seedFleet() {
  // Seed a driver with a near-term expiry (critical within 3 days)
  try {
    const driver = await client.mutation("fleet:createDriver", {
      driverId: "JD-001",
      driverName: "John Doe",
      idNumber: "9001015009087",
      phone: "0710000000",
      status: "active",
      licenseExpiryDate: datePlus(2), // critical
      pdpExpiryDate: datePlus(20),
    });
    console.log("Driver created:", driver);
  } catch (e) {
    console.warn("Driver create skipped:", e?.message || e);
  }

  // Seed a truck with a service due this week (warning within 7 days)
  try {
    const truck = await client.mutation("fleet:createTruck", {
      truckFleetNo: "T101",
      registration: "REG-101",
      make: "Volvo",
      model: "FH16",
      status: "active",
      serviceDueDate: datePlus(6), // this week
    });
    console.log("Truck created:", truck);
  } catch (e) {
    console.warn("Truck create skipped:", e?.message || e);
  }

  // Seed a trailer with a license expiry this week (warning)
  try {
    const trailer = await client.mutation("fleet:createTrailer", {
      trailerFleetNo: 5,
      trailerFleetNoStr: "TRL-05",
      trailers: [{ length: "13.6m", registration: "TRL-05" }],
      type: "flatbed",
      status: "active",
      licenseExpiryDate: datePlus(5), // this week
    });
    console.log("Trailer created:", trailer);
  } catch (e) {
    console.warn("Trailer create skipped:", e?.message || e);
  }
}

async function insertToday() {
  try {
    const result = await client.mutation("dailyAvailability:upsert", {
      dateISO: "2026-03-13",
      drivers: ["John Doe"],
      trucks: ["T101"],
      trailers: ["TRL-05"],
      status: "available"
    });
    console.log("Success:", result);
  } catch (error) {
    console.error("Error:", error);
  }
}

async function main() {
  await seedFleet();
  await insertToday();
}

main();

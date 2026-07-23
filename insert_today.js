// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ConvexHttpClient } = require("convex/server");

const client = new ConvexHttpClient("https://quixotic-gopher-969.convex.cloud");

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

insertToday();
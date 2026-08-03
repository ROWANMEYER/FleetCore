/**
 * Seed (or update) the admin user for FleetCore auth.
 *
 * Usage:
 *   node scripts/seed-admin.mjs [email] [password]
 * Defaults: admin@fleetcore.app / admin123
 */
import { ConvexHttpClient } from "convex/browser";
import { writeFileSync } from "node:fs";

const client = new ConvexHttpClient("https://quixotic-gopher-969.convex.cloud");
const email = process.argv[2] || "admin@fleetcore.app";
const password = process.argv[3] || "admin123";

if (!email.includes("@") || password.length < 6) {
  console.error("Usage: node scripts/seed-admin.mjs <email> <password (min 6 chars)>");
  process.exit(1);
}

try {
  const res = await client.action("users:seedAdmin", { email, password });
  writeFileSync("seed-admin-result.json", JSON.stringify({ ok: true, res }));
} catch (err) {
  writeFileSync("seed-admin-result.json", JSON.stringify({ ok: false, error: String(err) }));
}
// Force an immediate exit — avoids a Node v24 Windows libuv assertion at exit
process.exit(0);

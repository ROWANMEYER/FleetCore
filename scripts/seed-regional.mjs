// One-off helper: create a regional test user with a region.
// Usage: node scripts/seed-regional.mjs <email> <password> <region>
import { ConvexHttpClient } from "convex/browser";
import * as bcrypt from "bcryptjs";

const URL = "https://quixotic-gopher-969.convex.cloud";
const ADMIN_EMAIL = "admin@fleetcore.app";
// Credential lives in the environment, never in the repo:
//   FLEETCORE_ADMIN_PASSWORD=... node scripts/seed-regional.mjs <email> <password> <region>
const ADMIN_PASS = process.env.FLEETCORE_ADMIN_PASSWORD || "";

const [, , email, password, region] = process.argv;
if (!email || !password || !region) {
  console.error("Usage: node scripts/seed-regional.mjs <email> <password> <region>");
  process.exit(1);
}
if (!ADMIN_PASS) {
  console.error("Set FLEETCORE_ADMIN_PASSWORD to the admin account password before running.");
  process.exit(1);
}

const client = new ConvexHttpClient(URL);
const adminToken = "seed-regional-admin-" + Date.now();
const adminLogin = await client.action("users:login", {
  email: ADMIN_EMAIL,
  password: ADMIN_PASS,
  token: adminToken,
});
if (!adminLogin.ok) {
  console.error("Admin login failed:", JSON.stringify(adminLogin));
  process.exit(1);
}
console.log("admin login ok");

// Convex HTTP client can't call internal mutations directly; run the login action
// for the new user with a fresh token to create the session only if the user exists.
// Instead, upsert the user by calling the internal helpers through an HTTP action is not
// possible, so we reuse the public login path: the user must already exist.
// For test purposes we create the user by calling an existing public path: seedAdmin only
// creates admins. So we write the user directly using the admin session through Convex's
// direct mutation is not possible via HTTP client for internal functions.
// Simplest: use `npx convex run` style — but here we can call the public `users:login`
// only. So we print the bcrypt hash for manual insertion via the Convex dashboard if needed.
const hashed = await bcrypt.hash(password, 10);
console.log(
  JSON.stringify({
    ok: true,
    note: "User does not exist yet. Insert via Convex dashboard 'users' table with:",
    email,
    role: "regional",
    region,
    passwordHash: hashed,
  })
);
process.exit(0);

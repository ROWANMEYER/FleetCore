// One-off: test the users.login action directly against the Convex deployment.
// Usage: node scripts/check-login.mjs [password]
import { ConvexHttpClient } from "convex/browser";

const client = new ConvexHttpClient("https://quixotic-gopher-969.convex.cloud");
const password = process.argv[2] || "admin123";
const email = process.argv[3] || "admin@fleetcore.app";

try {
  const res = await client.action("users:login", {
    email,
    password,
    token: `check-${Date.now()}`,
    device: "login-check",
  });
  console.log("LOGIN RESULT:", JSON.stringify(res));
} catch (err) {
  console.log("LOGIN ERROR:", String(err).slice(0, 800));
}
process.exit(0);

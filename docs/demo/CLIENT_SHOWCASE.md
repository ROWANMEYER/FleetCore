# FleetCor isolated client demo

This branch is for a **marketing/demo environment only**. Never use the ALR/shared FleetCor Convex backend.

## What is prepared
- Separate Vercel project: `fleetcor-client-demo` (created without a Git connection or deployment).
- Standalone synthetic pack: `FleetCor_Demo_Data_Pack.zip` supplied in the ChatGPT conversation.
- Data validated: 10 trucks, 12 trailers, 12 drivers, 11 customers, 468 routes / 523 loads.
- Typical Oct 2026 sample: 162 routes / 188 loads / R657,093.18.

## Manual provisioning (requires your authenticated Convex session)
1. Work in a **separate clone** (`C:\\dev\\FleetCor-Demo`), switch to `demo/fleetcor-client-demo`, and run `npm ci`.
2. Run `npx convex deployment create` and create a **new dev deployment** with a reference containing `fleetcor-demo`; select the new deployment. Do **not** reuse the existing `.env.local`.
3. Confirm that `NEXT_PUBLIC_CONVEX_URL` does **not** contain `quixotic-gopher-969`. Run `npx convex dev --once` to install backend code in this **new dev deployment only**.
4. Extract the demo ZIP to a working folder and run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\\scripts\\demo\\import-demo.ps1 -Deployment "dev/<your-username>/fleetcor-client-demo" -DataDir "C:\\path\\to\\convex_jsonl"
   ```
   Replace the deployment reference with the exact new one. The importer refuses generic and known live targets and doesn't append or replace data.
5. For login, use the **new demo deployment's** Convex dashboard to run `users:seedAdmin` with a demo-only username and fresh password.
   **DO NOT run `scripts/seed-admin.mjs`: that existing file hardcodes the current FleetCor backend URL.**
6. After verifying routes and login, connect the separate Vercel project to this branch and configure `NEXT_PUBLIC_CONVEX_URL` to the new demo URL. Do not modify or redeploy the existing FleetCor Vercel project.
7. In FleetCor dashboard, view Oct 1–31, 2026. Make it clear advertising figures are illustrative.

## Hard rules
- No `--prod`, `npx convex deploy`, mass deletes, `--replace` or `--append`.
- Don't copy live credentials, customer records, driver IDs or photos into the demo.
- Never connect the isolated demo Vercel project to a shared/live backend.
- No merge into `main` is required for filming.

Read the verified import docs: https://docs.convex.dev/cli/reference/import

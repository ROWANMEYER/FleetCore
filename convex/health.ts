import { query } from "./_generated/server";

// ============================================================================
// HELPER: ISSUE CALCULATION
// ============================================================================

function getDaysDiff(targetDateStr: string) {
  if (!targetDateStr) return 999;
  const target = new Date(targetDateStr).getTime();
  const now = Date.now();
  const diffTime = target - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
}

function checkIssue(dateStr?: string): "critical" | "warning" | null {
  if (!dateStr) return null;
  const diff = getDaysDiff(dateStr);
  if (diff < 0) return "critical";
  if (diff <= 30) return "warning";
  return null;
}

export const getFleetHealth = query({
  args: {},
  handler: async (ctx) => {
    const drivers = await ctx.db.query("drivers").collect();
    const trucks = await ctx.db.query("trucks").collect();
    const trailers = await ctx.db.query("trailers").collect();

    let criticalCount = 0;
    let warningCount = 0;

    // Scan Drivers
    drivers.forEach((d) => {
      const licenseIssue = checkIssue(d.licenseExpiryDate);
      if (licenseIssue === "critical") criticalCount++;
      if (licenseIssue === "warning") warningCount++;

      const pdpIssue = checkIssue(d.pdpExpiryDate);
      if (pdpIssue === "critical") criticalCount++;
      if (pdpIssue === "warning") warningCount++;
    });

    // Scan Trucks
    trucks.forEach((t) => {
      const licenseIssue = checkIssue(t.licenseExpiryDate);
      if (licenseIssue === "critical") criticalCount++;
      if (licenseIssue === "warning") warningCount++;
      
      // Service Due (Optional logic if needed later)
    });

    // Scan Trailers
    trailers.forEach((t) => {
      const licenseIssue = checkIssue(t.licenseExpiryDate);
      if (licenseIssue === "critical") criticalCount++;
      if (licenseIssue === "warning") warningCount++;
    });

    // Calculate Score
    // Formula: Start at 100. Deduct 10 for critical, 3 for warning. Min 0.
    let score = 100;
    score -= (criticalCount * 10);
    score -= (warningCount * 3);
    if (score < 0) score = 0;

    return {
      score,
      criticalCount,
      warningCount,
      details: {
        driversActive: drivers.filter(d => d.status === 'active').length,
        trucksActive: trucks.filter(t => t.status !== 'maintenance' && t.status !== 'inactive').length,
        trailersActive: trailers.filter(t => t.status !== 'maintenance').length,
      }
    };
  },
});

import { query } from "../_generated/server";
import { v } from "convex/values";

export const getFinanceSummary = query({
  args: {},
  handler: async (ctx) => {
    // 1. Get Snapshots (sorted by month desc)
    const snapshots = await ctx.db
      .query("ageSnapshots")
      .withIndex("by_month")
      .order("desc")
      .take(6); // Take last 6 for trend

    const latestSnapshot = snapshots[0];
    const previousSnapshot = snapshots[1];

    // Initialize default values
    const kpis = {
      totalOutstanding: 0,
      overdue60Plus: 0,
      risk120Plus: 0,
      customersOverdue: 0,
      onAccount: 0,
    };

    const charts = {
      ageBuckets: {
        current: 0,
        days30: 0,
        days60: 0,
        days90: 0,
        days120: 0,
      },
      outstandingTrend: [] as { month: string; totalDue: number }[],
      topRiskCustomers: [] as { name: string; amount: number; category: string }[],
    };

    const insights: { type: "warning" | "info"; message: string }[] = [];

    // Process Snapshot Data
    if (latestSnapshot) {
      // KPIs
      kpis.totalOutstanding = latestSnapshot.totalDue;
      kpis.risk120Plus = latestSnapshot.days120;
      kpis.overdue60Plus =
        latestSnapshot.days60 + latestSnapshot.days90 + latestSnapshot.days120;

      // Charts: Age Buckets
      charts.ageBuckets = {
        current: latestSnapshot.current,
        days30: latestSnapshot.days30,
        days60: latestSnapshot.days60,
        days90: latestSnapshot.days90,
        days120: latestSnapshot.days120,
      };

      // Charts: Trend (Reverse to be chronological)
      charts.outstandingTrend = snapshots
        .slice()
        .reverse()
        .map((s) => ({
          month: s.month,
          totalDue: s.totalDue,
        }));

      // Get Rows for Risk Analysis
      const rows = await ctx.db
        .query("ageSnapshotRows")
        .withIndex("by_snapshotId", (q) =>
          q.eq("snapshotId", latestSnapshot._id)
        )
        .collect();

      // KPIs: Customers Overdue (Any debt > 60 days)
      kpis.customersOverdue = rows.filter(
        (r) => r.days60 > 0 || r.days90 > 0 || r.days120 > 0
      ).length;

      // Charts: Top Risk Customers (Top 5 by 120+ days)
      charts.topRiskCustomers = rows
        .filter((r) => r.days120 > 0)
        .sort((a, b) => b.days120 - a.days120)
        .slice(0, 5)
        .map((r) => ({
          name: r.clientName,
          amount: r.days120,
          category: "120+ Days",
        }));
      
      // Fallback: If not enough 120+ customers, fill with 90+ or 60+?
      // For now, just show 120+ risks as that's the priority.

      // Insights Calculation
      if (previousSnapshot) {
        const diff120 = latestSnapshot.days120 - previousSnapshot.days120;
        if (diff120 > 0) {
          insights.push({
            type: "warning",
            message: `Overdue (120+) increased by ${formatCurrency(diff120)} vs last month`,
          });
        }
      }
      
      const movedTo120Count = rows.filter(r => r.days120 > 0).length;
      if (movedTo120Count > 0) {
         insights.push({
            type: "warning",
            message: `${movedTo120Count} customers currently in 120+ days risk bucket`,
         });
      }
    }

    // Process On Account Allocations
    // We need to fetch ALL allocations with type ON_ACCOUNT.
    // Since there's no index on allocationType, we might have to filter manually or add an index.
    // However, for dashboard speed, let's assume the number of allocations isn't massive yet, 
    // OR ideally we should add an index. 
    // But `paymentAllocations` has `by_paymentId`.
    // Let's assume we iterate or use a helper. 
    // Actually, `paymentAllocations` does NOT have an index on `allocationType`.
    // Let's look at schema again.
    // paymentAllocations: index by paymentId, snapshotRowId, accountNumber.
    // We can't efficiently query "allocationType == ON_ACCOUNT" without a table scan or index.
    // Given this is a dashboard query, a table scan is risky if data is large.
    // However, for this project stage, it might be fine. 
    // BUT, we can use `by_snapshotRowId`? No.
    // Let's just do a full scan for now, or fetch by time if possible? 
    // Wait, On Account allocations don't have a snapshotRowId (it's optional). 
    // But `snapshotId` is also optional.
    // Maybe we can check for missing snapshotId?
    // Convex `filter` is reasonably fast for thousands of rows.
    
    const onAccountAllocations = await ctx.db
      .query("paymentAllocations")
      .filter((q) => q.eq(q.field("allocationType"), "ON_ACCOUNT"))
      .collect();

    const totalOnAccount = onAccountAllocations.reduce(
      (sum, a) => sum + a.allocatedAmount,
      0
    );
    kpis.onAccount = totalOnAccount;

    if (totalOnAccount > 0) {
      insights.push({
        type: "info",
        message: `${formatCurrency(totalOnAccount)} received but held On Account (unallocated)`,
      });
    }

    return {
      kpis,
      charts,
      insights,
      hasData: !!latestSnapshot,
      latestSnapshotId: latestSnapshot?._id,
    };
  },
});

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0, // Simplify for insights
  }).format(val);
}

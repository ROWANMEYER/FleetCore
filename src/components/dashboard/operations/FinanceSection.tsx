"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useState } from "react";
import DrillDownPanel, { KpiType } from "./DrillDownPanel";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  PieChart,
  Pie,
} from "recharts";

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(val);

const formatCompactCurrency = (val: number) => {
  if (val >= 1000000) return `R ${(val / 1000000).toFixed(1)}m`;
  if (val >= 1000) return `R ${(val / 1000).toFixed(1)}k`;
  return formatCurrency(val);
};

export default function FinanceSection() {
  const data = useQuery(api.finance.dashboard.getFinanceSummary);
  const [activeKpi, setActiveKpi] = useState<KpiType>(null);

  const latestSnapshotId = data?.latestSnapshotId;

  // Fetch detailed data for drill-down - UNCONDITIONAL HOOKS
  const snapshotRows = useQuery(
    api.finance.getAgeSnapshotRows.getAgeSnapshotRows,
    (data && latestSnapshotId && activeKpi && activeKpi !== "on_account") 
      ? { snapshotId: latestSnapshotId } 
      : "skip"
  );

  const payments = useQuery(
    api.finance.payments.getPaymentsWithAllocationStatus,
    (data && activeKpi === "on_account") ? {} : "skip"
  );

  if (data === undefined) {
    return (
      <div className="animate-pulse space-y-4 p-4">
        <div className="h-8 bg-gray-200 rounded w-1/4"></div>
        <div className="h-24 bg-gray-100 rounded"></div>
        <div className="grid grid-cols-3 gap-4">
            <div className="h-48 bg-gray-100 rounded"></div>
            <div className="h-48 bg-gray-100 rounded"></div>
            <div className="h-48 bg-gray-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (!data.hasData) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
        <h3 className="text-sm font-medium text-gray-900">No Finance Data Yet</h3>
        <p className="mt-1 text-sm text-gray-500">Import an Age Analysis snapshot to see finance insights.</p>
        <Link href="/admin/age-analysis" className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200">
          Go to Age Analysis
        </Link>
      </div>
    );
  }

  const { kpis, charts, insights } = data;

  // Prepare Chart Data
  const ageBucketData = [
    { name: "Current", value: charts.ageBuckets.current, color: "#10B981" }, // Green
    { name: "30 Days", value: charts.ageBuckets.days30, color: "#3B82F6" },  // Blue
    { name: "60 Days", value: charts.ageBuckets.days60, color: "#F59E0B" },  // Yellow
    { name: "90 Days", value: charts.ageBuckets.days90, color: "#F97316" },  // Orange
    { name: "120+", value: charts.ageBuckets.days120, color: "#EF4444" },    // Red
  ];

  const getKpiValue = () => {
    switch (activeKpi) {
      case "total_outstanding": return formatCompactCurrency(kpis.totalOutstanding);
      case "overdue_60": return formatCompactCurrency(kpis.overdue60Plus);
      case "risk_120": return formatCompactCurrency(kpis.risk120Plus);
      case "customers_overdue": return kpis.customersOverdue.toString();
      case "on_account": return formatCompactCurrency(kpis.onAccount);
      default: return undefined;
    }
  };

  return (
    <div className="relative">
      <div className={`space-y-8 transition-all duration-300 ease-in-out ${activeKpi ? 'mr-[600px]' : ''}`}>
        {/* HEADER */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
            FINANCE SUMMARY
          </h2>
          <p className="text-xs text-gray-500 mt-1 ml-4">
            Risk, debt, and cash timing.
          </p>
        </div>

        {/* KPI STRIP */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <KpiCard
            label="Total Outstanding"
            value={formatCompactCurrency(kpis.totalOutstanding)}
            subtext="Total Due"
            onClick={() => setActiveKpi("total_outstanding")}
            isActive={activeKpi === "total_outstanding"}
          />
          <KpiCard
            label="Overdue (60+)"
            value={formatCompactCurrency(kpis.overdue60Plus)}
            subtext="Needs attention"
            isWarning={kpis.overdue60Plus > 0}
            onClick={() => setActiveKpi("overdue_60")}
            isActive={activeKpi === "overdue_60"}
          />
          <KpiCard
            label="120+ Risk"
            value={formatCompactCurrency(kpis.risk120Plus)}
            subtext="Critical"
            isDanger={kpis.risk120Plus > 0}
            onClick={() => setActiveKpi("risk_120")}
            isActive={activeKpi === "risk_120"}
          />
          <KpiCard
            label="Customers Overdue"
            value={kpis.customersOverdue.toString()}
            subtext="Accounts > 60 days"
            onClick={() => setActiveKpi("customers_overdue")}
            isActive={activeKpi === "customers_overdue"}
          />
          <KpiCard
            label="On Account"
            value={formatCompactCurrency(kpis.onAccount)}
            subtext="Unallocated Advances"
            isInfo={kpis.onAccount > 0}
            onClick={() => setActiveKpi("on_account")}
            isActive={activeKpi === "on_account"}
          />
        </div>

        {/* CHARTS ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* CHART A: Age Bucket Breakdown */}
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-4">Debt Age Profile</h3>
              <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={ageBucketData} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                          <XAxis type="number" hide />
                          <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                              {ageBucketData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                          </Bar>
                      </BarChart>
                  </ResponsiveContainer>
              </div>
          </div>

          {/* CHART B: Outstanding Trend */}
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
               <h3 className="text-xs font-semibold text-gray-500 uppercase mb-4">6-Month Trend</h3>
               <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={charts.outstandingTrend}>
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis hide domain={['auto', 'auto']} />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          <Line type="monotone" dataKey="totalDue" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                  </ResponsiveContainer>
               </div>
          </div>

          {/* CHART C: Top Risk Customers */}
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
               <h3 className="text-xs font-semibold text-gray-500 uppercase mb-4">Top Risk (120+ Days)</h3>
               <div className="space-y-3">
                   {charts.topRiskCustomers.length === 0 ? (
                       <div className="text-xs text-gray-400 italic">No customers in 120+ risk bucket.</div>
                   ) : (
                       charts.topRiskCustomers.map((c, i) => (
                           <div key={i} className="flex items-center justify-between text-sm">
                               <div className="truncate max-w-[60%] font-medium text-gray-700" title={c.name}>{c.name}</div>
                               <div className="text-red-600 font-mono text-xs">{formatCompactCurrency(c.amount)}</div>
                           </div>
                       ))
                   )}
                   <Link href="/admin/age-analysis" className="block text-center text-xs text-blue-600 hover:underline mt-4">
                      View Full Analysis →
                   </Link>
               </div>
          </div>
        </div>

        {/* INSIGHTS SECTION */}
        {insights.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-4">
                <h3 className="text-xs font-bold text-yellow-800 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <span className="text-base">💡</span> Insights & Action Cues
                </h3>
                <ul className="space-y-2">
                    {insights.map((insight, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-yellow-900">
                            <span className="mt-0.5">{insight.type === 'warning' ? '⚠️' : 'ℹ️'}</span>
                            <span>{insight.message}</span>
                        </li>
                    ))}
                </ul>
            </div>
        )}
      </div>

      {/* DRILL DOWN PANEL */}
      <DrillDownPanel 
        isOpen={!!activeKpi} 
        onClose={() => setActiveKpi(null)} 
        kpiType={activeKpi}
        snapshotRows={snapshotRows}
        payments={payments}
        kpiValue={getKpiValue()}
      />
    </div>
  );
}

function KpiCard({ label, value, subtext, isWarning, isDanger, isInfo, href, onClick, isActive }: { label: string, value: string, subtext: string, isWarning?: boolean, isDanger?: boolean, isInfo?: boolean, href?: string, onClick?: () => void, isActive?: boolean }) {
    let valueColor = "text-gray-900";
    if (isDanger) valueColor = "text-red-600";
    else if (isWarning) valueColor = "text-orange-600";
    else if (isInfo) valueColor = "text-blue-600";

    const content = (
        <div 
            onClick={onClick}
            className={`bg-white p-4 rounded-lg border shadow-sm h-full flex flex-col justify-center transition-all 
                ${(href || onClick) ? 'cursor-pointer hover:shadow-md' : ''}
                ${isActive ? 'border-blue-500 ring-2 ring-blue-500 ring-opacity-50' : 'border-gray-200 hover:border-blue-300'}
            `}
        >
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 truncate">{label}</div>
            <div className={`text-2xl font-bold ${valueColor} mb-1`}>{value}</div>
            <div className="text-xs text-gray-400">{subtext}</div>
        </div>
    );

    if (href) {
        return <Link href={href} className="block h-full">{content}</Link>;
    }

    return content;
}

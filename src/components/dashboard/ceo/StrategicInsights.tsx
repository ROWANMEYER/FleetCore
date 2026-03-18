import React from "react";

interface StrategicInsightsProps {
    execSummary: any;
    financial: any;
    operational: any;
    customers: any;
    fleet: any;
}

interface Insight {
    type: "success" | "warning" | "alert" | "info";
    title: string;
    description: string;
    action?: string;
}

export default function StrategicInsights({
    execSummary,
    financial,
    operational,
    customers,
    fleet,
}: StrategicInsightsProps) {
    const insights: Insight[] = [];

    // Analyze profitability
    if (execSummary?.revenuePerKm > 5) {
        insights.push({
            type: "success",
            title: "Strong Unit Economics",
            description: `Revenue per km is R${(execSummary.revenuePerKm || 0).toFixed(2)} - well-optimized routing and pricing`,
            action: "Maintain current operational model",
        });
    } else if (execSummary?.revenuePerKm < 3) {
        insights.push({
            type: "alert",
            title: "Low Revenue Efficiency",
            description: `Revenue per km is only R${(execSummary.revenuePerKm || 0).toFixed(2)} - consider price optimization or cost reduction`,
            action: "Review pricing strategy and route optimization",
        });
    }

    // Analyze completion rate
    if (operational?.plannedCompletionRate < 50) {
        insights.push({
            type: "alert",
            title: "Plan Execution Issues",
            description: `Only ${(operational?.plannedCompletionRate || 0).toFixed(0)}% of planned routes completed - operational delays likely`,
            action: "Investigate route planning and resource allocation",
        });
    }

    // Analyze customer concentration
    if (customers?.concentrationRisk > 70) {
        insights.push({
            type: "alert",
            title: "High Customer Concentration Risk",
            description: `Top 10 customers represent ${(customers?.concentrationRisk || 0).toFixed(1)}% of revenue - vulnerable to customer loss`,
            action: "Develop customer retention strategy and seek new revenue streams",
        });
    } else if (customers?.concentrationRisk <= 50) {
        insights.push({
            type: "success",
            title: "Healthy Customer Diversification",
            description: `Revenue well distributed across ${customers?.totalUniqueCustomers || 0} customers - reduces business risk`,
            action: "Continue balanced customer acquisition",
        });
    }

    // Analyze receivables health
    if (financial?.riskLevel === "critical") {
        insights.push({
            type: "alert",
            title: "Critical Receivables Position",
            description: `${(financial?.critical120Plus || 0).toLocaleString()} in debt over 120 days - immediate action required`,
            action: "Launch aggressive collection campaign for 120+ day cohort",
        });
    } else if (financial?.riskLevel === "risk") {
        insights.push({
            type: "warning",
            title: "High Overdue Receivables",
            description: `${(financial?.overdue60Plus || 0).toLocaleString()} overdue 60+ days - cash flow pressure likely`,
            action: "Prioritize collections on 60+ day accounts",
        });
    } else if (financial?.riskLevel === "healthy") {
        insights.push({
            type: "success",
            title: "Strong Receivables Management",
            description: `Healthy cash conversion cycle with average ${(financial?.daysOutstanding || 0)} days outstanding`,
            action: "Maintain current payment terms and collections process",
        });
    }

    // Analyze fleet utilization
    if (fleet?.totalTrucksActive && execSummary?.totalRoutes) {
        const utilization = execSummary.totalRoutes / fleet.totalTrucksActive;
        if (utilization < 0.5) {
            insights.push({
                type: "warning",
                title: "Low Fleet Utilization",
                description: `Only ${(utilization * 100).toFixed(0)}% of trucks are active - assets may be underutilized`,
                action: "Assess if fleet size is appropriate for current demand",
            });
        } else if (utilization > 1.2) {
            insights.push({
                type: "alert",
                title: "Fleet Over-utilization Risk",
                description: `Fleet utilization over 100% - operating above capacity with quality/safety risks`,
                action: "Consider fleet expansion or load optimization",
            });
        }
    }

    // Analyze load efficiency
    if (operational?.loadsPerRoute < 1.5) {
        insights.push({
            type: "info",
            title: "Low Loads Per Route",
            description: `Average ${(operational?.loadsPerRoute || 0).toFixed(1)} loads per route - consolidation opportunity`,
            action: "Investigate route consolidation or backhauling potential",
        });
    }

    const typeConfig = {
        success: { bg: "bg-green-50", border: "border-green-200", icon: "✓", color: "text-green-900" },
        warning: { bg: "bg-yellow-50", border: "border-yellow-200", icon: "⚠", color: "text-yellow-900" },
        alert: { bg: "bg-red-50", border: "border-red-200", icon: "!", color: "text-red-900" },
        info: { bg: "bg-blue-50", border: "border-blue-200", icon: "ℹ", color: "text-blue-900" },
    };

    return (
        <div className="rounded-lg p-8 border border-gray-200 shadow-sm bg-white">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Strategic Insights</h2>
                <p className="text-gray-600 text-sm mt-1">AI-powered analysis and recommendations for business optimization</p>
            </div>

            {insights.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-gray-500">No significant insights at this time</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {insights.map((insight, idx) => {
                        const config = typeConfig[insight.type];
                        return (
                            <div key={idx} className={`rounded-lg p-5 border-2 ${config.bg} ${config.border}`}>
                                <div className="flex items-start gap-4">
                                    <div className={`text-2xl font-bold ${config.color} flex-shrink-0`}>
                                        {config.icon}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className={`font-semibold ${config.color} mb-1`}>{insight.title}</h3>
                                        <p className="text-sm text-gray-700 mb-2">{insight.description}</p>
                                        {insight.action && (
                                            <p className={`text-xs font-medium ${config.color}`}>
                                                → {insight.action}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Key Metrics Summary */}
            <div className="mt-8 pt-8 border-t border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-4">Key Metrics Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                    <div className="p-3 bg-gray-50 rounded">
                        <p className="text-xs text-gray-600 mb-1">Total Revenue</p>
                        <p className="text-lg font-bold text-gray-900">
                            R{(execSummary?.totalRevenue || 0).toLocaleString()}
                        </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded">
                        <p className="text-xs text-gray-600 mb-1">Completion Rate</p>
                        <p className="text-lg font-bold text-gray-900">
                            {(operational?.plannedCompletionRate || 0).toFixed(0)}%
                        </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded">
                        <p className="text-xs text-gray-600 mb-1">Outstanding</p>
                        <p className="text-lg font-bold text-gray-900">
                            R{(financial?.totalOutstanding || 0).toLocaleString()}
                        </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded">
                        <p className="text-xs text-gray-600 mb-1">Top 10 Revenue %</p>
                        <p className="text-lg font-bold text-gray-900">
                            {(customers?.concentrationRisk || 0).toFixed(0)}%
                        </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded">
                        <p className="text-xs text-gray-600 mb-1">Active Trucks</p>
                        <p className="text-lg font-bold text-gray-900">{fleet?.totalTrucksActive || 0}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

import React from "react";
import { TrendIcon } from "@/src/components/dashboard/ceo/TrendIcon";

interface FinancialHealthProps {
    data: any;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
};

export default function FinancialHealthWidget({ data }: FinancialHealthProps) {
    if (!data) {
        return (
            <div className="bg-white rounded-lg p-8 border border-gray-200 shadow-sm">
                <div className="animate-pulse h-40 bg-gray-200 rounded"></div>
            </div>
        );
    }

    const riskColors = {
        healthy: { bg: "bg-green-50", border: "border-green-200", text: "text-green-900", badge: "bg-green-100 text-green-800" },
        caution: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-900", badge: "bg-yellow-100 text-yellow-800" },
        risk: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-900", badge: "bg-orange-100 text-orange-800" },
        critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-900", badge: "bg-red-100 text-red-800" },
        unknown: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-900", badge: "bg-gray-100 text-gray-800" },
    };

    const colors = riskColors[data.riskLevel as keyof typeof riskColors] || riskColors.unknown;

    return (
        <div className={`rounded-lg p-8 border-2 shadow-sm ${colors.bg} ${colors.border}`}>
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h2 className={`text-2xl font-bold ${colors.text}`}>Financial Health</h2>
                    <p className="text-gray-600 text-sm mt-1">Receivables aging analysis & cash flow indicators</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-semibold ${colors.badge}`}>
                    {data.riskLevel === "unknown" ? "No Data" : data.riskLevel.toUpperCase()}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-white rounded p-4 border border-gray-200">
                    <p className="text-gray-600 text-xs font-medium mb-2">TOTAL OUTSTANDING</p>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(data.totalOutstanding)}</p>
                    <p className="text-xs text-gray-500 mt-2">
                        {data.daysOutstanding} days average age
                    </p>
                </div>

                <div className="bg-white rounded p-4 border border-gray-200">
                    <p className="text-gray-600 text-xs font-medium mb-2">CURRENT</p>
                    <p className="text-xl font-bold text-green-700">
                        {formatCurrency(data.totalOutstanding - (data.overdue30Plus || 0))}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">Not yet due</p>
                </div>

                <div className="bg-white rounded p-4 border border-yellow-200 bg-yellow-50">
                    <p className="text-gray-600 text-xs font-medium mb-2">30-60 DAYS</p>
                    <p className="text-xl font-bold text-yellow-700">
                        {formatCurrency(data.overdue30Plus - (data.overdue60Plus || 0) || 0)}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">Slightly overdue</p>
                </div>

                <div className="bg-white rounded p-4 border border-orange-200 bg-orange-50">
                    <p className="text-gray-600 text-xs font-medium mb-2">60-90 DAYS</p>
                    <p className="text-xl font-bold text-orange-700">
                        {formatCurrency(data.overdue60Plus - (data.overdue90Plus || 0) || 0)}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">Seriously overdue</p>
                </div>

                <div className="bg-white rounded p-4 border border-red-200 bg-red-50">
                    <p className="text-gray-600 text-xs font-medium mb-2">120+ DAYS</p>
                    <p className="text-xl font-bold text-red-700">
                        {formatCurrency(data.critical120Plus)}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">Severely overdue</p>
                </div>
            </div>

            {/* Trend indicator */}
            <div className="mt-6 pt-6 border-t border-gray-200 flex items-center justify-between">
                <div>
                    <p className="text-gray-600 text-sm">Month-on-month trend</p>
                    <p className="text-gray-900 font-medium text-lg">
                        {data.collectionTrend > 0 ? "+" : ""}{formatCurrency(data.collectionTrend)}
                    </p>
                </div>
                <div>
                    <TrendIcon
                        direction={
                            data.collectionTrend > 0
                                ? "down"
                                : data.collectionTrend < 0
                                  ? "up"
                                  : "neutral"
                        }
                    />
                </div>
            </div>
        </div>
    );
}

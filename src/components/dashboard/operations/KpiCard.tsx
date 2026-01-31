interface KpiCardProps {
    label: string;
    value: string | number;
    subtext?: string;
    trend?: "up" | "down" | "neutral";
}

export default function KpiCard({ label, value, subtext, trend }: KpiCardProps) {
    const trendColors = {
        up: "text-green-600",
        down: "text-red-600",
        neutral: "text-gray-500",
    };

    const trendColor = trend ? trendColors[trend] : "";

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                {label}
            </div>
            <div className={`text-3xl font-bold ${trendColor || "text-gray-900"}`}>
                {value}
            </div>
            {subtext && (
                <div className="text-xs text-gray-400 mt-1">{subtext}</div>
            )}
        </div>
    );
}

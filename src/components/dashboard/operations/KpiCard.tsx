interface KpiCardProps {
    label: string;
    value: string | number;
    subtext?: string;
    trend?: "up" | "down" | "neutral";
}

export default function KpiCard({ label, value, subtext, trend }: KpiCardProps) {
    const trendColors = {
        up: "text-emerald-500",
        down: "text-red-500",
        neutral: "text-[var(--nav-text-color)]",
    };

    const trendColor = trend ? trendColors[trend] : "";

    return (
        <div className="glass-card rounded-xl p-4">
            <div className="text-xs font-semibold text-[var(--nav-text-color)] uppercase tracking-wider mb-2">
                {label}
            </div>
            <div className={`text-3xl font-black ${trendColor || "text-[var(--foreground)]"}`}>
                {value}
            </div>
            {subtext && (
                <div className="text-xs text-[var(--nav-text-color)] mt-1 opacity-70">{subtext}</div>
            )}
        </div>
    );
}

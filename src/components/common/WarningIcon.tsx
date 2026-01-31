interface WarningIconProps {
    type?: "warning" | "info";
    tooltip: string;
    className?: string;
}

export default function WarningIcon({ type = "warning", tooltip, className = "" }: WarningIconProps) {
    const iconChar = type === "warning" ? "⚠️" : "ℹ️";
    // Adjust text color slightly for emoji visibility if needed, or keep generic
    // Emojis have their own colors, but we can wrap them in a span if we want specific sizing
    
    return (
        <div className={`group relative inline-flex items-center cursor-help ${className}`}>
            <span className="text-lg leading-none select-none filter saturate-150">{iconChar}</span>
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                <div className="bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg">
                    {tooltip}
                    {/* Arrow */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                </div>
            </div>
        </div>
    );
}

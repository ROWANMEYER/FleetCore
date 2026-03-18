import React from "react";

export function TrendIcon({ direction }: { direction: "up" | "down" | "neutral" }) {
    if (direction === "up") {
        return (
            <svg
                className="w-5 h-5 text-green-600"
                fill="currentColor"
                viewBox="0 0 20 20"
            >
                <path d="M3 10a1 1 0 011-1h12a1 1 0 011 1v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6zm14.707-9.293a1 1 0 00-1.414 0L10 7.586 5.707 3.293a1 1 0 00-1.414 1.414l5 5a1 1 0 001.414 0l5-5a1 1 0 000-1.414z" />
            </svg>
        );
    }
    if (direction === "down") {
        return (
            <svg
                className="w-5 h-5 text-red-600"
                fill="currentColor"
                viewBox="0 0 20 20"
            >
                <path d="M3 10a1 1 0 011-1h12a1 1 0 011 1v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6zM3 5a1 1 0 011-1h12a1 1 0 011 1v1a1 1 0 11-2 0V6H4v-1a1 1 0 011-1z" />
            </svg>
        );
    }
    return (
        <svg
            className="w-5 h-5 text-gray-400"
            fill="currentColor"
            viewBox="0 0 20 20"
        >
            <path d="M10 3a7 7 0 100 14 7 7 0 000-14zM2 10a8 8 0 1116 0 8 8 0 01-16 0z" />
        </svg>
    );
}
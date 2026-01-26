"use client";

import { useState, useRef, useEffect } from "react";

interface WorkspaceSplitProps {
    primary: React.ReactNode;
    secondary: React.ReactNode | null;
}

export default function WorkspaceSplit({
    primary,
    secondary,
}: WorkspaceSplitProps) {
    // Default: 60% primary, 40% secondary
    const [primaryWidth, setPrimaryWidth] = useState(60);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging || !containerRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const mouseX = e.clientX - containerRect.left;

        // Calculate new primary width as percentage
        let newPrimaryWidth = (mouseX / containerWidth) * 100;

        // Enforce minimum widths (30% each)
        if (newPrimaryWidth < 30) newPrimaryWidth = 30;
        if (newPrimaryWidth > 70) newPrimaryWidth = 70;

        setPrimaryWidth(newPrimaryWidth);
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Attach global mouse event listeners when dragging
    useEffect(() => {
        if (isDragging) {
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);

            // Prevent text selection during drag
            document.body.style.userSelect = "none";
            document.body.style.cursor = "col-resize";

            return () => {
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
                document.body.style.userSelect = "";
                document.body.style.cursor = "";
            };
        }
    }, [isDragging]);

    // If no secondary panel, render primary at 100%
    if (secondary === null) {
        return <div className="w-full h-full">{primary}</div>;
    }

    return (
        <div ref={containerRef} className="flex h-full w-full">
            {/* Primary Panel */}
            <div
                className="overflow-auto"
                style={{ width: `${primaryWidth}%` }}
            >
                {primary}
            </div>

            {/* Divider */}
            <div
                className="w-1 bg-gray-200 hover:bg-gray-400 cursor-col-resize flex-shrink-0 transition-colors"
                onMouseDown={handleMouseDown}
                role="separator"
                aria-orientation="vertical"
            />

            {/* Secondary Panel */}
            <div
                className="overflow-auto bg-gray-50"
                style={{ width: `${100 - primaryWidth}%` }}
            >
                {secondary}
            </div>
        </div>
    );
}

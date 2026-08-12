"use client";

import { LucideIcon } from "lucide-react";
import { FlipHint } from "@/src/components/admin/FlipHint";

/* ─── Big asset image placeholder (Admin → Trucks / Trailers) ───
   The main visual focus of the image-first card front: a large vehicle icon
   on a themed gradient panel with decorative rings, plus a caption overlay
   (registration / type / unit count) along the bottom edge.

   Designed so a real vehicle photo can slot in later without a layout
   change: swap the icon layer for a cover image and keep the caption. */

export function AssetImage({
  icon: Icon,
  gradient,
  label,
  sub,
}: {
  icon: LucideIcon;
  gradient: string;
  label?: string;
  sub?: string;
}) {
  return (
    <div className={`relative flex-1 min-h-[150px] overflow-hidden bg-gradient-to-br ${gradient}`}>
      {/* Discoverability hint — the card flips to its details panel */}
      <FlipHint />

      {/* Decorative rings for depth */}
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10" />
      <div className="absolute -bottom-14 -left-8 w-44 h-44 rounded-full bg-black/10" />

      <div className="absolute inset-0 flex items-center justify-center">
        <Icon className="w-24 h-24 sm:w-28 sm:h-28 text-white/25 drop-shadow-lg" strokeWidth={1.25} />
      </div>

      {(label || sub) && (
        <div className="absolute bottom-0 inset-x-0 px-3 pb-2 pt-6 bg-gradient-to-t from-black/45 to-transparent">
          {label && (
            <div className="text-xs font-bold text-white truncate drop-shadow">{label}</div>
          )}
          {sub && <div className="text-[10px] text-white/80 truncate drop-shadow">{sub}</div>}
        </div>
      )}
    </div>
  );
}

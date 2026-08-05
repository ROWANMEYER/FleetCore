"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ─── Swaps view toggle (mobile only) ─────────────────────────────
   The Swaps tab in the mobile bottom bar leads to either swap screen;
   this segmented control lets phone users flip between Swap History
   and Trailer Activity. Desktop keeps its own navigation, so this is
   hidden from md: up. */
const VIEWS = [
  { href: "/operations/swaps/history", label: "Swap History" },
  { href: "/operations/swaps/trailers", label: "Trailer Activity" },
] as const;

export function SwapsViewToggle() {
  const pathname = usePathname();

  return (
    <div className="md:hidden flex gap-1.5 px-6 py-2.5 border-b border-[var(--card-border)] bg-[var(--card-bg)]">
      {VIEWS.map(({ href, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 text-center rounded-full px-3 py-2 text-sm font-semibold transition-all ${
              active
                ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-sm"
                : "text-[var(--nav-text-color)] hover:text-[var(--foreground)] bg-[var(--card-bg)]/60 border border-[var(--card-border)]"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

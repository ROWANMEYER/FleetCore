"use client";

import { BarChart3 } from "lucide-react";
import { useAuth } from "@/src/components/auth/AuthProvider";

/**
 * Stub for future combined cross-region reporting.
 * Admin-only — see Navigation.tsx for the guarded link.
 */
export default function AllRegionsPage() {
  const { user } = useAuth();

  // Defense in depth: regional users should never land here, but if they do
  // (stale link/bookmark), show a friendly notice instead of data.
  const isAdmin = user?.role === "admin";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-[#06B6D4] to-[#0891B2] shadow-md shadow-[rgba(6,182,212,0.3)]">
            <BarChart3 size={22} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
              All Regions
            </h1>
            <p className="text-sm text-[var(--nav-text-color)] mt-0.5">
              Combined cross-region reporting
            </p>
          </div>
        </div>

        {isAdmin ? (
          <div className="glass-card rounded-xl p-10 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center mb-4">
              <BarChart3 size={24} className="text-[#06B6D4]" strokeWidth={2} />
            </div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              Combined cross-region reporting is coming soon
            </h2>
            <p className="text-sm text-[var(--nav-text-color)] mt-2 max-w-md mx-auto">
              This page will aggregate loads, revenue, and fleet performance
              across the Garden Route and Eastern Cape in one view.
            </p>
          </div>
        ) : (
          <div className="glass-card rounded-xl p-10 text-center">
            <p className="text-sm text-[var(--nav-text-color)]">
              This section is only available to administrators.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutGrid, ClipboardPlus, FileSpreadsheet, Shield, X, Menu } from "lucide-react";
import { useAuth } from "@/src/components/auth/AuthProvider";

const OPERATION_SCREENS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid, adminOnly: false },
  { href: "/operations/daily-planner/input", label: "Input", icon: ClipboardPlus, adminOnly: false },
  { href: "/admin", label: "Admin", icon: Shield, adminOnly: true },
  { href: "/operations/daily-planner/sheets", label: "Sheets", icon: FileSpreadsheet, adminOnly: false },
];

export function MobileOperationsMenu() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [operationsOpen, setOperationsOpen] = useState(false);

  useEffect(() => {
    if (!operationsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOperationsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [operationsOpen]);

  const publicSection = ["/calendar", "/operations/quick-message", "/operations/fuel", "/operations/phonebook"].includes(pathname);
  if (!user || publicSection) return null;

  return (
    <>
      {operationsOpen && createPortal(
        <div className="md:hidden fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close Operations" onClick={() => setOperationsOpen(false)} />
          <section id="mobile-operations" aria-label="Operations screens"
            className="absolute inset-x-3 top-16 rounded-2xl border border-[var(--sidebar-border)] bg-[var(--background)] p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-[var(--foreground)]">Operations</h2>
              <button type="button" onClick={() => setOperationsOpen(false)} aria-label="Close Operations"
                className="flex items-center justify-center w-11 h-11 rounded-lg text-[var(--nav-text-color)]"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {OPERATION_SCREENS.filter((screen) => !screen.adminOnly || user?.role === "admin").map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`) || (label === "Input" && pathname.startsWith("/operations/daily-planner/edit"));
                return <Link key={href} href={href} onClick={() => setOperationsOpen(false)} aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 min-h-14 rounded-xl border px-3 py-3 text-sm font-semibold ${active ? "border-[#06B6D4] bg-[#06B6D4]/15 text-[#06B6D4]" : "border-[var(--sidebar-border)] text-[var(--foreground)]"}`}>
                  <Icon size={20} />{label}
                </Link>;
              })}
            </div>
          </section>
        </div>, document.body
      )}
      <button type="button" aria-label="Operations screens" title="Operations screens" aria-expanded={operationsOpen} aria-controls="mobile-operations"
        onClick={() => setOperationsOpen((open) => !open)}
        className="grid h-11 w-9 shrink-0 place-items-center rounded-lg text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400">
        <Menu size={20} />
      </button>
    </>
  );
}

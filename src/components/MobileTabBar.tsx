"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutGrid, ClipboardPlus, FileSpreadsheet, Shield, Fuel, Cake, X, Send } from "lucide-react";
import { useAuth } from "@/src/components/auth/AuthProvider";

const OPERATION_SCREENS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid, adminOnly: false },
  { href: "/operations/daily-planner/input", label: "Input", icon: ClipboardPlus, adminOnly: false },
  { href: "/admin", label: "Admin", icon: Shield, adminOnly: true },
  { href: "/operations/daily-planner/sheets", label: "Sheets", icon: FileSpreadsheet, adminOnly: false },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [operationsOpen, setOperationsOpen] = useState(false);
  const fuelActive = pathname === "/operations/fuel" || pathname.startsWith("/operations/fuel/");
  const birthdaysActive = pathname === "/calendar" || pathname.startsWith("/calendar/");
  const quickSendActive = pathname === "/operations/quick-message" || pathname.startsWith("/operations/quick-message/");
  const operationsActive = !fuelActive && !birthdaysActive && !quickSendActive;

  useEffect(() => {
    if (!operationsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOperationsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [operationsOpen]);

  const tabClass = (active: boolean) => `flex-1 min-w-0 flex flex-col items-center justify-center gap-1 min-h-16 px-1 text-[10px] font-semibold transition-colors ${
    active ? "text-[#06B6D4] bg-[#06B6D4]/10" : "text-[var(--nav-text-color)]"
  }`;

  return (
    <>
      {operationsOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <button type="button" className="absolute inset-0 bg-[var(--background)]" aria-label="Close Operations" onClick={() => setOperationsOpen(false)} />
          <section id="mobile-operations" aria-label="Operations screens"
            className="absolute inset-x-3 rounded-2xl border border-[var(--sidebar-border)] bg-[var(--background)] p-4 shadow-xl"
            style={{ bottom: "calc(4rem + env(safe-area-inset-bottom) + 0.75rem)" }}>
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
        </div>
      )}
      <nav aria-label="Main phone navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-50 flex border-t border-[var(--sidebar-border)] bg-[var(--background)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <button type="button" className={tabClass(operationsActive || operationsOpen)} aria-expanded={operationsOpen} aria-controls="mobile-operations"
          onClick={() => setOperationsOpen((open) => !open)}>
          <LayoutGrid size={22} />Operations
        </button>
        <Link href="/operations/quick-message" onClick={() => setOperationsOpen(false)} className={tabClass(quickSendActive && !operationsOpen)} aria-current={quickSendActive ? "page" : undefined}>
          <Send size={22} />QuickSend
        </Link>
        <Link href="/operations/fuel" aria-label="Fuel composition" title="Fuel composition" onClick={() => setOperationsOpen(false)} className={tabClass(fuelActive && !operationsOpen)} aria-current={fuelActive ? "page" : undefined}>
          <Fuel size={22} />Fuel
        </Link>
        <Link href="/calendar" onClick={() => setOperationsOpen(false)} className={tabClass(birthdaysActive && !operationsOpen)} aria-current={birthdaysActive ? "page" : undefined}>
          <Cake size={22} />Birthdays
        </Link>
      </nav>
    </>
  );
}

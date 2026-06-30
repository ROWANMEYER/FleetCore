"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
        active ? "bg-black text-white dark:bg-white dark:text-black" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
      }`}
    >
      {label}
    </Link>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (path: string) => pathname.startsWith(path);

  return (
    <div className="flex-1 flex flex-col">
      <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-2 flex-shrink-0 overflow-x-auto dark:bg-slate-950/60 dark:border-slate-800 dark:backdrop-blur-sm">
        {/* Fleet Group */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-2 select-none dark:text-slate-400">
            Fleet
          </span>
          <NavLink href="/admin/trucks" label="Trucks" active={isActive("/admin/trucks")} />
          <NavLink href="/admin/trailers" label="Trailers" active={isActive("/admin/trailers")} />
          <NavLink href="/admin/drivers" label="Drivers" active={isActive("/admin/drivers")} />
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-gray-300 mx-3 dark:bg-slate-700"></div>

        {/* Finance Group */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-2 select-none dark:text-slate-400">
            Finance
          </span>
          <NavLink href="/admin/customers" label="Customers" active={isActive("/admin/customers")} />
          <NavLink href="/admin/age-analysis" label="Age Analysis" active={isActive("/admin/age-analysis")} />
          <NavLink href="/admin/payments" label="Payments" active={isActive("/admin/payments")} />
          <NavLink href="/admin/reconciliation" label="Reconciliation" active={isActive("/admin/reconciliation")} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto relative min-h-0">
        {children}
      </div>
    </div>
  );
}

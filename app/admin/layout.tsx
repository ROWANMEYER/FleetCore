"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (path: string) => pathname.startsWith(path);

  const NavLink = ({ href, label }: { href: string; label: string }) => (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
        isActive(href)
          ? "bg-black text-white"
          : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b px-6 py-2 flex items-center gap-2 flex-shrink-0 overflow-x-auto">
        {/* Fleet Group */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-2 select-none">
            Fleet
          </span>
          <NavLink href="/admin/trucks" label="Trucks" />
          <NavLink href="/admin/trailers" label="Trailers" />
          <NavLink href="/admin/drivers" label="Drivers" />
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-gray-300 mx-3"></div>

        {/* Finance Group */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-2 select-none">
            Finance
          </span>
          <NavLink href="/admin/customers" label="Customers" />
          <NavLink href="/admin/age-analysis" label="Age Analysis" />
          <NavLink href="/admin/payments" label="Payments" />
          <NavLink href="/admin/reconciliation" label="Reconciliation" />
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {children}
      </div>
    </div>
  );
}

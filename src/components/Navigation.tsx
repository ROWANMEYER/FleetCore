"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navigation() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  return (
    <nav className="bg-black text-white h-16 flex items-center px-6">
      <div className="w-full flex items-center justify-between">
        <div className="font-bold text-xl tracking-tight">FleetCore</div>

        <div className="flex gap-6 text-sm font-medium">
          <Link
            href="/dashboard"
            className={`hover:text-gray-300 transition-colors ${isActive('/dashboard') ? 'text-white border-b-2 border-white pb-1' : 'text-gray-400'}`}
          >
            Dashboards
          </Link>

          <Link
            href="/operations"
            className={`hover:text-gray-300 transition-colors ${isActive('/operations') ? 'text-white border-b-2 border-white pb-1' : 'text-gray-400'}`}
          >
            Operations
          </Link>

          <Link
            href="/admin"
            className={`hover:text-gray-300 transition-colors ${isActive('/admin') ? 'text-white border-b-2 border-white pb-1' : 'text-gray-400'}`}
          >
            Admin
          </Link>

          <Link
            href="/settings"
            className={`hover:text-gray-300 transition-colors ${isActive('/settings') ? 'text-white border-b-2 border-white pb-1' : 'text-gray-400'}`}
          >
            Settings
          </Link>
        </div>
      </div>
    </nav>
  );
}

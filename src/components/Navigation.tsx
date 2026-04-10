"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/src/components/ThemeToggle";

export default function Navigation() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  return (
    <nav className="bg-black/95 dark:bg-black text-white h-16 flex items-center px-6 relative z-50 shadow-lg border-b border-white/10 backdrop-blur-sm">
      <div className="w-full flex items-center justify-between">
        <div className="font-bold text-xl tracking-tight">FleetCore</div>

        <div className="flex items-center gap-6 text-sm font-medium">
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

          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}

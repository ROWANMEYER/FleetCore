"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  const isActive = (path: string) => pathname.startsWith(path);

  return (
    <div className="flex-1 flex flex-col">
      <div className="bg-white border-b border-gray-200 dark:bg-slate-950/60 dark:border-slate-800 dark:backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 py-2">
          <button
            onClick={() => setNavOpen(!navOpen)}
            className="md:hidden p-1 rounded hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300"
            aria-label="Toggle navigation"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              {navOpen ? (
                <>
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="6" y1="18" x2="18" y2="6" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>

          {/* Mobile: collapsible dropdown */}
          {navOpen && (
            <div className="absolute top-full left-0 right-0 bg-white dark:bg-slate-950 border-b border-gray-200 dark:border-slate-800 shadow-lg p-4 flex flex-col gap-1 md:hidden z-40">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 dark:text-slate-400">
                Fleet
              </span>
              <NavLink href="/admin/trucks" label="Trucks" active={isActive("/admin/trucks")} />
              <NavLink href="/admin/trailers" label="Trailers" active={isActive("/admin/trailers")} />
              <NavLink href="/admin/drivers" label="Drivers" active={isActive("/admin/drivers")} />
            </div>
          )}

          {/* Desktop: horizontal nav */}
          <div className="hidden md:flex items-center gap-2 overflow-x-auto flex-shrink-0">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-2 select-none dark:text-slate-400">
              Fleet
            </span>
            <NavLink href="/admin/trucks" label="Trucks" active={isActive("/admin/trucks")} />
            <NavLink href="/admin/trailers" label="Trailers" active={isActive("/admin/trailers")} />
            <NavLink href="/admin/drivers" label="Drivers" active={isActive("/admin/drivers")} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto relative min-h-0">
        {children}
      </div>
    </div>
  );
}

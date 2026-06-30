"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (path: string) => pathname.startsWith(path);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="border-b px-6 py-2 flex gap-2 flex-shrink-0 bg-white border-gray-200 dark:bg-slate-950/60 dark:border-slate-800 dark:backdrop-blur-sm">
        <Link
          href="/operations/daily-planner/input"
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isActive("/operations/daily-planner")
              ? "bg-black text-white dark:bg-white dark:text-black"
              : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
          }`}
        >
          Daily Planner
        </Link>

        <Link
          href="/operations/quicksend"
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isActive("/operations/quicksend")
              ? "bg-black text-white dark:bg-white dark:text-black"
              : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
          }`}
        >
          QuickSend
        </Link>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        {children}
      </div>
    </div>
  );
}

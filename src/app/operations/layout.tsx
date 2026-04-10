"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    // Read theme from DOM — avoids useTheme() hydration mismatch
    const check = () => setIsLight(!document.documentElement.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const isActive = (path: string) => pathname.startsWith(path);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className={`border-b px-6 py-2 flex gap-2 flex-shrink-0 ${
        isLight
          ? "bg-white border-gray-200"
          : "bg-gray-900/80 border-white/10 backdrop-blur-sm"
      }`}>
        <Link
          href="/operations/daily-planner/input"
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isActive("/operations/daily-planner")
              ? "bg-black text-white"
              : isLight ? "text-gray-600 hover:bg-gray-100" : "text-gray-300 hover:bg-white/10"
          }`}
        >
          Daily Planner
        </Link>

        <Link
          href="/operations/quicksend"
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            isActive("/operations/quicksend")
              ? "bg-black text-white"
              : isLight ? "text-gray-600 hover:bg-gray-100" : "text-gray-300 hover:bg-white/10"
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

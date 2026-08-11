"use client";

import Link from"next/link";
import { usePathname} from"next/navigation";

function NavLink({ href, label, active}: { href: string; label: string; active: boolean}) {
 return (
 <Link
 href={href}
 className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
 active ?"nav-item-active text-white" :"text-[var(--nav-text-color)] hover:bg-[var(--card-bg)]"
}`}
 >
 {label}
 </Link>
);
}

export default function AdminLayout({ children}: { children: React.ReactNode}) {
 const pathname = usePathname();

 const isActive = (path: string) => pathname.startsWith(path);

 return (
 <div className="flex-1 flex flex-col">
 {/* Desktop-only section nav — the mobile Admin tab links straight to the
     /admin hub cards, so the hamburger bar was removed on phones. */}
 <div className="hidden md:block bg-[var(--card-bg)] border-b border-[var(--card-border)]">
 <div className="flex items-center gap-2 overflow-x-auto flex-shrink-0 px-6 py-2">
 <span className="text-[10px] font-bold text-[var(--nav-text-color)] uppercase tracking-wider mr-2 select-none">
 Fleet
 </span>
 <NavLink href="/admin/trucks" label="Trucks" active={isActive("/admin/trucks")} />
 <NavLink href="/admin/trailers" label="Trailers" active={isActive("/admin/trailers")} />
 <NavLink href="/admin/drivers" label="Drivers" active={isActive("/admin/drivers")} />
 <div className="w-px h-5 bg-[var(--card-border)] mx-2" />
 <span className="text-[10px] font-bold text-[var(--nav-text-color)] uppercase tracking-wider mr-2 select-none">
 Services
 </span>
 <NavLink href="/admin/subcontractors" label="Subcontractors" active={isActive("/admin/subcontractors")} />
 <div className="w-px h-5 bg-[var(--card-border)] mx-2" />
 <span className="text-[10px] font-bold text-[var(--nav-text-color)] uppercase tracking-wider mr-2 select-none">
 Access
 </span>
 <NavLink href="/admin/users" label="Users" active={isActive("/admin/users")} />
 </div>
 </div>

 <div className="flex-1 overflow-y-auto relative min-h-0">
 {children}
 </div>
 </div>
);
}

import Link from "next/link";
import { Truck, Users, Loader, Building2, Upload } from "lucide-react";

export default function AdminPage() {
  const cards = [
    {
      href: "/admin/trucks",
      title: "Trucks",
      description: "Manage fleet trucks",
      icon: Truck,
    },
    {
      href: "/admin/drivers",
      title: "Drivers",
      description: "Manage drivers (Active/Inactive)",
      icon: Users,
    },
    {
      href: "/admin/trailers",
      title: "Trailers",
      description: "Manage fleet trailers",
      icon: Loader,
    },
    {
      href: "/admin/subcontractors",
      title: "Subcontractors",
      description: "Manage subcontractor companies and their details",
      icon: Building2,
    },
    {
      href: "/admin/fleet-import",
      title: "Fleet Import",
      description: "Bulk-import Trucks, Trailers and Drivers from Excel",
      icon: Upload,
    },
  ];

  return (
    <div className="p-8 h-full overflow-y-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-black tracking-tight text-[var(--foreground)]">Admin</h1>
        <p className="text-sm mt-1 text-[var(--nav-text-color)]">Manage fleet data and configuration</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="group glass-card-premium p-6 flex flex-col gap-3 cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#06B6D4] to-[#0891B2] shadow-lg shadow-[rgba(6,182,212,0.3)] shrink-0">
                <Icon size={20} className="text-white" strokeWidth={2} />
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--foreground)]">{card.title}</h2>
                <p className="text-xs mt-1 text-[var(--nav-text-color)]">
                  {card.description}
                </p>
              </div>
              <span className="text-xs font-semibold text-[#06B6D4]">
                Open →
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Phone, Search, UserRound } from "lucide-react";

type MockNumber = { label: string; value: string; whatsapp?: boolean };
type MockDriver = { name: string; fleetId: string; initials: string; colour: string; numbers: MockNumber[] };

// UI-only phonebook mockups. These are intentionally not connected to live
// driver data until the card layout and number-label model are approved.
const MOCK_DRIVERS: MockDriver[] = [
  {
    name: "Aiden Jacobs", fleetId: "DRV-001", initials: "AJ", colour: "#0e7490",
    numbers: [
      { label: "Primary", value: "071 000 1001", whatsapp: true },
      { label: "Emergency", value: "082 000 1001" },
    ],
  },
  {
    name: "Lerato Mokoena", fleetId: "DRV-014", initials: "LM", colour: "#7c3aed",
    numbers: [
      { label: "Work", value: "072 000 1014", whatsapp: true },
      { label: "Personal", value: "083 000 1014" },
      { label: "Home", value: "011 000 1014" },
    ],
  },
  {
    name: "Sipho Dlamini", fleetId: "DRV-027", initials: "SD", colour: "#15803d",
    numbers: [
      { label: "Primary", value: "073 000 1027", whatsapp: true },
      { label: "Dispatch", value: "084 000 1027" },
    ],
  },
  {
    name: "Nomsa Ndlovu", fleetId: "DRV-033", initials: "NN", colour: "#c2410c",
    numbers: [
      { label: "Primary", value: "074 000 1033", whatsapp: true },
      { label: "Home", value: "035 000 1033" },
    ],
  },
  {
    name: "Thabo Maseko", fleetId: "DRV-041", initials: "TM", colour: "#be123c",
    numbers: [
      { label: "Primary", value: "075 000 1041", whatsapp: true },
      { label: "Emergency", value: "085 000 1041" },
      { label: "Dispatch", value: "086 000 1041" },
    ],
  },
];

function phoneHref(value: string) {
  return `tel:${value.replace(/\s/g, "")}`;
}

function whatsappHref(value: string) {
  const digits = value.replace(/\D/g, "");
  return `https://wa.me/27${digits.replace(/^0/, "")}`;
}

export default function DriverPhonebookPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) router.replace("/dashboard");
  }, [router]);

  const filteredDrivers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return MOCK_DRIVERS;
    return MOCK_DRIVERS.filter((driver) =>
      [driver.name, driver.fleetId, ...driver.numbers.map((number) => `${number.label} ${number.value}`)]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [search]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-8 pt-5 md:px-8 md:pt-8">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#06B6D4]">Operations</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-[var(--foreground)]">Driver phonebook</h1>
          <p className="mt-1 text-sm text-[var(--nav-text-color)]">Five mobile card mockups for review</p>
        </div>
        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">Mockups</span>
      </div>

      <label className="relative mb-5 block">
        <span className="sr-only">Search drivers</span>
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nav-text-color)]" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, fleet ID or number"
          className="h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] pl-10 pr-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/20"
        />
      </label>

      <div className="space-y-3">
        {filteredDrivers.map((driver) => (
          <article key={driver.fleetId} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-sm font-black text-white" style={{ backgroundColor: driver.colour }}>
                {driver.initials}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-bold text-[var(--foreground)]">{driver.name}</h2>
                <p className="text-xs text-[var(--nav-text-color)]">{driver.fleetId} · Active driver</p>
              </div>
              <UserRound size={17} className="text-[var(--nav-text-color)]" aria-hidden="true" />
            </div>

            <div className="mt-4 space-y-2 border-t border-[var(--card-border)] pt-3">
              {driver.numbers.map((number) => (
                <div key={`${driver.fleetId}-${number.label}`} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-wide text-[var(--nav-text-color)]">{number.label}</span>
                  <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--foreground)]">{number.value}</span>
                  <a href={phoneHref(number.value)} aria-label={`Call ${driver.name} on ${number.label}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#06B6D4]/10 text-[#06B6D4] transition hover:bg-[#06B6D4]/20">
                    <Phone size={16} />
                  </a>
                  {number.whatsapp && (
                    <a href={whatsappHref(number.value)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${driver.name}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-400 transition hover:bg-emerald-500/20">
                      <MessageCircle size={16} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      {filteredDrivers.length === 0 && <p className="rounded-xl border border-dashed border-[var(--card-border)] p-6 text-center text-sm text-[var(--nav-text-color)]">No mock drivers match that search.</p>}
    </main>
  );
}

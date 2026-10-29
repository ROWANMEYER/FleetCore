"use client";

import Image from "next/image";
import Link from "next/link";
import { BarChart3, Cake, Fuel, LockKeyhole, Phone, Send } from "lucide-react";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { InstallAppButton } from "@/src/components/InstallAppButton";

const TABS = [
  { href: "/operations/quick-message", label: "QuickSend", description: "Send a quick message", icon: Send },
  { href: "/operations/fuel", label: "Fuel", description: "Compare fuel prices", icon: Fuel },
  { href: "/operations/phonebook", label: "Phonebook", description: "Find driver contact numbers", icon: Phone },
  { href: "/calendar", label: "Birthdays", description: "Celebrate your people", icon: Cake },
] as const;

export default function StartPage() {
  const { user } = useAuth();
  return (
    <main className="relative isolate flex min-h-dvh w-full shrink-0 flex-col items-center justify-center overflow-hidden px-5 py-6 text-white">
      <Image
        src="/images/splash/fleetcore-road-map.webp"
        alt=""
        fill
        priority
        unoptimized
        sizes="100vw"
        className="-z-30 object-cover"
      />
      <div className="absolute inset-0 -z-20 bg-[linear-gradient(180deg,rgba(3,18,35,0.18)_15%,rgba(3,18,35,0.55)_58%,rgba(3,12,23,0.92)_100%)]" />
      <div className="absolute inset-0 -z-10 opacity-50" aria-hidden="true">
        <svg viewBox="0 0 853 1844" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
          <circle cx="158" cy="120" r="11" fill="#22d3ee" />
          <circle cx="401" cy="266" r="11" fill="#22d3ee" />
          <circle cx="725" cy="445" r="11" fill="#22d3ee" />
        </svg>
      </div>

      <section className="w-full max-w-sm text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-[25%] bg-gradient-to-br from-[#06B6D4] to-[#0561A4] shadow-2xl shadow-cyan-950/50">
          <BarChart3 size={42} strokeWidth={2.5} />
        </div>
        <h1 className="mt-5 text-4xl font-black tracking-tight">FleetCore</h1>
        <p className="mt-2 text-xs uppercase tracking-[0.24em] text-cyan-50/85">People. Freight. Solutions.</p>

        <div className="mt-6 space-y-3 text-left">
          <p className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-50/70">Choose a tab</p>
          <Link
            href={user ? "/dashboard" : "/login"}
            className="flex min-h-16 items-center gap-4 rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 shadow-lg backdrop-blur-md transition-colors hover:bg-slate-950/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-400/15 text-cyan-200"><LockKeyhole size={20} /></span>
            <span><strong className="block text-sm">Operations</strong><span className="text-xs text-cyan-50/70">{user ? "Open fleet operations" : "Sign in to continue"}</span></span>
          </Link>
          <InstallAppButton variant="card" />
          {TABS.map(({ href, label, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-16 items-center gap-4 rounded-2xl border border-white/15 bg-slate-950/45 px-4 py-3 shadow-lg backdrop-blur-md transition-colors hover:bg-slate-950/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-400/15 text-cyan-200"><Icon size={20} /></span>
              <span><strong className="block text-sm">{label}</strong><span className="text-xs text-cyan-50/70">{description}</span></span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

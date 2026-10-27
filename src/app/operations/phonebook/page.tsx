"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, usePaginatedQuery } from "convex/react";
import { MessageCircle, Pencil, Phone, Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { DriverThumb } from "@/src/components/admin/DriverAvatar";
import { DriverPhoneFields } from "@/src/components/admin/DriverPhoneFields";
import { cleanAdditionalPhones, isDialablePhone, phoneDigits, type DriverPhoneNumber } from "@/src/lib/driverPhones";

type EditingNumbers = { driverId: Id<"drivers">; phone: string; additionalPhones: DriverPhoneNumber[] };

export default function DriverPhonebookPage() {
  const router = useRouter();
  const { token, user } = useAuth();
  const { results: drivers, status, loadMore } = usePaginatedQuery(api.driverPhonebook.list, {}, { initialNumItems: 100 });
  const saveNumbers = useMutation(api.driverPhonebook.saveNumbers);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EditingNumbers | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) router.replace("/dashboard");
  }, [router]);

  const query = search.trim().toLowerCase();
  const digits = query.replace(/\D/g, "");
  const filtered = drivers.filter(driver =>
    !query || [driver.name, ...driver.numbers.map(n => n.label + " " + n.number)].join(" ").toLowerCase().includes(query) ||
    (digits.length >= 3 && driver.numbers.some(n => phoneDigits(n.number).includes(digits)))
  );

  const save = async () => {
    if (!editing || !token) return;
    setError("");
    setBusy(true);
    try {
      const additionalPhones = cleanAdditionalPhones(editing.phone, editing.additionalPhones);
      await saveNumbers({ ...editing, additionalPhones, token });
      setEditing(null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not save phone numbers.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto h-full w-full max-w-2xl overflow-y-auto px-4 pb-8 pt-5 md:px-8 md:pt-8">
      <div className="mb-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-500">Contacts</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-[var(--foreground)]">Driver phonebook</h1>
        <p className="mt-1 text-sm text-[var(--nav-text-color)]">Your active drivers and contact numbers</p>
      </div>
      <label className="relative mb-5 block">
        <span className="sr-only">Search drivers</span>
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nav-text-color)]" />
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or phone number"
          className="h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] pl-10 pr-3 text-sm text-[var(--foreground)] outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20" />
      </label>

      {status === "LoadingFirstPage" ? <p role="status" className="py-8 text-center text-sm text-[var(--nav-text-color)]">Loading drivers…</p> : (
        <div className="space-y-3">
          {filtered.map(driver => (
            <article key={driver._id} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <DriverThumb name={driver.name} photoUrl={driver.photoUrl || undefined} photoOriginalUrl={driver.photoOriginalUrl || undefined} size={56} />
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-base font-bold text-[var(--foreground)]">{driver.name}</h2>
                  <p className="text-xs text-[var(--nav-text-color)]">Active driver</p>
                </div>
                {user && token && (
                  <button type="button" disabled={busy} aria-label={"Edit phone numbers for " + driver.name}
                    onClick={() => { setError(""); setEditing({ driverId: driver._id, phone: driver.phone, additionalPhones: driver.additionalPhones.map(n => ({ ...n })) }); }}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-cyan-500 disabled:opacity-50"><Pencil size={18} /></button>
                )}
              </div>
              {editing?.driverId === driver._id ? (
                <div className="mt-4 space-y-3 border-t border-[var(--card-border)] pt-3">
                  <DriverPhoneFields phone={editing.phone} onPhoneChange={phone => setEditing({ ...editing, phone })}
                    additionalPhones={editing.additionalPhones} onAdditionalPhonesChange={additionalPhones => setEditing({ ...editing, additionalPhones })} disabled={busy} />
                  {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => void save()} className="min-h-11 rounded-lg bg-cyan-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save numbers"}</button>
                    <button type="button" disabled={busy} onClick={() => { setEditing(null); setError(""); }} className="min-h-11 rounded-lg border border-[var(--card-border)] px-4 text-sm text-[var(--foreground)]">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-2 border-t border-[var(--card-border)] pt-3">
                  {driver.numbers.length === 0 && <p className="text-sm text-[var(--nav-text-color)]">No phone number recorded</p>}
                  {driver.numbers.map((number, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--nav-text-color)]">{number.label}</p>
                        <p className="break-words text-sm font-semibold text-[var(--foreground)]">{number.number}</p>
                      </div>
                      {isDialablePhone(number.number) && <>
                        <a href={"tel:+" + phoneDigits(number.number)} aria-label={"Call " + driver.name + " on " + number.label}
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-cyan-500/10 text-cyan-500"><Phone size={18} /></a>
                        {number.whatsapp && <a href={"https://wa.me/" + phoneDigits(number.number)} target="_blank" rel="noopener noreferrer" aria-label={"WhatsApp " + driver.name + " on " + number.label}
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-500"><MessageCircle size={18} /></a>}
                      </>}
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {status !== "LoadingFirstPage" && filtered.length === 0 && <p className="rounded-xl border border-dashed border-[var(--card-border)] p-6 text-center text-sm text-[var(--nav-text-color)]">{query ? "No matching drivers in the loaded contacts." : "No active drivers found."}</p>}
      {status === "CanLoadMore" && <button type="button" onClick={() => loadMore(100)} className="mt-4 min-h-11 w-full rounded-xl border border-[var(--card-border)] text-sm font-semibold text-cyan-500">Load more drivers</button>}
      {status === "LoadingMore" && <p role="status" className="py-4 text-center text-sm text-[var(--nav-text-color)]">Loading more drivers…</p>}
    </main>
  );
}

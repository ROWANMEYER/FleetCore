"use client";

import { useId } from "react";
import { Plus, X } from "lucide-react";
import { MAX_ADDITIONAL_PHONES, type DriverPhoneNumber } from "@/src/lib/driverPhones";

export function DriverPhoneFields({ phone, onPhoneChange, additionalPhones, onAdditionalPhonesChange, disabled = false }: {
  phone: string;
  onPhoneChange: (value: string) => void;
  additionalPhones: DriverPhoneNumber[];
  onAdditionalPhonesChange: (values: DriverPhoneNumber[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const update = (index: number, patch: Partial<DriverPhoneNumber>) =>
    onAdditionalPhonesChange(additionalPhones.map((value, at) => at === index ? { ...value, ...patch } : value));
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <legend className="mb-2 text-xs font-semibold text-[var(--foreground)]">Phone numbers</legend>
      <label htmlFor={`${id}-primary`} className="block text-xs text-[var(--nav-text-color)]">Primary number</label>
      <input id={`${id}-primary`} type="tel" autoComplete="tel" value={phone} onChange={event => onPhoneChange(event.target.value)}
        placeholder="Primary phone number" className="settings-input w-full rounded-lg px-3 py-2 text-sm" />
      {additionalPhones.map((value, index) => (
        <div key={index} className="space-y-2 rounded-xl border border-[var(--card-border)] p-3">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`${id}-label-${index}`} className="text-xs text-[var(--nav-text-color)]">Additional number {index + 1}</label>
            <button type="button" onClick={() => onAdditionalPhonesChange(additionalPhones.filter((_, at) => at !== index))}
              aria-label={`Remove additional number ${index + 1}`} className="grid h-9 w-9 place-items-center rounded-lg text-[var(--nav-text-color)] hover:bg-[var(--card-border)]"><X size={16} /></button>
          </div>
          <input id={`${id}-label-${index}`} value={value.label} maxLength={32} placeholder="Label, e.g. Work or Personal"
            onChange={event => update(index, { label: event.target.value })} className="settings-input w-full rounded-lg px-3 py-2 text-sm" />
          <input type="tel" aria-label={`Additional phone number ${index + 1}`} value={value.number} placeholder="Phone number"
            onChange={event => update(index, { number: event.target.value })} className="settings-input w-full rounded-lg px-3 py-2 text-sm" />
          <label className="flex min-h-9 items-center gap-2 text-xs text-[var(--nav-text-color)]">
            <input type="checkbox" checked={value.whatsapp} onChange={event => update(index, { whatsapp: event.target.checked })} />WhatsApp available
          </label>
        </div>
      ))}
      <button type="button" disabled={additionalPhones.length >= MAX_ADDITIONAL_PHONES}
        onClick={() => onAdditionalPhonesChange([...additionalPhones, { label: "Mobile", number: "", whatsapp: true }])}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--card-border)] px-3 text-xs font-semibold text-cyan-500 disabled:opacity-50">
        <Plus size={16} />Add another number
      </button>
    </fieldset>
  );
}

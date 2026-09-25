"use client";

import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { type Doc } from "@/convex/_generated/dataModel";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { ModalShell } from "@/src/components/common/ModalShell";
import { useToast } from "@/src/components/common/Toast";
import { X } from "lucide-react";

type ClientFormDialogProps = {
  open: boolean;
  editing: Doc<"customers"> | null;
  onClose: () => void;
};

const EMPTY_FORM = {
  name: "",
  accountNumber: "",
  vatNumber: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  note: "",
};

export default function ClientFormDialog({
  open,
  editing,
  onClose,
}: ClientFormDialogProps) {
  const { token } = useAuth();
  const { addToast } = useToast();
  const createCustomer = useMutation(api.customers.createCustomer);
  const updateCustomer = useMutation(api.customers.updateCustomer);

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        editing
          ? {
              name: editing.name,
              accountNumber: editing.accountNumber ?? "",
              vatNumber: editing.vatNumber ?? "",
              contactPerson: editing.contactPerson ?? "",
              phone: editing.phone ?? "",
              email: editing.email ?? "",
              address: editing.address ?? "",
              note: editing.note ?? "",
            }
          : EMPTY_FORM
      );
    }
  }, [open, editing]);

  const setField = (field: keyof typeof EMPTY_FORM) => (value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!token || saving) return;
    const name = form.name.trim();
    if (!name) {
      addToast("Client name is required", "error");
      return;
    }
    setSaving(true);
    try {
      const args = {
        name,
        accountNumber: form.accountNumber.trim() || undefined,
        vatNumber: form.vatNumber.trim() || undefined,
        contactPerson: form.contactPerson.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        note: form.note.trim() || undefined,
        token,
      };
      if (editing) {
        await updateCustomer({ ...args, id: editing._id });
        addToast("Client updated", "success");
      } else {
        await createCustomer(args);
        addToast("Client added", "success");
      }
      onClose();
    } catch (e) {
      addToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell open={open} onClose={() => !saving && onClose()}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-[var(--foreground)]">
            {editing ? "Edit Client" : "Add Client"}
          </h3>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1 rounded hover:bg-[var(--card-bg)] text-[var(--nav-text-color)] disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">
              Client Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField("name")(e.target.value)}
              disabled={saving}
              placeholder="Client name"
              className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--nav-text-color)] outline-none transition-all focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">
              Account Number
            </label>
            <input
              type="text"
              value={form.accountNumber}
              onChange={(e) => setField("accountNumber")(e.target.value)}
              disabled={saving}
              placeholder="ACC-001"
              className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--nav-text-color)] outline-none transition-all focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">
              VAT Number
            </label>
            <input
              type="text"
              value={form.vatNumber}
              onChange={(e) => setField("vatNumber")(e.target.value)}
              disabled={saving}
              placeholder="4123456789"
              className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--nav-text-color)] outline-none transition-all focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">
              Contact Person
            </label>
            <input
              type="text"
              value={form.contactPerson}
              onChange={(e) => setField("contactPerson")(e.target.value)}
              disabled={saving}
              placeholder="Jane Doe"
              className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--nav-text-color)] outline-none transition-all focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">
              Phone
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setField("phone")(e.target.value)}
              disabled={saving}
              placeholder="082 000 0000"
              className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--nav-text-color)] outline-none transition-all focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 disabled:opacity-60"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setField("email")(e.target.value)}
              disabled={saving}
              placeholder="name@company.co.za"
              className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--nav-text-color)] outline-none transition-all focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 disabled:opacity-60"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">
              Address
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setField("address")(e.target.value)}
              disabled={saving}
              placeholder="Street, City"
              className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--nav-text-color)] outline-none transition-all focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 disabled:opacity-60"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">
              Notes
            </label>
            <textarea
              value={form.note}
              onChange={(e) => setField("note")(e.target.value)}
              disabled={saving}
              rows={3}
              placeholder="Delivery instructions, hours, contacts..."
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--nav-text-color)] outline-none transition-all focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 disabled:opacity-60 resize-y"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-[var(--foreground)] bg-[var(--card-bg)] border border-[var(--card-border)] hover:opacity-80 rounded-md transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] hover:opacity-90 rounded-md shadow-sm transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : editing ? "Save changes" : "Add Client"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
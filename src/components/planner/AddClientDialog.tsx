"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { type Doc } from "@/convex/_generated/dataModel";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { findMatchingCustomer } from "@/src/lib/planner/clientAdd";

type AddClientDialogProps = {
  proposedName: string;
  rawToken: string;
  customers: Doc<"customers">[] | undefined;
  onClose: () => void;
};

/* 6.4A — create a missing customer from the Quick Capture review, reusing the
   existing customers.createCustomer mutation. The customer table remains the
   single authoritative source; the dialog only protects against duplicates and
   inactive reuse before the mutation runs (the backend remains authoritative
   for account-number conflicts). */
export default function AddClientDialog({
  proposedName,
  rawToken,
  customers,
  onClose,
}: AddClientDialogProps) {
  const [name, setName] = useState(proposedName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuth();
  const createCustomer = useMutation(api.customers.createCustomer);

  const existing = useMemo(
    () => (customers ? findMatchingCustomer(name, customers) : null),
    [customers, name]
  );
  const existingActive = existing?.isActive;
  const existingInactive = existing && !existing.isActive;

  const canSubmit =
    name.trim().length > 0 && !isSubmitting && !existingActive && !existingInactive;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isSubmitting]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    createCustomer({ name: name.trim(), token })
      .then(() => onClose())
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to add client";
        setError(msg);
        setIsSubmitting(false);
      });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--background)] rounded-xl shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]">
            <div>
              <h3 className="text-base font-bold text-[var(--foreground)]">
                Add Client
              </h3>
              <p className="text-xs text-[var(--nav-text-color)] mt-0.5 truncate">
                {rawToken}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-[var(--nav-text-color)] hover:text-[var(--foreground)] p-1"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <div>
              <label htmlFor="client-name" className="text-xs font-bold text-[var(--foreground)] mb-1.5 block">
                Client Name
              </label>
              <input
                id="client-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                disabled={isSubmitting}
                placeholder="Client name"
                className="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)]/60 shadow-sm focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 focus:outline-none text-sm text-[var(--foreground)] transition-colors disabled:opacity-60"
              />
              <p className="text-[10px] text-[var(--nav-text-color)] mt-1.5">
                Quick Capture will recognise this client by its name. No alias
                storage exists in the customer model yet (6.4B scope).
              </p>
            </div>

            {existingActive && (
              <div className="text-xs text-[var(--warning-text)] bg-[var(--warning-surface)] border border-[var(--warning-border)] px-3 py-2 rounded-lg">
                “{existing.name}” already exists and is active — no duplicate
                will be created.
              </div>
            )}
            {existingInactive && (
              <div className="text-xs text-[var(--danger-text)] bg-[var(--danger-surface)] border border-[var(--danger-border)] px-3 py-2 rounded-lg">
                “{existing.name}” already exists but is inactive. Reactivation is
                not part of this stage — no duplicate will be created.
              </div>
            )}

            {error && (
              <div className="text-xs text-[var(--danger-text)] bg-[var(--danger-surface)] border border-[var(--danger-border)] px-3 py-2 rounded-lg">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--card-border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-[var(--nav-text-color)] hover:text-[var(--foreground)] rounded-lg hover:bg-[var(--card-bg)] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] rounded-lg shadow-md shadow-[rgba(6,182,212,0.2)] hover:opacity-90 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed transition-all"
            >
              {isSubmitting ? "Saving..." : "Add Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
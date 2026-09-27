"use client";

import type { ReactNode } from "react";

import { ModalShell } from "./ModalShell";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  loading?: boolean;
  /** Keeps the confirm button unclickable, e.g. until a typed confirmation word matches. */
  confirmDisabled?: boolean;
  /** Focus the first control in the dialog on open, for dialogs whose whole job is typing something. */
  autoFocus?: boolean;
  /** Rendered between the message and the buttons — the slot for a confirmation field. */
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  loading = false,
  confirmDisabled = false,
  autoFocus = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <ModalShell open={open} onClose={onCancel} autoFocus={autoFocus}>
      <div className="p-6">
        <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">{title}</h3>
        <p className={`text-sm text-[var(--nav-text-color)] whitespace-pre-line ${children ? "mb-4" : "mb-6"}`}>
          {message}
        </p>
        {children}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-[var(--foreground)] bg-[var(--card-bg)] border border-[var(--card-border)] hover:opacity-80 rounded-md transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || confirmDisabled}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm transition-colors disabled:opacity-50 ${
              variant === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] hover:opacity-90"
            }`}
          >
            {loading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

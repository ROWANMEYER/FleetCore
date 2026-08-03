"use client";

import { ReactNode, useEffect, useRef } from "react";

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function ModalShell({ open, onClose, children, className = "" }: ModalShellProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousActiveElement.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    setTimeout(() => modalRef.current?.focus(), 0);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`bg-[var(--card-bg)] rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

export function SlideInPanel({ open, onClose, children, className = "" }: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousActiveElement.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="min-w-[20%] flex-1 bg-black/60 cursor-pointer" onClick={onClose} />
      <div
        ref={panelRef}
        className={`w-full max-w-[600px] sm:w-[600px] bg-[var(--card-bg)] shadow-2xl border-l border-[var(--card-border)] h-full overflow-y-auto ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

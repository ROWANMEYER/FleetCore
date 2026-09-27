"use client";

import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ModalShell } from "./common/ModalShell";
import { useToast } from "./common/Toast";

interface EmailReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSubject: string;
  onSend: (recipientIds: Id<"recipients">[], subject: string) => Promise<void>;
}

export default function EmailReportModal({
  isOpen,
  onClose,
  initialSubject,
  onSend,
}: EmailReportModalProps) {
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<Id<"recipients">[]>([]);
  const [subject, setSubject] = useState(initialSubject);
  const [isSending, setIsSending] = useState(false);
  const { addToast } = useToast();
  
  const recipients = useQuery(api.recipients.list);

  useEffect(() => {
    if (isOpen) {
      setSubject(initialSubject);
      setSelectedRecipientIds([]);
    }
  }, [isOpen, initialSubject]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRecipientIds.length === 0) {
        addToast("Please select at least one recipient.", "error");
        return;
    }

    setIsSending(true);
    try {
      await onSend(selectedRecipientIds, subject);
      onClose();
    } catch (error) {
      console.error("Failed to send email:", error);
      addToast("Failed to send email. Please try again.", "error");
    } finally {
      setIsSending(false);
    }
  };

  const toggleRecipient = (id: Id<"recipients">) => {
      setSelectedRecipientIds(prev => 
        prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
      );
  };

  return (
    <ModalShell open={isOpen} onClose={onClose}>
        <div className="px-6 py-4 border-b border-[var(--card-border)] flex justify-between items-center bg-[var(--surface-sunken)]">
          <h3 className="text-lg font-medium text-[var(--foreground)]">Send Report</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--foreground)]">
            <span className="sr-only">Close</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Recipients</label>
            <div className="border border-[var(--card-border)] rounded-md max-h-48 overflow-y-auto divide-y divide-[var(--card-border)]">
                {!recipients ? (
                    <div className="p-3 text-sm text-[var(--text-muted)]">Loading recipients...</div>
                ) : recipients.length === 0 ? (
                    <div className="p-3 text-sm text-[var(--text-muted)]">No recipients found.</div>
                ) : (
                    recipients.map(r => (
                        <label key={r._id} className="flex items-center p-3 hover:bg-[var(--surface-sunken)] cursor-pointer">
                            <input 
                                type="checkbox"
                                checked={selectedRecipientIds.includes(r._id)}
                                onChange={() => toggleRecipient(r._id)}
                                className="h-4 w-4 accent-[#06B6D4] border-[var(--card-border)] rounded focus:ring-[#06B6D4]"
                            />
                            <div className="ml-3">
                                <p className="text-sm font-medium text-[var(--foreground)]">{r.name}</p>
                                <p className="text-xs text-[var(--text-muted)]">{r.email}</p>
                            </div>
                        </label>
                    ))
                )}
            </div>
          </div>

          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-[var(--text-secondary)]">Subject</label>
            <input
              type="text"
              id="subject"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 block w-full border border-[var(--input-border)] bg-[var(--card-bg)] text-[var(--foreground)] rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-[#06B6D4] focus:border-[var(--input-border-focus)] sm:text-sm"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-[var(--card-border)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[var(--card-border)] bg-[var(--card-bg)] shadow-sm text-sm font-medium rounded-md text-[var(--foreground)] hover:bg-[var(--surface-sunken)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending || selectedRecipientIds.length === 0}
              className="px-4 py-2 border border-transparent bg-gradient-to-br from-[#06B6D4] to-[#0891B2] shadow-lg shadow-[rgba(6,182,212,0.3)] text-sm font-medium rounded-md text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? "Sending..." : "Send Report"}
            </button>
          </div>
        </form>
    </ModalShell>
  );
}

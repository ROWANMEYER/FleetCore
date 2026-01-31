"use client";

import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

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
  
  const recipients = useQuery(api.recipients.list);

  useEffect(() => {
    if (isOpen) {
      setSubject(initialSubject);
      setSelectedRecipientIds([]);
    }
  }, [isOpen, initialSubject]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRecipientIds.length === 0) {
        alert("Please select at least one recipient.");
        return;
    }

    setIsSending(true);
    try {
      await onSend(selectedRecipientIds, subject);
      onClose();
    } catch (error) {
      console.error("Failed to send email:", error);
      alert("Failed to send email. Please try again.");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-medium text-gray-900">Send Report</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <span className="sr-only">Close</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Recipients</label>
            <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                {!recipients ? (
                    <div className="p-3 text-sm text-gray-500">Loading recipients...</div>
                ) : recipients.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500">No recipients found.</div>
                ) : (
                    recipients.map(r => (
                        <label key={r._id} className="flex items-center p-3 hover:bg-gray-50 cursor-pointer">
                            <input 
                                type="checkbox"
                                checked={selectedRecipientIds.includes(r._id)}
                                onChange={() => toggleRecipient(r._id)}
                                className="h-4 w-4 text-black border-gray-300 rounded focus:ring-black"
                            />
                            <div className="ml-3">
                                <p className="text-sm font-medium text-gray-900">{r.name}</p>
                                <p className="text-xs text-gray-500">{r.email}</p>
                            </div>
                        </label>
                    ))
                )}
            </div>
          </div>

          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700">Subject</label>
            <input
              type="text"
              id="subject"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-black focus:border-black sm:text-sm"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending || selectedRecipientIds.length === 0}
              className="px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-black hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? "Sending..." : "Send Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

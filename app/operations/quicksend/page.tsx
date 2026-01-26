"use client";

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import EmailReportModal from "../../components/EmailReportModal";

export default function QuickSendPage() {
  // 1. Date Selection
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);

  // 2. Data Fetching
  const [completedOnly, setCompletedOnly] = useState(true);

  const reportData = useQuery(api.dailyRoutes.getQuickSendReport, { 
    startDate, 
    endDate,
    completedOnly
  });
  
  const sendLoadReportEmail = useAction(api.emails.sendLoadReportEmail);

  // 3. UI State
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  // 4. Handlers
  const handleSendEmail = async (recipientIds: Id<"recipients">[], subject: string) => {
    try {
      await sendLoadReportEmail({ 
        recipientIds, 
        startDate, 
        endDate, 
        subject,
        completedOnly 
      });
      alert("Email sent successfully!");
    } catch (error) {
      console.error("Failed to send email:", error);
      alert("Failed to send email. Please check the logs.");
    }
  };

  const isLoading = reportData === undefined;
  const hasData = reportData && reportData.loads && reportData.loads.length > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">QuickSend – Transport Report</h1>
          <p className="text-gray-500 mt-1">
            Review loads and send reports to stakeholders.
          </p>
        </div>
        <div>
          <button
            onClick={() => setIsEmailModalOpen(true)}
            disabled={!hasData}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-black hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send Report via Email
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border shadow-sm flex flex-col md:flex-row gap-4 items-end">
        <div>
          <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">
            Start Date
          </label>
          <input
            type="date"
            id="start-date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-black focus:border-black sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-1">
            End Date
          </label>
          <input
            type="date"
            id="end-date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-black focus:border-black sm:text-sm"
          />
        </div>
        
        <div className="flex items-center pb-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer select-none">
                <input 
                    type="checkbox" 
                    checked={completedOnly} 
                    onChange={(e) => setCompletedOnly(e.target.checked)} 
                    className="h-4 w-4 text-black border-gray-300 rounded focus:ring-black"
                />
                Show completed only
            </label>
        </div>
      </div>

      {/* Report Preview */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-medium text-gray-900">Report Preview</h2>
          {hasData && (
             <span className="text-sm text-gray-500">
               {reportData.summary.totalLoads} loads found
             </span>
          )}
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-gray-500">Loading report data...</div>
        ) : !hasData ? (
          <div className="p-12 text-center text-gray-500">
            No loads found for the selected period.
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Truck</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Driver</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Route</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Rate</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {reportData.loads.map((load: any, idx: number) => (
                    <tr key={`${load.routeDate}-${load.truckFleetNo}-${idx}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {load.routeDate}
                        {load.status !== "completed" && load.status !== "locked" && (
                          <span className="ml-2 inline-flex items-center rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                            Not completed
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{load.truckFleetNo}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{load.driverName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{load.clientName}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-400">From:</span> {load.fromLocation}
                          <span className="text-xs text-gray-400 mt-1">To:</span> {load.toLocation}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{load.quantity}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{load.rate}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 text-right">{Number(load.amount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Footer */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <div className="flex justify-end gap-8 text-sm">
                <div>
                  <span className="text-gray-500">Total Distance:</span>
                  <span className="ml-2 font-medium text-gray-900">{reportData.summary.totalKm} km</span>
                </div>
                <div>
                  <span className="text-gray-500">Total Revenue:</span>
                  <span className="ml-2 font-bold text-gray-900">{Number(reportData.summary.totalRevenue).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <EmailReportModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        initialSubject={`Transport Report: ${startDate} to ${endDate}`}
        onSend={handleSendEmail}
      />
    </div>
  );
}

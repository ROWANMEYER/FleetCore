"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import Link from "next/link";

/**
 * ⚠️ LEGACY ROUTING - /sheets
 * 
 * This route exists for backward compatibility only.
 * The canonical path for viewing routes is now: /operations/daily-planner/*
 * 
 * TODO (Phase 3+): Implement redirect to new location once all bookmarks/links updated.
 */
export default function SheetsPage() {
  const routes = useQuery(api.dailyRoutes.listRecentRoutes, { limit: 50 });
  const trucks = useQuery(api.fleet.listTrucks);

  if (!routes || !trucks) {
    return <div className="p-8">Loading sheets...</div>;
  }

  const getTruckLabel = (id: string) => trucks.find((t) => t.value === id)?.label || id;

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-bold">Sheets (Daily Routes)</h1>

      {routes.length === 0 ? (
        <p className="text-gray-500">No routes found.</p>
      ) : (
        <div className="space-y-6">
          {routes.map((route) => {
            return (
              <div key={route._id} className="border rounded-lg overflow-hidden shadow-sm bg-white">
                {/* Route Header */}
                <div className="bg-gray-100 p-4 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex gap-6 items-center">
                    <div>
                      <span className="block text-xs text-gray-500 uppercase font-bold">Date</span>
                      <span className="font-medium">{route.routeDate}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500 uppercase font-bold">Truck</span>
                      <span className="font-medium">{getTruckLabel(route.truckFleetNoStr || "")}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500 uppercase font-bold">Driver</span>
                      <span className="font-medium">{route.driverName}</span>
                    </div>
                  </div>

                  <div className="flex gap-6 items-center text-right">
                    <div>
                      <span className="block text-xs text-gray-500 uppercase font-bold">Total KM</span>
                      <span className="font-mono">{route.kilometers} km</span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500 uppercase font-bold">Total Revenue</span>
                      <span className="font-mono font-bold text-green-700">R {route.rate?.toFixed(2)}</span>
                    </div>
                    <div>
                      <Link
                        href={`/planner/${route._id}`}
                        className="bg-white border text-gray-700 hover:bg-gray-50 px-3 py-1 rounded text-sm font-medium transition-colors"
                      >
                        Edit
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Loads Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 border-b">
                      <tr>
                        <th className="p-3 font-medium">Client</th>
                        <th className="p-3 font-medium">From</th>
                        <th className="p-3 font-medium">To</th>
                        <th className="p-3 font-medium">Qty</th>
                        <th className="p-3 font-medium text-right">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {route.loads.map((load: any, idx: number) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="p-3 font-medium">{load.client}</td>
                          <td className="p-3">{load.fromLocations?.join(", ")}</td>
                          <td className="p-3">{load.toLocations?.join(", ")}</td>
                          <td className="p-3">{load.quantity} {load.quantityType}</td>
                          <td className="p-3 text-right">R {load.rate} ({load.rateType})</td>
                        </tr>
                      ))}
                      {route.loads.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-gray-400 italic">
                            No loads recorded for this route.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

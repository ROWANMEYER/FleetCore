"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import WarningIcon from "@/src/components/common/WarningIcon";

type Props = {
  date: string;
  setDate: (v: string) => void;
  truckFleetNo: string;
  setTruckFleetNo: (v: string) => void;
  trailerFleetNo: string;
  setTrailerFleetNo: (v: string) => void;
  driverName: string;
  setDriverName: (v: string) => void;
  routeKilometers: string;
  setRouteKilometers: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;

  trucks: any[];
  trailers: any[];
  drivers: any[];

  isEditable: boolean;
  isEditMode: boolean;
  onComplete: () => void;
  onEdit: () => void;
  step?: number;
  setStep?: (step: number) => void;
  onSaveShortcut?: () => void;
};

export function WizardRouteHeader({
  date,
  setDate,
  truckFleetNo,
  setTruckFleetNo,
  trailerFleetNo,
  setTrailerFleetNo,
  driverName,
  setDriverName,
  routeKilometers,
  setRouteKilometers,
  notes,
  setNotes,
  trucks,
  trailers,
  drivers,
  isEditMode,
  onComplete,
}: Props) {
  // ---------------------------------------------------------------------------
  // WARNING LOGIC (Preserved)
  // ---------------------------------------------------------------------------

  // A. Duplicate Check (Reactive Query)
  const existingRoutes = useQuery(api.dailyRoutes.getRoutesByTruckAndDate, {
    routeDate: date,
    truckFleetNoStr: truckFleetNo,
  });
  
  // Filter out current route if editing
  const isDuplicate = existingRoutes && existingRoutes.length > 0 && !isEditMode;

  // B. Weekend Check
  const isWeekend = (() => {
    if (!date) return false;
    const day = new Date(date).getDay();
    return day === 0 || day === 6;
  })();

  // C. Missing Fields (Optional but Expected)
  const missingFields: string[] = [];
  if (!trailerFleetNo && truckFleetNo) missingFields.push("Trailer");
  if (!driverName && truckFleetNo) missingFields.push("Driver");
  if ((!routeKilometers || parseFloat(routeKilometers) === 0) && truckFleetNo) missingFields.push("KM");

  // ---------------------------------------------------------------------------
  // DATA PREPARATION (Deduplication)
  // ---------------------------------------------------------------------------
  const uniqueTrucks = Array.from(new Map(trucks.map(t => [t._id, t])).values());
  const uniqueTrailers = Array.from(new Map(trailers.map(t => [t._id, t])).values());
  const uniqueDrivers = Array.from(new Map(drivers.map(d => [d._id, d])).values());

  // ---------------------------------------------------------------------------
  // RENDER (Flat Form)
  // ---------------------------------------------------------------------------
  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-white shadow-sm border border-gray-100 rounded-xl space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Date */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">Date</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-black focus:border-transparent outline-none"
            />
            {isWeekend && (
              <div className="text-blue-600 flex-shrink-0">
                <WarningIcon type="info" tooltip="Weekend Operation" />
              </div>
            )}
          </div>
        </div>

        {/* Truck */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">Truck</label>
          <div className="flex items-center gap-2">
            <select
              value={truckFleetNo}
              onChange={(e) => setTruckFleetNo(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-black focus:border-transparent outline-none bg-white"
            >
              <option value="">Select Truck...</option>
              {uniqueTrucks.map((t) => (
                <option key={t._id} value={t.truckFleetNo}>
                  {t.truckFleetNo} ({t.registration})
                </option>
              ))}
            </select>
            {isDuplicate && (
              <div className="text-amber-600 flex-shrink-0">
                <WarningIcon type="warning" tooltip="Duplicate Route" />
              </div>
            )}
          </div>
        </div>

        {/* Trailer */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">Trailer</label>
          <div className="flex items-center gap-2">
            <select
              value={trailerFleetNo}
              onChange={(e) => setTrailerFleetNo(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-black focus:border-transparent outline-none bg-white"
            >
              <option value="">Select Trailer...</option>
              {uniqueTrailers.map((t) => (
                <option key={t._id} value={t.trailerFleetNoStr ?? t.trailerFleetNo?.toString() ?? ""}>
                  {t.trailerFleetNo} ({t.type})
                </option>
              ))}
            </select>
            {missingFields.includes("Trailer") && (
              <div className="text-blue-600 flex-shrink-0">
                <WarningIcon type="info" tooltip="Missing Trailer" />
              </div>
            )}
          </div>
        </div>

        {/* Driver */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">Driver</label>
          <div className="flex items-center gap-2">
            <select
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-black focus:border-transparent outline-none bg-white"
            >
              <option value="">Select Driver...</option>
              {uniqueDrivers.map((d) => (
                <option key={d._id} value={d.driverName}>
                  {d.driverName}
                </option>
              ))}
            </select>
            {missingFields.includes("Driver") && (
              <div className="text-blue-600 flex-shrink-0">
                <WarningIcon type="info" tooltip="Missing Driver" />
              </div>
            )}
          </div>
        </div>

        {/* Route KM */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">Route KM</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={routeKilometers}
              onChange={(e) => setRouteKilometers(e.target.value)}
              placeholder="0"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-black focus:border-transparent outline-none"
            />
            {missingFields.includes("KM") && (
               <div className="text-blue-600 flex-shrink-0">
                 <WarningIcon type="info" tooltip="Zero Distance" />
               </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
            rows={1}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-black focus:border-transparent outline-none resize-none"
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useAuth } from "@/src/components/auth/AuthProvider";
import WarningIcon from "@/src/components/common/WarningIcon";

type Subcontractor = { _id: string; companyName: string; status?: string };

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
  region: string;
  setRegion: (v: string) => void;

  trucks: any[];
  trailers: any[];
  drivers: any[];
  subcontractors: Subcontractor[];

  isFleetMode: boolean;
  selectedSubId: string;
  onFleetModeChange: (v: boolean) => void;
  onSubIdChange: (v: string) => void;

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
  region,
  setRegion,
  trucks,
  trailers,
  drivers,
  subcontractors,
  isFleetMode,
  selectedSubId,
  onFleetModeChange,
  onSubIdChange,
  isEditMode,
}: Props) {
  // ---------------------------------------------------------------------------
  // WARNING LOGIC (Preserved)
  // ---------------------------------------------------------------------------

  // A. Duplicate Check (Reactive Query)
  const { token } = useAuth();
  const existingRoutes = useQuery(api.dailyRoutes.getRoutesByTruckAndDate, {
    routeDate: date,
    truckFleetNo: truckFleetNo,
    token,
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
    <div className="w-full max-w-4xl mx-auto p-6 glass-card border border-[var(--card-border)] rounded-xl space-y-6">
      {/* Fleet / Subcontractor Toggle */}
      <div className="flex items-center gap-4 mb-4">
        <span className="text-sm font-semibold text-[var(--foreground)]">Mode:</span>
        <button
          type="button"
          onClick={() => onFleetModeChange(true)}
          className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
            isFleetMode
              ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white"
              : "bg-[var(--card-bg)] text-[var(--nav-text-color)] border border-[var(--card-border)]"
          }`}
        >
          Fleet
        </button>
        <button
          type="button"
          onClick={() => onFleetModeChange(false)}
          className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
            !isFleetMode
              ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white"
              : "bg-[var(--card-bg)] text-[var(--nav-text-color)] border border-[var(--card-border)]"
          }`}
        >
          Subcontractor
        </button>
        {isDuplicate && (
          <div className="text-amber-600 flex-shrink-0 ml-auto">
            <WarningIcon type="warning" tooltip="Duplicate Route" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Subcontractor dropdown (only in sub mode) */}
        {!isFleetMode && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-[var(--foreground)]">Subcontractor</label>
            <select
              value={selectedSubId}
              onChange={(e) => onSubIdChange(e.target.value)}
              className="w-full p-2 settings-input rounded-md"
            >
              <option value="">Select Subcontractor...</option>
              {subcontractors
                .filter((s) => s.status !== "inactive")
                .map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.companyName}
                  </option>
                ))}
            </select>
          </div>
        )}

        {/* Date */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-[var(--foreground)]">Date</label>
            <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-2 settings-input rounded-md"
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
          <label className="text-sm font-semibold text-[var(--foreground)]">Truck</label>
            <div className="flex items-center gap-2">
            <select
              value={truckFleetNo}
              onChange={(e) => setTruckFleetNo(e.target.value)}
              className="w-full p-2 settings-input rounded-md"
            >
              <option value="">Select Truck...</option>
              {uniqueTrucks.map((t) => (
                <option key={t._id} value={t.truckFleetNo}>
                  {t.truckFleetNo} ({t.registration})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Trailer */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-[var(--foreground)]">Trailer</label>
            <div className="flex items-center gap-2">
            <select
              value={trailerFleetNo}
              onChange={(e) => setTrailerFleetNo(e.target.value)}
              className="w-full p-2 settings-input rounded-md"
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
          <label className="text-sm font-semibold text-[var(--foreground)]">Driver</label>
            <div className="flex items-center gap-2">
            <select
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              className="w-full p-2 settings-input rounded-md"
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
          <label className="text-sm font-semibold text-[var(--foreground)]">Route KM</label>
            <div className="flex items-center gap-2">
            <input
              type="number"
              value={routeKilometers}
              onChange={(e) => setRouteKilometers(e.target.value)}
              placeholder="0"
              className="w-full p-2 settings-input rounded-md"
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
          <label className="text-sm font-semibold text-[var(--foreground)]">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
            rows={1}
            className="w-full p-2 settings-input rounded-md resize-none"
          />
        </div>

        {/* Region */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-[var(--foreground)]">Region</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full p-2 settings-input rounded-md"
          >
            <option value="garden_route">Garden Route</option>
            <option value="eastern_cape">Eastern Cape</option>
          </select>
        </div>
      </div>
    </div>
  );
}

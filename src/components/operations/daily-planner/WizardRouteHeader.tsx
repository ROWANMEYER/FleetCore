"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useAuth, useRegionArg } from "@/src/components/auth/AuthProvider";
import WarningIcon from "@/src/components/common/WarningIcon";
import { ChevronDown, Truck } from "lucide-react";

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
  collapsed: boolean;
  onToggleCollapse: () => void;
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
  collapsed,
  onToggleCollapse,
}: Props) {
  // ---------------------------------------------------------------------------
  // WARNING LOGIC (Preserved)
  // ---------------------------------------------------------------------------

  // A. Duplicate Check (Reactive Query)
  const { token, user } = useAuth();
  const isRegional = user?.role === "regional";
  const regionScopeArg = useRegionArg();
  const existingRoutes = useQuery(api.dailyRoutes.getRoutesByTruckAndDate, {
    routeDate: date,
    truckFleetNo: truckFleetNo,
    token,
    region: regionScopeArg,
  });
  
  // Filter out current route if editing
  const isDuplicate = existingRoutes && existingRoutes.length > 0 && !isEditMode;

  // B. Weekend Check
  const isWeekend = (() => {
    if (!date) return false;
    const day = new Date(date).getDay();
    return day === 0 || day === 6;
  })();

  // C. Missing Fields (Optional but Expected). In subcontractor mode the
  // subcontractor (not the truck) is the key identifier, so the badge keys
  // off the subcontractor selection instead of the truck number.
  const missingFields: string[] = [];
  if (!trailerFleetNo && truckFleetNo) missingFields.push("Trailer");
  if (!driverName && truckFleetNo) missingFields.push("Driver");
  if ((!routeKilometers || parseFloat(routeKilometers) === 0) && truckFleetNo) missingFields.push("KM");
  const headerMissing = isFleetMode ? missingFields.length > 0 : !isFleetMode && !selectedSubId;

  // ---------------------------------------------------------------------------
  // DATA PREPARATION (Deduplication)
  // ---------------------------------------------------------------------------
  const uniqueTrucks = Array.from(new Map(trucks.map(t => [t._id, t])).values());
  const uniqueTrailers = Array.from(new Map(trailers.map(t => [t._id, t])).values());
  const uniqueDrivers = Array.from(new Map(drivers.map(d => [d._id, d])).values());

  // Selected subcontractor's company name (shown in the summary line instead of
  // the truck number, which is meaningless for subcontractor routes).
  const selectedSubName =
    subcontractors.find((s) => s._id === selectedSubId)?.companyName?.trim() || "";

  // ---------------------------------------------------------------------------
  // RENDER (Flat Form)
  // ---------------------------------------------------------------------------
  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 glass-card border border-[var(--card-border)] rounded-xl space-y-5 sm:space-y-6">
      {/* Mobile collapse toggle — hidden on desktop (form is always open there) */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="lg:hidden w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)]/60 dark:backdrop-blur-sm transition-colors"
        aria-expanded={!collapsed}
      >
        <span className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2 text-base font-bold text-[var(--foreground)] min-w-0">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-sm shrink-0">
              <Truck size={14} strokeWidth={2.5} />
            </span>
            {/* The title truncates and the badge never shrinks, so a long
                subcontractor name or the badge can never push into the
                toggle control on the right (no wrap, no overlap). */}
            <span className="truncate min-w-0">Route details</span>
            {collapsed && headerMissing && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 shrink-0">
                ● fields missing
              </span>
            )}
          </span>
          <span className="block mt-1 text-sm text-[var(--nav-text-color)] truncate">
            {collapsed
              ? !isFleetMode
                ? `${selectedSubName || "No subcontractor"} · ${driverName || "No driver"} · ${date || "No date"}`
                : `${truckFleetNo || "No truck"} · ${driverName || "No driver"} · ${date || "No date"}`
              : !isFleetMode
                ? `Date: ${date} · Sub: ${selectedSubName || "—"} · Driver: ${driverName || "—"}`
                : `Date: ${date} · Truck: ${truckFleetNo || "—"} · Driver: ${driverName || "—"}`}
          </span>
        </span>
        <span className="flex items-center gap-1 shrink-0 text-sm font-semibold text-[#06B6D4]">
          {collapsed ? "Edit" : "Collapse"}
          <ChevronDown size={16} className={`transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`} />
        </span>
      </button>

      {/* Body — hidden on mobile when collapsed, always visible on desktop */}
      <div className={collapsed ? "hidden lg:block" : ""}>
      {/* Fleet / Subcontractor Toggle — wraps on narrow screens so the wide
          Subcontractor button never gets cut off at the screen edge. */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-4">
        <span className="text-base font-semibold text-[var(--foreground)]">Mode:</span>
        <button
          type="button"
          onClick={() => onFleetModeChange(true)}
          className={`px-3 sm:px-5 py-3 text-base rounded-xl font-semibold transition-colors ${
            isFleetMode
              ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-md shadow-[rgba(6,182,212,0.3)]"
              : "bg-[var(--card-bg)] text-[var(--nav-text-color)] border border-[var(--card-border)]"
          }`}
        >
          Fleet
        </button>
        <button
          type="button"
          onClick={() => onFleetModeChange(false)}
          className={`px-3 sm:px-5 py-3 text-base rounded-xl font-semibold transition-colors ${
            !isFleetMode
              ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white shadow-md shadow-[rgba(6,182,212,0.3)]"
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">

        {/* Subcontractor dropdown (only in sub mode) */}
        {!isFleetMode && (
          <div className="flex flex-col gap-2">
            <label className="text-base font-semibold text-[var(--foreground)]">Subcontractor</label>
            <select
              value={selectedSubId}
              onChange={(e) => onSubIdChange(e.target.value)}
              className="w-full h-12 px-4 text-base settings-input rounded-md"
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
          <label className="text-base font-semibold text-[var(--foreground)]">Date</label>
            <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-12 px-4 text-base settings-input rounded-md"
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
          <label className="text-base font-semibold text-[var(--foreground)]">Truck</label>
            <div className="flex items-center gap-2">
            <select
              value={truckFleetNo}
              onChange={(e) => setTruckFleetNo(e.target.value)}
              className="w-full h-12 px-4 text-base settings-input rounded-md"
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
          <label className="text-base font-semibold text-[var(--foreground)]">Trailer</label>
            <div className="flex items-center gap-2">
            <select
              value={trailerFleetNo}
              onChange={(e) => setTrailerFleetNo(e.target.value)}
              className="w-full h-12 px-4 text-base settings-input rounded-md"
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
          <label className="text-base font-semibold text-[var(--foreground)]">Driver</label>
            <div className="flex items-center gap-2">
            <select
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              className="w-full h-12 px-4 text-base settings-input rounded-md"
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
          <label className="text-base font-semibold text-[var(--foreground)]">Route KM</label>
            <div className="flex items-center gap-2">
            <input
              type="number"
              value={routeKilometers}
              onChange={(e) => setRouteKilometers(e.target.value)}
              placeholder="0"
              className="w-full h-12 px-4 text-base settings-input rounded-md"
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
          <label className="text-base font-semibold text-[var(--foreground)]">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
            rows={1}
            className="w-full h-12 px-4 py-3 text-base settings-input rounded-md resize-none"
          />
        </div>

        {/* Region — locked to the user's own region for regional roles (server-enforced) */}
        <div className="flex flex-col gap-2">
          <label className="text-base font-semibold text-[var(--foreground)]">Region</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={isRegional}
            className={`w-full p-2 settings-input rounded-md disabled:opacity-60 disabled:cursor-not-allowed ${
              region === "" ? "input-error" : ""
            }`}
          >
            {region === "" && (
              <option value="" disabled>
                Select region...
              </option>
            )}
            <option value="garden_route">Garden Route</option>
            <option value="eastern_cape">Eastern Cape</option>
          </select>
          {region === "" && !isRegional && (
            <p className="text-xs font-semibold text-red-600 flex items-center gap-1">
              <span aria-hidden>⚠</span>
              Select a region — your sidebar is set to All Regions.
            </p>
          )}
          {isRegional && (
            <p className="text-xs text-[var(--nav-text-color)]">
              Locked to your region ({region === "eastern_cape" ? "Eastern Cape" : "Garden Route"})
            </p>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

"use client";

import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import RouteForm, { RouteFormData } from "../../components/RouteForm";
import { useRouter } from "next/navigation";

/**
 * ⚠️ LEGACY ROUTING - /planner
 * 
 * This route exists for backward compatibility only.
 * The canonical path for daily planning is now: /operations/daily-planner/*
 * 
 * TODO (Phase 3+): Implement redirect to new location once all bookmarks/links updated.
 */
export default function PlannerPage() {
  const createDailyRoute = useMutation(api.dailyRoutes.createDailyRoute);
  const router = useRouter();

  async function handleCreate(data: RouteFormData) {
    await createDailyRoute({
      routeDate: data.routeDate,
      truckFleetNoStr: data.truckFleetNoStr,
      driverName: data.driverName,
      trailerFleetNoStr: data.trailerFleetNoStr,
      kilometers: data.kilometers,
      notes: data.notes,
      loads: data.loads.map((l) => ({
        client: l.client,
        quantity: l.quantity,
        quantityType: l.quantityType,
        rate: l.rate,
        rateType: l.rateType,
        fromLocations: [l.fromLocation], // Wrap in array
        toLocations: [l.toLocation], // Wrap in array
      })),
    });

    // Redirect to Sheets or Edit page
    router.push("/sheets");
  }

  return (
    <RouteForm
      onSubmit={handleCreate}
      buttonLabel="Create Daily Route"
    />
  );
}

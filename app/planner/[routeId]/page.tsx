"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import RouteForm, { RouteFormData } from "../../../components/RouteForm";
import { useRouter, useParams } from "next/navigation";
import { Id } from "../../../convex/_generated/dataModel";

/**
 * ⚠️ LEGACY ROUTING - /planner/[routeId]
 * 
 * This route exists for backward compatibility only.
 * The canonical path for daily planning is now: /operations/daily-planner/*
 * 
 * TODO (Phase 3+): Implement redirect to new location once all bookmarks/links updated.
 */
export default function EditRoutePage() {
  const params = useParams();
  const routeId = params.routeId as Id<"dailyRoutes">;
  const router = useRouter();

  const route = useQuery(api.dailyRoutes.getById, { id: routeId });
  const updateDailyRoute = useMutation(api.dailyRoutes.updateDailyRoute);
  const deleteDailyRoute = useMutation(api.dailyRoutes.deleteDailyRoute);

  if (!route) {
    return <div className="p-8">Loading route...</div>;
  }

  async function handleDelete() {
    await deleteDailyRoute({ id: routeId });
    router.push("/sheets");
  }

  async function handleUpdate(data: RouteFormData) {
    await updateDailyRoute({
      id: routeId,
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
        fromLocations: [l.fromLocation],
        toLocations: [l.toLocation],
      })),
    });

    router.push("/sheets");
  }

  return (
    <RouteForm
      initialValues={{
        routeDate: route.routeDate,
        truckFleetNoStr: route.truckFleetNoStr || "",
        driverName: route.driverName,
        trailerFleetNoStr: route.trailerFleetNoStr || "",
        kilometers: route.kilometers,
        notes: route.notes || "",
        loads: route.loads.map((l: any) => ({
          client: l.client,
          quantity: l.quantity,
          quantityType: l.quantityType,
          rate: l.rate,
          rateType: l.rateType,
          fromLocation: l.fromLocations?.[0] || "",
          toLocation: l.toLocations?.[0] || "",
        })),
      }}
      onSubmit={handleUpdate}
      onDelete={handleDelete}
      buttonLabel="Update Route"
    />
  );
}

"use client";
import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { DEFAULT_CERAMIC_SAFETY_NOTES, buildCeramicDriverMessage, ceramicSafetyNotes } from "@/src/lib/ceramic-tiles/driverInstructions";
import { resolveCeramicStopOrder } from "@/src/lib/ceramic-tiles/stopOrder";
export type CeramicDriverChoice = { id: string; name: string; phone: string | null };
export type CeramicTruckChoice = { id: string; fleetNumber: string; registration?: string | null };
export type CeramicFleet = { drivers: CeramicDriverChoice[]; trucks: CeramicTruckChoice[] };
export function useCeramicInstructions({ shipment, token, region, drivers, trucks, requireVersionReview = false }: {
  shipment: Doc<"ceramicShipments">; token: string; region: "garden_route" | "eastern_cape";
  drivers: CeramicDriverChoice[]; trucks: CeramicTruckChoice[]; requireVersionReview?: boolean;
}) {
  const [safetyNotes, setSafetyNotes] = useState(ceramicSafetyNotes(shipment.driverInstructions?.safetyNotes));
  const [additionalNotes, setAdditionalNotes] = useState(shipment.driverInstructions?.additionalNotes ?? "");
  const [stopOrder, setStopOrder] = useState(() => resolveCeramicStopOrder(shipment.snapshot, shipment.driverInstructions?.stopOrder));
  const currentStopOrder = useMemo(() => resolveCeramicStopOrder(shipment.snapshot, stopOrder), [shipment.snapshot, stopOrder]);
  const savedStopOrder = resolveCeramicStopOrder(shipment.snapshot, shipment.driverInstructions?.stopOrder);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const save = useMutation(api.ceramicTiles.saveDriverInstructions);
  const assignedDriver = drivers.find((driver) => driver.id === shipment.driverId);
  const assignedTruck = trucks.find((truck) => truck.id === shipment.truckId);
  const needsVersionReview = requireVersionReview && shipment.driverInstructions?.reviewedVersion !== shipment.version;
  const hasEdits =
    safetyNotes !== (shipment.driverInstructions?.safetyNotes ?? DEFAULT_CERAMIC_SAFETY_NOTES) ||
    additionalNotes !== (shipment.driverInstructions?.additionalNotes ?? "") ||
    JSON.stringify(currentStopOrder) !== JSON.stringify(savedStopOrder);
  const dirty = needsVersionReview || hasEdits;
  const message = useMemo(() => buildCeramicDriverMessage({
    shipment: shipment.snapshot,
    driverName: assignedDriver?.name ?? "",
    truckNumber: assignedTruck?.fleetNumber ?? "",
    truckRegistration: assignedTruck?.registration ?? "",
    safetyNotes,
    additionalNotes,
    stopOrder: currentStopOrder,
  }), [shipment.snapshot, assignedDriver?.name, assignedTruck?.fleetNumber, assignedTruck?.registration, safetyNotes, additionalNotes, currentStopOrder]);

  const handleSave = async () => {
    setError(""); setSuccess(""); setSaving(true);
    try {
      await save({ token, region, shipmentId: shipment._id, safetyNotes, additionalNotes, stopOrder: currentStopOrder, expectedVersion: shipment.version });
      setSuccess("Driver instructions saved.");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save driver instructions.");
      return false;
    } finally { setSaving(false); }
  };

  const copyMessage = async () => {
    setError(""); setSuccess("");
    try {
      await navigator.clipboard.writeText(message);
      setSuccess("Instructions copied. Review the message and send it in WhatsApp.");
    } catch {
      setError("Could not copy automatically. Select the preview text and copy it manually.");
    }
  };

  const canOpenWhatsApp = !!assignedDriver && !!assignedTruck && !dirty && !saving;

  return { safetyNotes, setSafetyNotes, additionalNotes, setAdditionalNotes, currentStopOrder, setStopOrder,
    assignedDriver, assignedTruck, needsVersionReview, hasEdits, dirty, saving, error, success, setSuccess,
    handleSave, copyMessage, canOpenWhatsApp, message };
}

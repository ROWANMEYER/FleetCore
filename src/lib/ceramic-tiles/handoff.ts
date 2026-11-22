import type { CeramicDispatchShipment } from "./mobileDispatch";
import { buildCeramicDriverMessage } from "./driverInstructions";
import { ceramicWorkflowStage } from "./workflow";

type Fleet = {
  drivers: { id: string; name: string; phone: string | null }[];
  trucks: { id: string; fleetNumber: string; registration?: string | null }[];
};
type SavedHandoff = { ready: false; reason: string; action: "assignment" | "instructions" } |
  { ready: true; message: string; driverName: string; driverPhone: string | null; truckLabel: string };

/** Build the send step from saved values, independently of any editor draft. */
export function ceramicSavedHandoff(shipment: CeramicDispatchShipment, fleet: Fleet): SavedHandoff {
  const stage = ceramicWorkflowStage(shipment);
  if (stage === "assignment") return { ready: false, reason: "Save the current driver, truck and planning date before sending instructions.", action: "assignment" };
  if (stage === "instructions" || !shipment.driverInstructions) return { ready: false, reason: "Review and save the instructions for the current assignment before sending.", action: "instructions" };
  const driver = fleet.drivers.find(item => item.id === shipment.driverId);
  const truck = fleet.trucks.find(item => item.id === shipment.truckId);
  if (!driver || !truck) return { ready: false, reason: "The assigned driver or truck is unavailable. Choose an available driver and truck, then save the assignment.", action: "assignment" };
  return { ready: true, driverName: driver.name, driverPhone: driver.phone,
    truckLabel: [truck.fleetNumber, truck.registration].filter(Boolean).join(" · "),
    message: buildCeramicDriverMessage({ shipment: shipment.snapshot, driverName: driver.name,
      truckNumber: truck.fleetNumber, truckRegistration: truck.registration ?? "",
      safetyNotes: shipment.driverInstructions.safetyNotes, additionalNotes: shipment.driverInstructions.additionalNotes,
      stopOrder: shipment.driverInstructions.stopOrder }) };
}

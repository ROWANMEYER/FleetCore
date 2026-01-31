import { InvoiceData } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const buildInvoiceData = (route: any, customers: any[] | undefined): InvoiceData => {
  // [DATA INTEGRITY] This function maps raw database fields to the InvoiceData DTO.
  // DO NOT add formatting logic here (e.g. "R " prefix, date strings).
  // Return raw numbers and Date objects only.

  // 1. Resolve Customer
  const clientName = route.client || "";
  const customer = customers?.find(c => 
    c.name === clientName || 
    c.normalizedName === clientName.toLowerCase()
  );

  // 2. Prepare Description
  // "2026-01-28: TRANSPORTATION OF LOAD FROM GEORGE TO HERMANUS..."
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromLocs = (route.loads?.flatMap((l: any) => l.fromLocations || []) || []).join(" • ");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toLocs = (route.loads?.flatMap((l: any) => l.toLocations || []) || []).join(" → ");
  
  const rawDesc = `${route.routeDate || ""}: TRANSPORTATION OF LOAD FROM ${fromLocs} TO ${toLocs}`;
  const subDesc = `Vehicle: ${route.truckFleetNoStr || ""} / ${route.trailerFleetNoStr || ""} | Driver: ${route.driverName || ""}`;

  const rate = Number(route.rate) || 0;
  const vatRate = 0.15;
  const vatAmount = rate * vatRate;
  const totalAmount = rate + vatAmount;

  return {
    invoiceNumber: `PRO-${(route.routeDate || "").replace(/-/g, "")}-${route._id.slice(-4)}`,
    date: new Date(), // Return raw Date object
    client: {
      name: clientName,
      address: customer?.address,
      vatNumber: customer?.vatNumber,
      contactPerson: customer?.contactPerson,
      email: customer?.email
    },
    lineItems: [
      {
        description: rawDesc, // Return raw description, no formatting
        subDescription: subDesc,
        amount: rate
      }
    ],
    totals: {
      subtotal: rate,
      vatAmount: vatAmount,
      totalAmount: totalAmount
    }
  };
};

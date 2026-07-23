import { InvoiceData } from "./types";

const fmtCurrencyRaw = (n: number) => {
  const parts = n.toFixed(2).split(".");
  const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `R${int},${parts[1]}`;
};

 
export const buildInvoiceData = (route: any, customers: any[] | undefined): InvoiceData => {
  // 1. Resolve customer
  const clientName = route.client || "";
  const customer = customers?.find(
    (c) => c.name === clientName || c.normalizedName === clientName.toLowerCase()
  );

  // 2. Financials
  const rate = Number(route.rate) || 0;
  const vatAmount = rate * 0.15;
  const totalAmount = rate + vatAmount;

  // 3. Truck registration (will be enriched by backend on save, use fleet no as fallback)
  const truckReg = route.truckFleetNoStr || route.truckFleetNo?.toString() || "";

  // 4. Build line items — one per load for multi-load routes (#5)
   
  const loads: any[] = route.loads ?? [];

  const lineItems = loads.length > 0
    ? loads.map((load: any) => {
        const fromLocs = (load.fromLocations || []).join(" / ");
        const toLocs = (load.toLocations || []).join(" / ");
        const qty = parseFloat(load.quantity) || 0;
        const loadRate = parseFloat(load.rate) || 0;
        const loadAmount =
          load.rateType === "flat" || load.rateType === "full"
            ? loadRate
            : qty * loadRate;

        // #2 Afrikaans description
        const desc = `VERVOER VANAF ${fromLocs.toUpperCase()} NA ${toLocs.toUpperCase()} OP ${route.routeDate || ""} TEEN ${fmtCurrencyRaw(loadAmount)} + BTW`;

        return {
          description: desc,
          subDescription: `Voertuig: ${truckReg} | Bestuurder: ${route.driverName || ""}`,
          amount: loadAmount,
          driverName: route.driverName || "",
          truckReg,
          notes: route.notes || undefined,
        };
      })
    : [
        {
          // Fallback when no loads — use route-level rate
          description: `VERVOER OP ${route.routeDate || ""} TEEN ${fmtCurrencyRaw(rate)} + BTW`,
          subDescription: `Voertuig: ${truckReg} | Bestuurder: ${route.driverName || ""}`,
          amount: rate,
          driverName: route.driverName || "",
          truckReg,
          notes: route.notes || undefined,
        },
      ];

  return {
    // invoiceNumber is a placeholder — replaced with sequential number by backend on save
    invoiceNumber: `PRO-${(route.routeDate || "").replace(/-/g, "")}-${route._id.slice(-4)}`,
    date: new Date(),
    copyLabel: "ORIGINAL",
    client: {
      name: clientName,
      address: customer?.address,
      vatNumber: customer?.vatNumber || undefined,
      contactPerson: customer?.contactPerson,
      phone: (customer as any)?.phone,
      email: customer?.email,
    },
    lineItems,
    totals: {
      subtotal: rate,
      vatAmount,
      totalAmount,
    },
  };
};

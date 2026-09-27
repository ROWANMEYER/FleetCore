import type { RateSheetData } from "./types";
import { monthlyRates, type FuelPeriod } from "@/src/lib/fuel/monthlyRates";
import { priceChange } from "@/convex/fuelPriceFields";
import { formatRateMonth } from "./formatters";

/**
 * The data layer for the customer rate sheet PDF: maps the live rate sheet and
 * its customer to the `RateSheetData` DTO the template draws. Raw data only —
 * numbers and ISO strings; every piece of presentation formatting lives in
 * `formatters.ts` and every drawing decision in `rateSheetTemplate.ts`.
 */
export const buildRateSheetData = (
  sheet: {
    effectiveDate?: string;
    notes: string;
    oldDieselPrice: number;
    newDieselPrice: number;
    defaultPricingUnit?: string;
    lanes: { loadingPoint: string; destination: string; pricingUnit?: string; rate: number; date?: string; rates?: Array<number | null | undefined>; sortOrder: number }[];
  },
  customer?: { id?: string; name?: string; accountNumber?: string; contactPerson?: string; phone?: string; email?: string; address?: string; vatNumber?: string },
  fuelHistory: FuelPeriod[] = [],
): RateSheetData => {
  const sortedLanes = [...sheet.lanes].sort((a, b) => a.sortOrder - b.sortOrder);
  const timeline = monthlyRates(sortedLanes.map(l => l.rate), sheet.effectiveDate ?? "", fuelHistory);
  const rateLabels = timeline.months.map(formatRateMonth);
  const fuel = [...fuelHistory].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const latest = fuel.at(-1);
  const previous = fuel.at(-2);

  const customerData: RateSheetData["customer"] = {
    ...(customer?.id ? { id: customer.id } : {}),
    name: customer?.name ?? "",
    ...(customer?.accountNumber ? { accountNumber: customer.accountNumber } : {}),
    ...(customer?.contactPerson ? { contactPerson: customer.contactPerson } : {}),
    ...(customer?.phone ? { phone: customer.phone } : {}),
    ...(customer?.email ? { email: customer.email } : {}),
    ...(customer?.address ? { address: customer.address } : {}),
    ...(customer?.vatNumber ? { vatNumber: customer.vatNumber } : {}),
  };

  return {
    customer: customerData,
    effectiveDate: sheet.effectiveDate ?? "",
    diesel: {
      oldPrice: previous?.pricePerLitre ?? 0,
      newPrice: latest?.pricePerLitre ?? 0,
      change: latest ? priceChange(latest.pricePerLitre, previous?.pricePerLitre ?? null) : null,
    },
    notes: sheet.notes.trim() || undefined,
    rateLabels,
    calculationProblem: timeline.problem ?? undefined,
    lanes: sortedLanes.map((l, index) => {
        const rates = timeline.rates[index];
        const laneData: RateSheetData["lanes"][number] = {
          loadingPoint: l.loadingPoint,
          destination: l.destination,
          pricingUnit: l.pricingUnit || sheet.defaultPricingUnit || undefined,
          rate: l.rate,
          rates: rates.slice(0, 3),
          sortOrder: l.sortOrder,
        };
        if (l.date) laneData.date = l.date;
        return laneData;
      }),
    company: undefined,
  };
};

export interface InvoiceData {
  invoiceNumber: string;
  date: Date;
  copyLabel?: "ORIGINAL" | "COPY"; // #7 — stamp
  client: {
    name: string;
    address?: string;
    vatNumber?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
  };
  lineItems: {
    description: string;   // Afrikaans transport description
    subDescription: string;
    amount: number;
    driverName?: string;
    truckReg?: string;     // Registration plate, not fleet number
    notes?: string;        // #8 — route notes
  }[];
  totals: {
    subtotal: number;
    vatAmount: number;
    totalAmount: number;
  };
  company?: {
    name: string;
    pobox: string;
    city: string;
    postal: string;
    tel: string;
    fax: string;
    vat: string;
    bank: string;
    acc: string;
    branch: string;
  };
}

/**
 * A customer rate sheet as it prints: one page per customer listing every lane
 * and its rate, the diesel the rates are priced against, and the sheet's notes.
 *
 * Raw data only — numbers and ISO date strings, no formatted currency. The
 * builder assembles this; the template draws it; `formatters.ts` does every
 * last bit of presentation formatting. Lane amounts are what the customer pays
 * per unit as stored, VAT-exclusive by the same convention as the invoice.
 */
export interface RateSheetData {
  customer: {
    id?: string;
    name: string;
    accountNumber?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    address?: string;
    vatNumber?: string;
  };
  /** ISO YYYY-MM-DD the rates were added — printed as the effective date of the whole sheet. */
  effectiveDate: string;
  /** The diesel prices the rates were priced against, per litre. Zero means never recorded and prints as a dash. */
  diesel: {
    oldPrice: number;
    newPrice: number;
    change?: number | null;
  };
  notes?: string;
  rateLabels?: string[];
  calculationProblem?: string;
  invalidDates?: Array<{
    loadingPoint: string;
    destination: string;
    date?: string;
    reason: string;
  }>;
  lanes: {
    loadingPoint: string;
    destination: string;
    /** Absent when the lane uses the sheet's default unit. */
    pricingUnit?: string;
    rate: number;
    rates?: Array<number | null>;
    sortOrder: number;
    date?: string;
  }[];
  company?: InvoiceData["company"];
}

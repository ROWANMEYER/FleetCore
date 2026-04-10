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
}

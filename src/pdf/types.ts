// The Single Source of Truth DTO for Invoices
// This interfaces maps strictly to the visual structure of the PDF
// but contains RAW data (Date objects, numbers) not formatted strings.

export interface InvoiceData {
  invoiceNumber: string;
  date: Date;
  client: {
    name: string;
    address?: string;
    vatNumber?: string;
    contactPerson?: string;
    email?: string;
  };
  lineItems: {
    description: string; // Raw description
    subDescription: string;
    amount: number;      // Raw number
  }[];
  totals: {
    subtotal: number;
    vatAmount: number;
    totalAmount: number;
  };
}

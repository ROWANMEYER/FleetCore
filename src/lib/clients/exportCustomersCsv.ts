import { downloadFile } from "@/src/lib/exports/utils";

export type CustomerExportRow = {
  name: string;
  isActive: boolean;
  accountNumber?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  vatNumber?: string;
  note?: string;
};

/** Exactly the columns `parseAgeAnalysisCustomers` reads, so the file can be imported again unchanged. */
export const CUSTOMER_EXPORT_HEADERS = [
  "Rekno",
  "Name",
  "Blocked",
  "Contact",
  "Email",
  "Telephone",
  "Delivery Address 1",
  "Tax Reference",
  "Note",
] as const;

function cell(value?: string) {
  return `"${(value ?? "").replace(/"/g, '""')}"`;
}

/** Quoted RFC-4180 CSV with a UTF-8 BOM so Excel keeps leading zeroes and accents. */
export function buildCustomersCsv(customers: CustomerExportRow[]): string {
  const lines = [CUSTOMER_EXPORT_HEADERS.map(cell).join(",")];
  for (const customer of customers) {
    lines.push(
      [
        customer.accountNumber,
        customer.name,
        customer.isActive ? "No" : "Yes",
        customer.contactPerson,
        customer.email,
        customer.phone,
        customer.address,
        customer.vatNumber,
        customer.note,
      ]
        .map(cell)
        .join(",")
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function customersCsvFilename(now = new Date()) {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `fleetcore-clients_${day}.csv`;
}

export type CustomersCsvExport = { exported: number; missingAccountNumber: number };

/** Downloads the customers as an import-ready Age Analysis CSV. */
export function exportCustomersCsv(customers: CustomerExportRow[], now = new Date()): CustomersCsvExport {
  const missingAccountNumber = customers.filter((c) => !c.accountNumber?.trim()).length;
  downloadFile(buildCustomersCsv(customers), customersCsvFilename(now), "text/csv;charset=utf-8");
  return { exported: customers.length, missingAccountNumber };
}
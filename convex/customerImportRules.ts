import { normalizeCustomerName } from "./customerValidation";

export type CustomerImportRow = {
  sourceRow: number; accountNumber: string; name: string; isActive: boolean;
  contactPerson?: string; email?: string; phone?: string; address?: string; vatNumber?: string; note?: string;
};
export type ExistingImportCustomer = { name: string; normalizedName: string; accountNumber?: string; isActive: boolean };
export function invalidCustomerImportRow(row: CustomerImportRow): string | null {
  if (!Number.isInteger(row.sourceRow) || row.sourceRow < 2) return "Invalid source row.";
  if (!row.accountNumber.trim()) return "Missing Rekno / account number.";
  if (!row.name.trim() || /\*+\s*MISSING DESCRIPTION\s*\*+/i.test(row.name)) return "Missing customer name.";
  if (row.name.length > 250 || row.accountNumber.length > 80) return "Name or account number is too long.";
  if ([row.contactPerson, row.email, row.phone, row.vatNumber].some(s => s && s.length > 1000) || (row.address?.length ?? 0) > 4000 || (row.note?.length ?? 0) > 10000) return "A contact or address field is too long.";
  return null;
}
export function planCustomerImport(rows: CustomerImportRow[], existing: ExistingImportCustomer[]) {
  const accountCounts = new Map<string, number>(); const nameCounts = new Map<string, number>();
  for (const row of rows) {
    const name = normalizeCustomerName(row.name); const account = row.accountNumber.trim();
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1); accountCounts.set(account, (accountCounts.get(account) ?? 0) + 1);
  }
  const accounts = new Map(existing.filter(c => c.accountNumber).map(c => [c.accountNumber!, c]));
  const names = new Map(existing.map(c => [c.normalizedName, c]));
  return rows.map(row => {
    let reason = invalidCustomerImportRow(row);
    const account = accounts.get(row.accountNumber.trim()); const name = names.get(normalizeCustomerName(row.name));
    if (!reason && account) reason = `Account already belongs to ${account.name}; existing customer kept unchanged.`;
    if (!reason && name) reason = `Name already exists${name.isActive ? "" : " (inactive)"}; existing customer kept unchanged.`;
    if (!reason && (accountCounts.get(row.accountNumber.trim()) ?? 0) > 1) reason = "Duplicate account number in this file. Keep one row before importing.";
    if (!reason && (nameCounts.get(normalizeCustomerName(row.name)) ?? 0) > 1) reason = "Duplicate name in this file. Fleetcore requires a unique name; resolve these rows before importing.";
    return { row, reason };
  });
}

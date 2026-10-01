import type { CustomerImportRow } from "@/convex/customerImportRules";

/** RFC-style quoted CSV, preserving account numbers and telephone numbers as text. */
export function parseCsvRecords(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = []; let row: string[] = []; let field = "";
  let quoted = false; let closedQuote = false;
  const pushField = () => { row.push(field); field = ""; closedQuote = false; };
  const pushRow = () => { pushField(); if (row.some(cell => cell.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closedQuote = true; } }
      else field += char;
    } else if (char === ",") pushField();
    else if (char === "\n" || char === "\r") { if (char === "\r" && text[i + 1] === "\n") i++; pushRow(); }
    else if (char === '"' && !field && !closedQuote) quoted = true;
    else if (char === '"' || (closedQuote && char.trim())) throw new Error(`Invalid CSV quoting near record ${rows.length + 1}. Re-export the file from Age Analysis.`);
    else if (!closedQuote) field += char;
  }
  if (quoted) throw new Error("The CSV ends inside a quoted field. Re-export the complete file.");
  if (field || row.length || closedQuote) pushRow();
  return rows;
}
/** Maps an Age Analysis customer CSV to import rows. A `Note` column (written by the Fleetcore export) wins over the folded Age Analysis label columns. */
export function parseAgeAnalysisCustomers(input: string): CustomerImportRow[] {
  if (input.length > 10_000_000) throw new Error("Choose a CSV smaller than 10 MB.");
  const records = parseCsvRecords(input);
  if (records.length < 2) throw new Error("The CSV has no customer rows.");
  if (records.length > 10001) throw new Error("Import at most 10,000 customers per file.");
  const headers = records[0].map(s => s.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error("The CSV contains duplicate column headings.");
  if (!["rekno", "name", "blocked"].every(h => headers.includes(h))) throw new Error("Choose the Age Analysis customer CSV containing Rekno, Name and Blocked columns.");
  return records.slice(1).map((cells, index) => {
    const sourceRow = index + 2;
    if (cells.length !== headers.length) throw new Error(`CSV record ${sourceRow} has ${cells.length} columns; expected ${headers.length}. Re-export the file.`);
    const value = (header: string) => cells[headers.indexOf(header.toLowerCase())]?.trim() ?? "";
    const optional = (header: string) => value(header) || undefined;
    const blocked = value("Blocked").toLowerCase();
    if (!["yes", "no", "true", "false", "1", "0", ""].includes(blocked)) throw new Error(`Unrecognised Blocked value at record ${sourceRow}: ${value("Blocked")}.`);
    const delivery = [value("Delivery Address 1"), value("Delivery Address 2"), value("Delivery Address 3")].filter(Boolean).join("\n");
    const postal = [value("Postal Address 1"), value("Postal Address 2"), value("Postal Code")].filter(Boolean).join("\n");
    const notes = [["Age Analysis aliases", value("Aliases")], ["COD", value("COD")], ["Mobile", value("Mobile")], ["Fax", value("Fax")], ["Postal address", delivery ? postal : ""]].filter(([, content]) => !!content).map(([label, content]) => `${label}: ${content}`).join("\n");
    return { sourceRow, accountNumber: value("Rekno"), name: value("Name"), isActive: !["yes", "true", "1"].includes(blocked), contactPerson: optional("Contact"), email: optional("Email"), phone: optional("Telephone") ?? optional("Mobile"), address: delivery || postal || undefined, vatNumber: optional("Tax Reference"), note: value("Note") || notes || undefined };
  });
}

import { CERAMIC_LOCAL_TOWN } from "./planning";
import definition from "./monthlyTemplate.json";
import type { CeramicReportRow } from "./reportExport";
import { CERAMIC_WAREHOUSES, ceramicMonthlyAmounts, ceramicStopsCharge } from "./monthlyReport";

export type TemplateStyle = { format?: string; "table-cell-properties"?: Record<string, string>; "text-properties"?: Record<string, string>; "paragraph-properties"?: Record<string, string> };
export type TemplateCell = { value?: string | number | null; formula?: string; style: TemplateStyle; span: number; covered: boolean; date?: boolean; editShipment?: string; editLabel?: string };
export type TemplateRow = { sourceRow: number; height: number; cells: TemplateCell[] };
export type TemplateSheet = { name: string; columns: number[]; rows: TemplateRow[] };
const template = definition as { sheets: TemplateSheet[]; externalTarget: string };
export const ceramicExternalTarget = template.externalTarget;
const copy = <T,>(value: T): T => structuredClone(value);
export function columnName(index: number): string { let result = ""; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result; return result; }
export function excelTemplateFormula(value: string): string {
  return value.replace(/^of:=/, "").replace(/\['file:[^\]]+#Sheet1\.\$D\$10:\.\$D\$83\]/g, "[1]Sheet1!$D$10:$D$83")
    .replace(/\['file:[^\]]+#Sheet1\.\$AF\$10:\.\$AF\$83\]/g, "[1]Sheet1!$AF$10:$AF$83")
    .replace(/\[\.([A-Z]+\d+):\.([A-Z]+\d+)\]/g, "$1:$2").replace(/\[\.([A-Z]+\d+)\]/g, "$1").replaceAll(";", ",");
}
function monthLabels(month: string) {
  const date = new Date(`${month}-01T00:00:00Z`);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Choose a valid month.");
  const full = date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return { full, short: date.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(" ", "-"), name: full.replace(" ", "_") };
}
function header(sheet: TemplateSheet, count: number) { return copy(sheet.rows.filter(row => row.sourceRow <= count)); }
function normalized(sheet: TemplateSheet) {
  for (const row of sheet.rows) for (const cell of row.cells) if (cell.formula) cell.formula = excelTemplateFormula(cell.formula);
  return sheet;
}
/** Same original footer formulas, including the external January counts and weight VAT. */
function footerValues(sheet: TemplateSheet) {
  const cells = new Map<string, TemplateCell>();
  sheet.rows.forEach((row, index) => row.cells.forEach((cell, col) => cells.set(`${columnName(col)}${index + 1}`, cell)));
  const value = (ref: string): number => { const v = cells.get(ref)?.value; return typeof v === "number" ? v : 0; };
  for (const row of sheet.rows) for (const cell of row.cells) {
    if (!cell.formula || cell.value !== undefined) continue;
    if (cell.formula.includes("[1]")) { cell.value = null; continue; }
    let formula = cell.formula.replace(/(SUBTOTAL\((103|109),|SUM\()([A-Z]+)(\d+):([A-Z]+)(\d+)\)/g, (_m, _fn, subtotal, c1, r1, c2, r2) => {
      if (c1 !== c2) throw new Error("Unexpected template range.");
      let sum = 0;
      for (let r = Number(r1); r <= Number(r2); r++) { const c = cells.get(`${c1}${r}`); if (subtotal && c?.formula?.startsWith("SUBTOTAL(")) continue;
        sum += subtotal === "103" ? c?.value !== undefined && c.value !== null && c.value !== "" ? 1 : 0 : value(`${c1}${r}`); }
      return String(sum);
    });
    formula = formula.replace(/\b[A-Z]+\d+\b/g, ref => String(value(ref)));
    const tokens = formula.replace(/SUM/g, "").match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[+*/()-]/gi) ?? [];
    let index = 0;
    const atom = (): number => { const token = tokens[index++]; if (token === "-") return -atom(); if (token === "(") { const n = expression(); index++; return n; } return Number(token); };
    const product = (): number => { let n = atom(); while (tokens[index] === "*" || tokens[index] === "/") { const op = tokens[index++], rhs = atom(); n = op === "*" ? n * rhs : n / rhs; } return n; };
    const expression = (): number => { let n = product(); while (tokens[index] === "+" || tokens[index] === "-") { const op = tokens[index++], rhs = product(); n = op === "+" ? n + rhs : n - rhs; } return n; };
    const calculated = expression(); cell.value = Number.isFinite(calculated) ? calculated : null;
  }
}
export function buildCeramicTemplateSheets(rows: CeramicReportRow[], month: string): TemplateSheet[] {
  const labels = monthLabels(month); const main = template.sheets[0], local = template.sheets[1];
  const bodyCount = Math.max(45, rows.length), mainRows = header(main, 10);
  mainRows[7].cells[13].value = labels.full;
  const bodyStyle = main.rows.find(row => row.sourceRow === 11)!;
  for (let index = 0; index < bodyCount; index++) {
    const line = copy(bodyStyle); line.cells.forEach(cell => { delete cell.value; delete cell.formula; });
    const row = rows[index]; const r = index + 11;
    if (row) {
      const put = (col: number, value: string | number | null, formula?: string) => { line.cells[col].value = value; if (formula) line.cells[col].formula = formula; };
      const amounts = ceramicMonthlyAmounts(row.warehouseWeights ?? [], row.billing);
      put(0, row.routeDate); line.cells[0].date = true; put(1, row.shipmentNumber); put(2, "");
      // Preserve the template's existing placement: registration in D, fleet number in F.
      put(3, row.truckRegistration ?? ""); put(4, row.driverName); put(5, `FLEET ${row.truckFleetNo}`); put(6, row.billing?.load ?? ""); put(7, row.billing?.ratePerTon ?? null);
      CERAMIC_WAREHOUSES.forEach((warehouse, i) => { const weight = row.warehouseWeights?.find(w => w.code === warehouse.code)?.weightKg ?? 0;
        put(8 + i * 2, weight); put(9 + i * 2, amounts.allocated.find(w => w.code === warehouse.code)?.amount ?? null, [1,3,4].includes(i) ? `AC${r}*${warehouse.weightColumn}${r}` : `${warehouse.weightColumn}${r}*AC${r}`); });
      const tons = row.billing?.automation?.chargeableTons ?? 34;
      put(24, amounts.freight, Number.isInteger(tons) ? `H${r}*${tons}` : `ROUND(H${r}*${tons},2)`); put(25, ceramicStopsCharge(row.billing)); put(26, null);
      put(27, amounts.total, `Y${r}+Z${r}+AA${r}`); put(28, amounts.ratePerKg, `(AB${r}/AD${r})`);
      put(29, amounts.loadedWeight, CERAMIC_WAREHOUSES.map(w => `${w.weightColumn}${r}`).join("+"));
      put(30, amounts.invoicePrice, CERAMIC_WAREHOUSES.map(w => `${w.amountColumn}${r}`).join("+")); put(31, amounts.variance, `AE${r}-AB${r}`);
      line.cells[21].formula = `SUM(U${r}*AC${r})`;
      for (const col of [1, 6, 7, 25]) { line.cells[col].editShipment = row.shipmentId; line.cells[col].editLabel = row.shipmentNumber; }
    }
    mainRows.push(line);
  }
  for (const original of main.rows.filter(row => row.sourceRow >= 56)) {
    const line = copy(original);
    for (const cell of line.cells) if (cell.formula && !cell.formula.includes("file:")) cell.formula = cell.formula.replace(/([A-Z]+)(\d+)/g, (_m, col, row) => `${col}${Number(row) >= 55 ? Number(row) + bodyCount - 45 : row}`);
    mainRows.push(line);
  }
  const localRows = header(local, 3); localRows[1].cells[0].value = labels.short;
  const locals = rows.flatMap(row => row.locals.map(leg => ({ row, leg })));
  const localCount = Math.max(22, locals.length), localStyle = local.rows.find(row => row.sourceRow === 4)!;
  for (let index = 0; index < localCount; index++) {
    const line = copy(localStyle); line.cells.forEach(cell => { delete cell.value; delete cell.formula; });
    const source = locals[index]; if (source) {
      const { row, leg } = source, input = row.billing?.locals.find(l => l.key === leg.key);
      [row.truckRegistration ?? "", row.driverName, row.routeDate, CERAMIC_LOCAL_TOWN, CERAMIC_LOCAL_TOWN, input?.price ?? null, row.shipmentNumber].forEach((v, col) => { line.cells[col].value = v; });
      line.cells[2].date = true; line.cells[5].editShipment = row.shipmentId; line.cells[6].editShipment = row.shipmentId; line.cells[5].editLabel = row.shipmentNumber; line.cells[6].editLabel = row.shipmentNumber;
    }
    localRows.push(line);
  }
  const total = copy(local.rows.find(row => row.sourceRow === 26)!); total.cells[5].formula = `SUM(F4:F${localCount + 3})`; localRows.push(total);
  const sheets = [normalized({ name: labels.name, columns: main.columns, rows: mainRows }), normalized({ name: `Locals_${labels.name}`, columns: local.columns, rows: localRows })];
  sheets.forEach(footerValues); return sheets;
}

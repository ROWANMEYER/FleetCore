"use client";
import type { CSSProperties } from "react";
import type { TemplateCell, TemplateSheet, TemplateStyle } from "@/src/lib/ceramic-tiles/templateWorkbook";

function styleFor(style: TemplateStyle): CSSProperties {
  const c = style["table-cell-properties"] ?? {}, f = style["text-properties"] ?? {}, p = style["paragraph-properties"] ?? {};
  const borders = Object.fromEntries(["top", "bottom", "left", "right"].map(edge => [`border${edge[0].toUpperCase()}${edge.slice(1)}`, c[`border-${edge}`] ?? c.border ?? "none"]));
  return { ...borders, fontFamily: f["font-name"] ?? "Arial", fontSize: f["font-size"] ?? "10pt", fontWeight: f["font-weight"] === "bold" ? 700 : 400,
    color: f.color ?? "#000000", backgroundColor: c["background-color"] === "transparent" ? undefined : c["background-color"],
    verticalAlign: c["vertical-align"] === "middle" ? "middle" : "bottom", textAlign: p["text-align"] === "center" ? "center" : p["text-align"] === "end" ? "right" : "left",
    whiteSpace: c["wrap-option"] === "wrap" ? "normal" : "nowrap", padding: "0 2px", lineHeight: "normal" };
}
function display(cell: TemplateCell) {
  if (cell.formula?.includes("[1]")) return "#REF!";
  if (cell.value === null || cell.value === undefined) return cell.editShipment ? "—" : "";
  if (cell.date && typeof cell.value === "string") {
    const date = new Date(`${cell.value}T00:00:00Z`);
    return cell.style.format?.includes("mmm") ? `${date.getUTCDate()}-${date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}-${String(date.getUTCFullYear()).slice(-2)}` : `${String(date.getUTCDate()).padStart(2, "0")} ${String(date.getUTCMonth()+1).padStart(2,"0")} ${String(date.getUTCFullYear()).slice(-2)}`;
  }
  if (typeof cell.value === "number") {
    const format = cell.style.format ?? "General", decimals = format.match(/0\.(0+)/)?.[1].length;
    return cell.value.toLocaleString("en-ZA", { useGrouping: format.includes("#,##"), ...(decimals !== undefined ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : format === "General" ? { maximumFractionDigits: 12 } : { maximumFractionDigits: 0 }) });
  }
  return cell.value;
}
export function CeramicTemplateTable({ sheet, onEdit }: { sheet: TemplateSheet; onEdit: (shipmentId: string) => void }) {
  return <div className="max-w-full overflow-x-auto rounded-lg border border-[var(--card-border)] bg-white p-1" aria-label={`${sheet.name} spreadsheet`}>
    <table className="border-collapse" style={{ tableLayout: "fixed", width: sheet.columns.reduce((a,b) => a+b,0) }}><colgroup>{sheet.columns.map((width,i)=><col key={i} style={{width}} />)}</colgroup>
      <tbody>{sheet.rows.map((row,ri)=><tr key={ri} style={{ height: `${row.height}pt` }}>{row.cells.map((cell,ci)=>cell.covered ? null : <td key={ci} colSpan={cell.span} style={styleFor(cell.style)} title={cell.formula ? `=${cell.formula}` : String(cell.value ?? "")}>
        {cell.editShipment ? <button type="button" className="h-full w-full text-inherit underline decoration-dotted underline-offset-2" style={{textAlign:"inherit",font:"inherit"}} aria-label={`Edit amounts for ${cell.editLabel ?? "shipment"}`} onClick={()=>onEdit(cell.editShipment!)}>{display(cell)}</button> : <span style={cell.style["table-cell-properties"]?.["rotation-angle"] === "90" ? { writingMode:"vertical-rl", transform:"rotate(180deg)" } : undefined}>{display(cell)}</span>}
      </td>)}</tr>)}</tbody>
    </table>
  </div>;
}

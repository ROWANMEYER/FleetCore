import type { TemplateSheet, TemplateStyle } from "./templateWorkbook";
import { ceramicExternalTarget } from "./templateWorkbook";

function excelStyle(style: TemplateStyle) {
  const cell = style["table-cell-properties"] ?? {}, font = style["text-properties"] ?? {}, paragraph = style["paragraph-properties"] ?? {};
  const border: Record<string, { style: "thin" | "medium"; color: { argb: string } }> = {};
  for (const edge of ["top", "bottom", "left", "right"]) {
    const rule = cell[`border-${edge}`] ?? cell.border;
    if (rule && rule !== "none") border[edge] = { style: rule.startsWith("2pt") ? "medium" : "thin", color: { argb: (rule.match(/#[0-9A-Fa-f]{6}/)?.[0] ?? "#000000").slice(1) } };
  }
  return { font: { name: font["font-name"] ?? "Arial", size: parseFloat(font["font-size"] ?? "10"), bold: font["font-weight"] === "bold", color: { argb: (font.color ?? "#000000").slice(1) } },
    ...(cell["background-color"] && cell["background-color"] !== "transparent" ? { fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: cell["background-color"].slice(1) } } } : {}), border,
    alignment: { vertical: cell["vertical-align"] === "middle" ? "middle" as const : "bottom" as const,
      horizontal: paragraph["text-align"] === "center" ? "center" as const : paragraph["text-align"] === "end" ? "right" as const : "left" as const,
      wrapText: cell["wrap-option"] === "wrap", textRotation: Number(cell["rotation-angle"] ?? 0) }, numFmt: style.format ?? "General" };
}
/** Retain a real workbook link, rather than replacing the owner's January formulas. */
export async function preserveCeramicExternalLink(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const { default: JSZip } = await import("jszip"); const zip = await JSZip.loadAsync(bytes);
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main", rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  let workbook = await zip.file("xl/workbook.xml")!.async("string");
  workbook = workbook.replace(/<calcPr\b/, '<externalReferences><externalReference r:id="ceramicJanuaryLink"/></externalReferences><calcPr');
  if (!workbook.includes('r:id="ceramicJanuaryLink"')) workbook = workbook.replace('</workbook>', '<externalReferences><externalReference r:id="ceramicJanuaryLink"/></externalReferences></workbook>');
  zip.file("xl/workbook.xml", workbook);
  const relationPath = "xl/_rels/workbook.xml.rels";
  zip.file(relationPath, (await zip.file(relationPath)!.async("string")).replace('</Relationships>', `<Relationship Id="ceramicJanuaryLink" Type="${rel}/externalLink" Target="externalLinks/externalLink1.xml"/></Relationships>`));
  zip.file("xl/externalLinks/externalLink1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><externalLink xmlns="${ns}" xmlns:r="${rel}"><externalBook r:id="rId1"><sheetNames><sheetName val="Sheet1"/></sheetNames><sheetDataSet><sheetData sheetId="0" refreshError="1"/></sheetDataSet></externalBook></externalLink>`);
  zip.file("xl/externalLinks/_rels/externalLink1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/externalLinkPath" Target="${ceramicExternalTarget}" TargetMode="External"/></Relationships>`);
  zip.file("[Content_Types].xml", (await zip.file("[Content_Types].xml")!.async("string")).replace('</Types>', '<Override PartName="/xl/externalLinks/externalLink1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml"/></Types>'));
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}
export async function ceramicTemplateExcel(sheets: TemplateSheet[]): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs"); const workbook = new ExcelJS.Workbook();
  workbook.creator = "FleetCore"; workbook.calcProperties.fullCalcOnLoad = true;
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name, { views: [{ showGridLines: true }] });
    sheet.columns.forEach((px, i) => { ws.getColumn(i + 1).width = (px - 5) / 7; });
    sheet.rows.forEach((row, ri) => { const target = ws.getRow(ri + 1); target.height = row.height;
      row.cells.forEach((cell, ci) => { if (cell.covered) return; const out = target.getCell(ci + 1); out.style = excelStyle(cell.style);
        if (cell.span > 1) ws.mergeCells(ri + 1, ci + 1, ri + 1, ci + cell.span);
        if (cell.formula) out.value = { formula: cell.formula, result: cell.formula.includes("[1]") ? { error: "#REF!" } : typeof cell.value === "number" ? cell.value : undefined };
        else if (cell.date && typeof cell.value === "string") out.value = new Date(`${cell.value}T00:00:00Z`);
        else out.value = cell.value === "" ? null : cell.value ?? null;
      });
    });
    if (!sheet.name.startsWith("Locals_")) ws.autoFilter = { from: { row: 9, column: 1 }, to: { row: sheet.rows.length - 5, column: 32 } };
  }
  const bytes = await workbook.xlsx.writeBuffer();
  return preserveCeramicExternalLink(new Uint8Array(bytes).buffer);
}

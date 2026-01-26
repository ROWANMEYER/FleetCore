import { calculateLoadAmount } from "../utils";

// Helper to format currency (ZAR)
const formatZAR = (value: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(value);

// Helper for unit mapping
const unitMap: Record<string, string> = {
  tons: "t",
  pallets: "pallets",
  bales: "bales",
  bags: "bags",
};

interface RenderProps {
  data: {
    loads: any[];
    summary: {
      totalLoads: number;
      totalKm: number;
      totalRevenue: number;
    };
  };
  startDate: string;
  endDate: string;
  activeColumns: string[];
  columnNotes: { column: string; note: string }[];
}

const COLUMN_DEFINITIONS: Record<string, { label: string; field?: string; align?: string; getValue?: (row: any) => string }> = {
  date: { label: "Date", field: "routeDate" },
  truck: { label: "Truck", field: "truckFleetNo" },
  trailer: { label: "Trailer", field: "trailerFleetNo" },
  driver: { label: "Driver", field: "driverName" },
  client: { label: "Client", field: "clientName" },
  from: { 
    label: "From", 
    getValue: (row) => Array.isArray(row.fromLocation) ? row.fromLocation.join(" → ") : row.fromLocation 
  },
  to: { 
    label: "To", 
    getValue: (row) => Array.isArray(row.toLocation) ? row.toLocation.join(" → ") : row.toLocation 
  },
  rate: { 
    label: "Rate", 
    align: "right",
    getValue: (row) => formatZAR(row.rate || 0) 
  },
  distance: {
    label: "Distance",
    getValue: (row) => row.distance ? `${row.distance} km` : "-"
  },
  notes: { 
    label: "Notes", 
    getValue: (row) => row.notes || "—"
  }
};

export function renderTransportReport({
  data,
  startDate,
  endDate,
  activeColumns,
  columnNotes,
}: RenderProps): string {
  
  // 1. Build Table Headers
  const tableHeaders = activeColumns.map(colKey => {
    const def = COLUMN_DEFINITIONS[colKey];
    if (!def) return "";
    const style = def.align === "right" ? "text-align: right;" : "text-align: left;";
    return `<th style="background-color: #f4f4f4; padding: 8px; border: 1px solid #ddd; ${style}">${def.label}</th>`;
  }).join("");

  // 2. Build Table Rows
  const tableRows = data.loads.map((load: any) => {
    const cells = activeColumns.map(colKey => {
      const def = COLUMN_DEFINITIONS[colKey];
      if (!def) return "";
      
      let value = "";
      if (def.getValue) {
        value = def.getValue(load);
      } else if (def.field) {
        value = load[def.field] || "";
      }

      const style = `padding: 8px; border: 1px solid #ddd; white-space: nowrap; ${def.align === "right" ? "text-align: right;" : ""}`;
      return `<td style="${style}">${value}</td>`;
    }).join("");

    return `<tr>${cells}</tr>`;
  }).join("");

  // 3. Build Column Notes Section
  const notesSection = columnNotes.length > 0 
    ? `
      <div style="margin-top: 20px; padding: 10px; background-color: #fff8e1; border: 1px solid #ffe0b2; border-radius: 4px;">
        <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #f57f17;">Report Notes</h4>
        <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #5d4037;">
          ${columnNotes.map(n => {
            const label = COLUMN_DEFINITIONS[n.column]?.label || n.column;
            return `<li><strong>${label}:</strong> ${n.note}</li>`;
          }).join("")}
        </ul>
      </div>
    ` 
    : "";

  // 4. Full Template
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Transport Report</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th { background-color: #f4f4f4; text-align: left; padding: 8px; border: 1px solid #ddd; }
            .summary { margin-top: 30px; padding: 15px; background-color: #f9f9f9; border: 1px solid #eee; }
            .header { margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .footer { margin-top: 40px; font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 10px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h2>Transport Report</h2>
            <p><strong>Period:</strong> ${startDate} to ${endDate}</p>
        </div>

        <table>
            <thead>
                <tr>
                    ${tableHeaders}
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>

        ${notesSection}

        <div class="summary">
            <h3>Summary</h3>
            <table style="width: auto;">
                <tr>
                    <td style="border: none; padding: 5px 15px 5px 0;"><strong>Total Loads:</strong></td>
                    <td style="border: none; padding: 5px;">${data.summary.totalLoads}</td>
                </tr>
                <tr>
                    <td style="border: none; padding: 5px 15px 5px 0;"><strong>Total Distance:</strong></td>
                    <td style="border: none; padding: 5px;">${data.summary.totalKm} km</td>
                </tr>
                <tr>
                    <td style="border: none; padding: 5px 15px 5px 0;"><strong>Total Revenue:</strong></td>
                    <td style="border: none; padding: 5px;">${formatZAR(Number(data.summary.totalRevenue))}</td>
                </tr>
            </table>
        </div>

        <hr style="margin-top:24px;margin-bottom:16px;" />

        <div style="font-size:13px;line-height:1.6;color:#333;">
          <strong>Rowan Meyer</strong><br/>
          Anton Le Roux Vervoer<br/>
          2 Meul Straat<br/>
          George Industria<br/>
          George, 6536<br/>
          📞 063 257 0340<br/>
          📞 044 874 2292<br/>
          ✉️ <a href="mailto:rowan@alrpt.co.za">rowan@alrpt.co.za</a><br/>
          🌐 <a href="https://antonlerouxvervoer.co.za">antonlerouxvervoer.co.za</a>
        </div>
    </body>
    </html>
  `;
}

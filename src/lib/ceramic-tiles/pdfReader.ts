/**
 * Read text from a PDF entirely in the user's browser. No external extraction API.
 *
 * PDF.js text runs are positioned rather than guaranteed to be line-delimited.
 * Recreate reading order using each run's Y/X coordinates before handing text
 * to the pure SAP shipment parser.
 */
type PositionedRun = { x: number; y: number; width: number; text: string };

function renderLines(runs: PositionedRun[]): string[] {
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; runs: PositionedRun[] }[] = [];
  for (const run of sorted) {
    const last = lines[lines.length - 1];
    // A page's text can contain fonts with slightly different baselines.
    if (last && Math.abs(last.y - run.y) <= 2.5) {
      last.runs.push(run);
    } else {
      lines.push({ y: run.y, runs: [run] });
    }
  }
  return lines.map((line) => {
    const parts = line.runs.sort((a, b) => a.x - b.x);
    let result = "";
    let rightEdge = -Infinity;
    for (const part of parts) {
      const text = part.text.trim();
      if (!text) continue;
      if (result) {
        // Always separate PDF text runs: an item may contain "Order No."
        // and the next may contain the value, regardless of their x gap.
        result += " ";
      }
      result += text;
      rightEdge = Math.max(rightEdge, part.x + part.width);
    }
    void rightEdge;
    return result.replace(/\s+/g, " ").trim();
  }).filter(Boolean);
}

export async function extractCeramicPdfText(file: File): Promise<string> {
  if (file.size === 0) throw new Error("Empty file.");
  if (file.size > 20 * 1024 * 1024) throw new Error("PDF exceeds the 20 MB limit.");
  if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== "application/pdf")) {
    throw new Error("Only PDF files are supported.");
  }

  // Lazy-load the browser/webpack entry only after a PDF is selected. This
  // entry bundles the matching PDF.js worker, avoiding a version-mismatched
  // CDN worker and keeping document contents on the user's device.
  const pdfjs = await import("pdfjs-dist/webpack.mjs");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
  const document = await task.promise;
  try {
    if (document.numPages > 100) throw new Error("PDF has too many pages (max 100).");
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const runs: PositionedRun[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !("transform" in item)) continue;
        const text = item.str;
        if (!text.trim()) continue;
        runs.push({
          text,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
        });
      }
      pages.push(renderLines(runs).join("\n"));
      page.cleanup();
    }
    const text = pages.join("\n");
    if (!text.trim()) throw new Error("This PDF contains no selectable text. Scanned PDFs are not supported yet.");
    return text;
  } finally {
    await task.destroy();
  }
}

export async function hashCeramicPdf(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

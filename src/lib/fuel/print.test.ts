import { describe, expect, it } from "vitest";
import { fuelHistoryPrintHtml, type PrintableComparison, type PrintableFuelRow } from "./print";
import { DASH } from "./display";

/** A fixed print moment, so the document is a function of its inputs alone. */
const PRINTED_AT = new Date(2026, 8, 28, 9, 30);

/** A record with its movement already worked out, the way the query returns one. */
function row(over: Partial<PrintableFuelRow> & { _id: string; effectiveDate: string; pricePerLitre: number }): PrintableFuelRow {
  return {
    notes: "",
    change: null,
    percentChange: null,
    carriedPercent: null,
    ...over,
  };
}

const HISTORY: PrintableFuelRow[] = [
  row({
    _id: "a",
    effectiveDate: "2026-07-01",
    pricePerLitre: 26.94,
    compositionPercent: 40,
    change: 0.59,
    percentChange: 2.23885816756644,
    carriedPercent: 0.89554326702658,
  }),
  row({
    _id: "b",
    effectiveDate: "2026-08-05",
    pricePerLitre: 28.17,
    compositionPercent: 55,
    change: 1.23,
    percentChange: 4.5657,
    carriedPercent: 2.51113,
  }),
  row({
    _id: "c",
    effectiveDate: "2026-09-02",
    pricePerLitre: 31.32,
    compositionPercent: 55,
    change: 3.15,
    percentChange: 11.1814,
    carriedPercent: 6.14977,
  }),
];

const print = (over: Partial<Parameters<typeof fuelHistoryPrintHtml>[0]> = {}) =>
  fuelHistoryPrintHtml({ rows: HISTORY, newestFirst: true, printedAt: PRINTED_AT, ...over });

/**
 * The table body on its own.
 *
 * The summary sits above the table and quotes the latest price, so a search over
 * the whole document finds that figure before the first row is drawn. Ordering
 * assertions have to look at the rows, not the document.
 */
function tableBody(html: string): string {
  const body = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));
  expect(body.length).toBeGreaterThan(0);
  return body;
}

const COMPARISON: PrintableComparison = {
  fromKey: "2026-08",
  toKey: "2026-09",
  baseline: { label: "Aug 2026", price: 28.17, row: { effectiveDate: "2026-08-05" } },
  comparison: { label: "Sept 2026", price: 31.32, row: { effectiveDate: "2026-09-02" } },
  randDifference: 3.15,
  dieselPercentChange: 11.1814,
};

describe("fuelHistoryPrintHtml", () => {
  it("prints every record, whatever the direction of the read", () => {
    for (const newestFirst of [true, false]) {
      const html = print({ newestFirst });
      expect(html).toContain("26,94");
      expect(html).toContain("28,17");
      expect(html).toContain("31,32");
    }
  });

  it("follows the reader's sort order rather than imposing one", () => {
    const newest = tableBody(print({ newestFirst: true }));
    const oldest = tableBody(print({ newestFirst: false }));
    expect(newest.indexOf("31,32")).toBeLessThan(newest.indexOf("26,94"));
    expect(oldest.indexOf("26,94")).toBeLessThan(oldest.indexOf("31,32"));
    // The same rows either way, so a reversed table never becomes a shorter one.
    expect(print({ newestFirst: true })).toContain("Listed newest first");
    expect(print({ newestFirst: false })).toContain("Listed oldest first");
  });

  it("sums up the newest record no matter which way the rows are read", () => {
    // The headline is worked out chronologically, so flipping the sort is a
    // reading convenience and cannot change what the page claims is latest.
    for (const newestFirst of [true, false]) {
      const html = print({ newestFirst });
      expect(html).toContain("Latest diesel price");
      expect(html).toContain("R 31,32");
      expect(html).toContain("+11,18%");
      expect(html).toContain("+6,15%");
    }
  });

  it("marks exactly one row as the latest", () => {
    const html = print();
    expect(html.match(/class="tag">Latest</g)).toHaveLength(1);
    // The marker sits on the 2 September row, not on the first row drawn.
    const rowStart = html.indexOf("<tr class=\"latest\">");
    expect(html.slice(rowStart)).toContain("02 Sept 2026");
  });

  it("keeps a direction readable without colour, so a greyscale print still works", () => {
    const html = print();
    // Each of the three moves prints one arrow beside its signed rand figure,
    // with the percentage on the line under it. The sign alone would already be
    // unambiguous here, so the arrow is there for the rows that come back with
    // a whole number: "+1,00%" is a rise, "-1,00%" is a fall, and neither
    // depends on the ink being orange.
    expect(html.match(/▲/g)).toHaveLength(3);
    expect(html).toContain("▲ +R 0,59");
    expect(html).toContain("▲ +R 1,23");
    expect(html).toContain("▲ +R 3,15");
  });

  it("points a fall down rather than leaving the sign to carry it alone", () => {
    const falling = print({
      rows: [
        row({
          _id: "a",
          effectiveDate: "2026-07-01",
          pricePerLitre: 30,
          change: null,
          percentChange: null,
        }),
        row({
          _id: "b",
          effectiveDate: "2026-08-05",
          pricePerLitre: 28.17,
          change: -1.83,
          percentChange: -6.0967,
          carriedPercent: -3.35318,
        }),
      ],
    });
    expect(falling).toContain("▼ -R 1,83");
    expect(falling).toContain("-6,10%");
  });

  it("prints a dash, not a zero, for a record with no earlier price to move against", () => {
    const firstOnly: PrintableFuelRow[] = [
      row({ _id: "only", effectiveDate: "2026-01-06", pricePerLitre: 22.72 }),
    ];
    const html = print({ rows: firstOnly, newestFirst: true });
    expect(html).toContain(DASH);
    // A fabricated movement of zero would be a claim the prices do not support.
    expect(html).not.toContain("+0,00%");
    expect(html).not.toContain("-R");
    expect(html).toContain("No earlier price to compare against");
  });

  it("distinguishes an unrecorded composition from a composition of zero", () => {
    const none = print({
      rows: [row({ _id: "x", effectiveDate: "2026-01-06", pricePerLitre: 22.72, notes: "" })],
      newestFirst: true,
    });
    expect(none).toContain("No composition recorded");
    expect(none).not.toContain("0,00%");

    const zero = print({
      rows: [row({ _id: "y", effectiveDate: "2026-01-06", pricePerLitre: 22.72, compositionPercent: 0 })],
      newestFirst: true,
    });
    expect(zero).toContain("at 0,00% composition");
  });

  it("escapes free text, so a note cannot close the cell and run as markup", () => {
    const html = print({
      rows: [
        row({
          _id: "x",
          effectiveDate: "2026-01-06",
          pricePerLitre: 22.72,
          notes: '<script>alert("x")</script> & \'quoted\'',
        }),
      ],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&#39;quoted&#39;");
  });

  it("offers nothing on the page that could change a record", () => {
    const html = print();
    // The screen's delete button has no business on a printout, so the action
    // column is gone rather than printed as an empty heading.
    expect(html).not.toContain("Actions");
    expect(html).not.toContain("<button");
  });

  it("prints the month comparison only when the reader has one open", () => {
    expect(print()).not.toContain("Compare months");
    const withComparison = print({ comparison: COMPARISON });
    expect(withComparison).toContain("Compare months");
    expect(withComparison).toContain("Aug 2026");
    expect(withComparison).toContain("Sept 2026");
    expect(withComparison).toContain("+R 3,15");
    expect(withComparison).toContain("+11,18%");
  });

  it("says so on paper when a comparison month holds no price", () => {
    const html = print({
      comparison: { ...COMPARISON, baseline: null },
    });
    expect(html).toContain("No price recorded in that month.");
    expect(html).toContain(DASH);
  });

  it("stamps when it was printed, off the local date", () => {
    expect(print()).toContain("Printed 28 Sept 2026 at 09:30");
  });

  it("survives an empty history rather than printing a broken table", () => {
    const html = print({ rows: [], newestFirst: true });
    expect(html).toContain("No diesel price recorded yet.");
    expect(html).not.toContain("<tbody>");
    expect(html).toContain("0 prices recorded");
  });

  it("counts one price as one price", () => {
    const html = print({ rows: [HISTORY[0]], newestFirst: true });
    expect(html).toContain("1 price recorded");
    expect(html).not.toContain("1 prices recorded");
  });

  it("degrades to a dash for a moment it cannot read, rather than printing NaN", () => {
    const html = print({ printedAt: new Date("nonsense") });
    expect(html).not.toContain("NaN");
    expect(html).toContain(`Printed ${DASH}`);
  });

  it("agrees with the screen formatters rather than reformatting for itself", () => {
    const html = print();
    // The shared ZAR writer uses a space for thousands and a comma for decimals.
    expect(html).toContain("R 31,32");
    // And a percentage never picks up a currency marker on the way past.
    expect(html).not.toContain("R 11");
    expect(html).not.toContain("%R");
  });
});

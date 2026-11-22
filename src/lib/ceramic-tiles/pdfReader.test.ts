import { describe, expect, it } from "vitest";
import { renderLines } from "./pdfReader";

describe("Ceramic PDF line reconstruction", () => {
  it("joins separate SAP PDF text runs in horizontal order", () => {
    const lines = renderLines([
      { x: 405, y: 550, width: 70, text: "201.50 KG" },
      { x: 230, y: 550.8, width: 170, text: "Order No. : 4502520296" },
      { x: 65, y: 550.9, width: 150, text: "Delivery : 281413185" },
      { x: 65, y: 538, width: 300, text: "Collect @ 1500-Betta Baths Krugersdorp" },
      { x: 65, y: 526, width: 200, text: "Chamdor" },
    ]);
    expect(lines).toEqual([
      "Delivery : 281413185 Order No. : 4502520296 201.50 KG",
      "Collect @ 1500-Betta Baths Krugersdorp",
      "Chamdor",
    ]);
  });

  it("tolerates small baseline shifts on a date row", () => {
    expect(renderLines([
      { x: 258, y: 320, width: 70, text: "20.11.2026" },
      { x: 65, y: 321, width: 175, text: "Planned Loading date :" },
      { x: 375, y: 321, width: 100, text: "Time : 00:00:00" },
    ])).toEqual(["Planned Loading date : 20.11.2026 Time : 00:00:00"]);
  });

  it("does not accidentally merge separate delivery rows", () => {
    const lines = renderLines([
      { x: 65, y: 300, width: 120, text: "Delivery : 111" },
      { x: 65, y: 288, width: 120, text: "Collect @ 1200-Site" },
      { x: 65, y: 276, width: 130, text: "SKU1" },
    ]);
    expect(lines).toHaveLength(3);
  });
});

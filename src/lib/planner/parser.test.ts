import { describe, it, expect } from "vitest";
import {
  parseQuickCapture,
  parseDate,
  resolveParsedClients,
  type CustomerRecord,
} from "./parser";

describe("parseDate", () => {
  it("parses DD/MM/YY", () => {
    expect(parseDate("09/09/26")).toEqual({ date: "2026-09-09" });
  });

  it("parses DD/MM/YYYY", () => {
    expect(parseDate("09/09/2026")).toEqual({ date: "2026-09-09" });
  });

  it("parses DD-MM-YY", () => {
    expect(parseDate("09-09-26")).toEqual({ date: "2026-09-09" });
  });

  it("parses DD.MM.YY", () => {
    expect(parseDate("09.09.26")).toEqual({ date: "2026-09-09" });
  });

  it("parses DD-MM-YYYY", () => {
    expect(parseDate("25-12-2026")).toEqual({ date: "2026-12-25" });
  });

  it("parses DD.MM.YYYY", () => {
    expect(parseDate("01.01.2027")).toEqual({ date: "2027-01-01" });
  });

  it("rejects impossible date 31/02/26", () => {
    const r = parseDate("31/02/26");
    expect(r.error).toBeTruthy();
    expect(r.date).toBe("");
  });

  it("rejects 99/99/26", () => {
    const r = parseDate("99/99/26");
    expect(r.error).toBeTruthy();
  });

  it("rejects non-date string", () => {
    const r = parseDate("hello");
    expect(r.error).toBeTruthy();
  });

  it("handles 28 Feb in leap year", () => {
    expect(parseDate("29/02/28")).toEqual({ date: "2028-02-29" });
  });

  it("rejects 29 Feb in non-leap year", () => {
    const r = parseDate("29/02/27");
    expect(r.error).toBeTruthy();
  });
});

describe("parseQuickCapture — normal loads", () => {
  it("parses a single load line", () => {
    const r = parseQuickCapture("09/09/26\nshaveco x george na kaap");
    expect(r.date).toBe("2026-09-09");
    expect(r.loads).toHaveLength(1);
    expect(r.loads[0].client).toBe("shaveco");
    expect(r.loads[0].fromLocations).toEqual(["George"]);
    expect(r.loads[0].toLocations).toEqual(["Cape Town"]);
    expect(r.loads[0].valid).toBe(true);
  });

  it("parses multiple load lines", () => {
    const r = parseQuickCapture(
      "09/09/26\nshaveco x george na kaap\nmto x george na bredasdorp"
    );
    expect(r.loads).toHaveLength(2);
    expect(r.loads[0].client).toBe("shaveco");
    expect(r.loads[1].client).toBe("mto");
    expect(r.loads[1].toLocations).toEqual(["Bredasdorp"]);
  });

  it("handles case-insensitive delimiters", () => {
    const r = parseQuickCapture("09/09/26\nSHAVECO X GEORGE NA KAAP");
    expect(r.loads[0].valid).toBe(true);
    expect(r.loads[0].client).toBe("SHAVECO");
    expect(r.loads[0].fromLocations).toEqual(["George"]);
    expect(r.loads[0].toLocations).toEqual(["Cape Town"]);
  });

  it("handles repeated whitespace", () => {
    const r = parseQuickCapture("09/09/26\nshaveco   x   george   na   kaap");
    expect(r.loads[0].valid).toBe(true);
    expect(r.loads[0].client).toBe("shaveco");
    expect(r.loads[0].fromLocations).toEqual(["George"]);
    expect(r.loads[0].toLocations).toEqual(["Cape Town"]);
  });

  it("handles leading/trailing spaces", () => {
    const r = parseQuickCapture("09/09/26\n  shaveco x george na kaap  ");
    expect(r.loads[0].valid).toBe(true);
    expect(r.loads[0].client).toBe("shaveco");
  });

  it("multiple pickups with +", () => {
    const r = parseQuickCapture("09/09/26\nshaveco x george+knysna na kaap");
    expect(r.loads[0].fromLocations).toEqual(["George", "Knysna"]);
    expect(r.loads[0].toLocations).toEqual(["Cape Town"]);
  });

  it("multiple deliveries with +", () => {
    const r = parseQuickCapture("09/09/26\nshaveco x george na kaap+stellenbosch");
    expect(r.loads[0].fromLocations).toEqual(["George"]);
    expect(r.loads[0].toLocations).toEqual(["Cape Town", "Stellenbosch"]);
  });

  it("both multiple pickups and deliveries", () => {
    const r = parseQuickCapture(
      "09/09/26\nshaveco x george+knysna na kaap+stellenbosch"
    );
    expect(r.loads[0].fromLocations).toEqual(["George", "Knysna"]);
    expect(r.loads[0].toLocations).toEqual(["Cape Town", "Stellenbosch"]);
  });
});

describe("parseQuickCapture — date edge cases", () => {
  it("skips blank lines before date", () => {
    const r = parseQuickCapture("\n\n09/09/26\nshaveco x george na kaap");
    expect(r.date).toBe("2026-09-09");
    expect(r.loads).toHaveLength(1);
  });

  it("skips blank lines between loads", () => {
    const r = parseQuickCapture(
      "09/09/26\nshaveco x george na kaap\n\nmto x george na kaap"
    );
    expect(r.loads).toHaveLength(2);
  });

  it("rejects missing date", () => {
    const r = parseQuickCapture("shaveco x george na kaap");
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors.some((e) => e.includes("Invalid date format"))).toBe(true);
  });

  it("rejects invalid date", () => {
    const r = parseQuickCapture("hello\nshaveco x george na kaap");
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("parseQuickCapture — malformed lines", () => {
  it("rejects missing x", () => {
    const r = parseQuickCapture("09/09/26\nshaveco george na kaap");
    expect(r.loads[0].valid).toBe(false);
    expect(r.loads[0].errors[0]).toContain('Missing delimiter "x"');
  });

  it("rejects missing na", () => {
    const r = parseQuickCapture("09/09/26\nshaveco x george");
    expect(r.loads[0].valid).toBe(false);
    expect(r.loads[0].errors[0]).toContain('Missing delimiter "na"');
  });

  it("rejects missing client (x at start)", () => {
    const r = parseQuickCapture("09/09/26\nx george na kaap");
    expect(r.loads[0].valid).toBe(false);
    expect(r.loads[0].errors.some((e) => e.includes("Missing client"))).toBe(true);
  });

  it("rejects missing pickup", () => {
    const r = parseQuickCapture("09/09/26\nshaveco x na kaap");
    expect(r.loads[0].valid).toBe(false);
    expect(r.loads[0].errors.some((e) => e.includes("Missing pickup"))).toBe(true);
  });

  it("rejects missing delivery", () => {
    const r = parseQuickCapture("09/09/26\nshaveco x george na");
    expect(r.loads[0].valid).toBe(false);
    expect(r.loads[0].errors.some((e) => e.includes("Missing delivery"))).toBe(true);
  });

  it("rejects na before x", () => {
    const r = parseQuickCapture("09/09/26\nshaveco na kaap x george");
    expect(r.loads[0].valid).toBe(false);
    expect(r.loads[0].errors[0]).toContain('"na" appears before "x"');
  });

  it("rejects george++knysna", () => {
    const r = parseQuickCapture("09/09/26\nshaveco x george++knysna na kaap");
    expect(r.loads[0].valid).toBe(false);
    expect(r.loads[0].errors.some((e) => e.includes("Malformed"))).toBe(true);
  });

  it("retains source line number", () => {
    const r = parseQuickCapture(
      "09/09/26\nshaveco x george na kaap\ninvalid line\nmto x george na kaap"
    );
    expect(r.loads[0].sourceLine).toBe(2);
    expect(r.loads[1].sourceLine).toBe(3);
    expect(r.loads[2].sourceLine).toBe(4);
  });

  it("retains raw text", () => {
    const r = parseQuickCapture("09/09/26\nshaveco x george na kaap");
    expect(r.loads[0].raw).toBe("shaveco x george na kaap");
  });
});

describe("parseQuickCapture — aliases", () => {
  it("resolves kaap → Cape Town", () => {
    const r = parseQuickCapture("09/09/26\nshaveco x george na kaap");
    expect(r.loads[0].toLocations).toEqual(["Cape Town"]);
  });

  it("resolves cpt → Cape Town", () => {
    const r = parseQuickCapture("09/09/26\nshaveco x george na cpt");
    expect(r.loads[0].toLocations).toEqual(["Cape Town"]);
  });

  it("resolves jhb → Johannesburg", () => {
    const r = parseQuickCapture("09/09/26\nshaveco x george na jhb");
    expect(r.loads[0].toLocations).toEqual(["Johannesburg"]);
  });

  it("resolves pe → Gqeberha", () => {
    const r = parseQuickCapture("09/09/26\nshaveco x george na pe");
    expect(r.loads[0].toLocations).toEqual(["Gqeberha"]);
  });

  it("title-cases unknown location", () => {
    const r = parseQuickCapture("09/09/26\nshaveco x wilderness na kaap");
    expect(r.loads[0].fromLocations).toEqual(["Wilderness"]);
  });

  it("preserves known locations as-is", () => {
    const r = parseQuickCapture("09/09/26\nshaveco x George na Knysna");
    expect(r.loads[0].fromLocations).toEqual(["George"]);
    expect(r.loads[0].toLocations).toEqual(["Knysna"]);
  });
});

describe("parseQuickCapture — multiple loads", () => {
  it("each line is independent", () => {
    const r = parseQuickCapture(
      "09/09/26\nshaveco x george na kaap\nmto x george na bredasdorp\ncountrywoods x knysna na george+kaap"
    );
    expect(r.loads).toHaveLength(3);
    expect(r.loads[0].fromLocations).toEqual(["George"]);
    expect(r.loads[1].toLocations).toEqual(["Bredasdorp"]);
    expect(r.loads[2].fromLocations).toEqual(["Knysna"]);
    expect(r.loads[2].toLocations).toEqual(["George", "Cape Town"]);
  });

  it("blank lines between loads are ignored", () => {
    const r = parseQuickCapture(
      "09/09/26\nshaveco x george na kaap\n\n\nmto x george na kaap"
    );
    expect(r.loads).toHaveLength(2);
  });
});

describe("resolveParsedClients", () => {
  const customers: CustomerRecord[] = [
    { name: "Shaveco", normalizedName: "shaveco", isActive: true },
    { name: "MTO", normalizedName: "mto", isActive: true },
    { name: "Countrywoods", normalizedName: "countrywoods", isActive: true },
  ];

  it("resolves exact normalized match", () => {
    const parsed = parseQuickCapture("09/09/26\nshaveco x george na kaap");
    const res = resolveParsedClients(parsed, customers);
    expect(res).toHaveLength(1);
    expect(res[0].status).toBe("matched");
    expect(res[0].resolved).toBe("Shaveco");
  });

  it("resolves case-insensitive match", () => {
    const parsed = parseQuickCapture("09/09/26\nSHAVECO x george na kaap");
    const res = resolveParsedClients(parsed, customers);
    expect(res[0].status).toBe("matched");
    expect(res[0].resolved).toBe("Shaveco");
  });

  it("flags unknown client", () => {
    const parsed = parseQuickCapture("09/09/26\nabc timber x george na kaap");
    const res = resolveParsedClients(parsed, customers);
    expect(res[0].status).toBe("unknown");
    expect(res[0].resolved).toBeUndefined();
  });

  it("flags ambiguous client", () => {
    const ambiguous: CustomerRecord[] = [
      { name: "Shaveco Trucks", normalizedName: "shaveco", isActive: true },
      { name: "Shaveco Logistics", normalizedName: "shaveco", isActive: true },
    ];
    const parsed = parseQuickCapture("09/09/26\nshaveco x george na kaap");
    const res = resolveParsedClients(parsed, ambiguous);
    expect(res[0].status).toBe("ambiguous");
    expect(res[0].candidates).toHaveLength(2);
  });

  it("does not invent customers", () => {
    const parsed = parseQuickCapture("09/09/26\nnonexistent x george na kaap");
    const res = resolveParsedClients(parsed, customers);
    expect(res[0].status).toBe("unknown");
    expect(res[0].resolved).toBeUndefined();
  });

  it("deduplicates same client across multiple loads", () => {
    const parsed = parseQuickCapture(
      "09/09/26\nshaveco x george na kaap\nshaveco x knysna na bredasdorp"
    );
    const res = resolveParsedClients(parsed, customers);
    expect(res).toHaveLength(1);
  });

  it("handles alias that maps to existing customer", () => {
    const aliasCustomers: CustomerRecord[] = [
      { name: "Countrywoods", normalizedName: "countrywoods", isActive: true },
    ];
    const parsed = parseQuickCapture("09/09/26\ncw x george na kaap");
    const res = resolveParsedClients(parsed, aliasCustomers);
    expect(res[0].status).toBe("matched");
    expect(res[0].resolved).toBe("Countrywoods");
  });

  it("excludes inactive customers", () => {
    const inactive: CustomerRecord[] = [
      { name: "Shaveco", normalizedName: "shaveco", isActive: false },
    ];
    const parsed = parseQuickCapture("09/09/26\nshaveco x george na kaap");
    const res = resolveParsedClients(parsed, inactive);
    expect(res[0].status).toBe("unknown");
  });
});

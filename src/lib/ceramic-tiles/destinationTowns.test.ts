import { describe, expect, it } from "vitest";
import { ceramicDestinationMatches, ceramicDestinationChecks, ceramicLaneTowns, ceramicTownName, ceramicDestinationRuleIssues } from "./destinationTowns";
import type { CeramicShipment } from "./parser";
const destination = (name: string, addressLines: string[] = []) => ({ name, addressLines, orders: [] });
const snapshot = (...destinations: CeramicShipment["destinations"]) => ({ shipmentNumber: "SH00130726", version: 1, totalWeightKg: 24934.66, totalPallets: 21, transporter: null, plannedLoadingDate: "2026-11-24", plannedDeliveryDate: "2026-11-30", warnings: [], destinations });
describe("Controlled Ceramic delivery town matching", () => {
  it.each(["MOSSELBAY", "MOSSEL BAY", "MOSSELBAAI", "MBAAI"])("matches %s to the same town in tariff names and PDFs", spelling => {
    expect(ceramicTownName(spelling)).toBe("MOSSEL BAY");
    expect(ceramicDestinationMatches(destination("CTM MOSSELBAAI", ["MOSSEL BAY", "6500"]), `${spelling}/ VOORBAAI`)).toBe(true);
    expect(ceramicDestinationMatches(destination(`CTM ${spelling}`), "MBAAI (SP)")).toBe(true);
  });
  it("does not infer a town from a street or an unrelated partial spelling", () => {
    expect(ceramicDestinationMatches(destination("EXAMPLE STORE", ["12 Mossel Bay Road", "CAPE TOWN"]), "MOSSELBAY")).toBe(false);
    expect(ceramicDestinationMatches(destination("MOSSELBAYOU STORE"), "MOSSELBAY")).toBe(false);
    expect(ceramicDestinationMatches(destination("GEOGRAPHY STORE"), "GEO")).toBe(false);
  });
  it("uses explicit agreed coverage while leaving the printed tariff title intact", () => {
    const label="MOSSELBAY/ VOORBAAI";
    expect(ceramicLaneTowns(label)).toEqual(["MOSSEL BAY", "VOORBAAI"]);
    expect(ceramicDestinationMatches(destination("BUILD IT OUDTSHOORN"),label)).toBe(false);
    expect(ceramicDestinationMatches(destination("BUILD IT OUDTSHOORN"),label,["MOSSEL BAY","OUDTSHOORN"])).toBe(true);
    expect(ceramicDestinationMatches(destination("CTM GEORGE"),label,["OUDTSHOORN"])).toBe(false);
    expect(label).toBe("MOSSELBAY/ VOORBAAI");
  });
  it("checks each stop and keeps Oudtshoorn unmatched until its tariff is explicitly agreed", () => {
    const s=snapshot(destination("CTM GEORGE"),destination("CTM MOSSELBAAI"),destination("BUILD IT OUDTSHOORN"),destination("UNKNOWN STORE"));
    expect(ceramicDestinationChecks(s,[{destination:"GEORGE"},{destination:"MOSSELBAY/ VOORBAAI"}])).toEqual([
      {destination:"CTM GEORGE",towns:["GEORGE"],matched:true,tariffs:["GEORGE"]},
      {destination:"CTM MOSSELBAAI",towns:["MOSSEL BAY"],matched:true,tariffs:["MOSSELBAY/ VOORBAAI"]},
      {destination:"BUILD IT OUDTSHOORN",towns:["OUDTSHOORN"],matched:false,tariffs:[]},
      {destination:"UNKNOWN STORE",towns:[],matched:false,tariffs:[]},
    ]);
  });
  it("flags older confirmed Mossel Bay bills without changing them or other saved bills", () => {
    const s=snapshot(destination("CTM MOSSELBAAI")), old={automation:{status:"confirmed"}};const before=structuredClone(old);
    expect(ceramicDestinationRuleIssues(s,old)).toHaveLength(1);expect(old).toEqual(before);
    expect(ceramicDestinationRuleIssues(s,{automation:{status:"confirmed",destinationMatchVersion:1}})).toEqual([]);
    expect(ceramicDestinationRuleIssues(s,{automation:{status:"needs_review"}})).toEqual([]);
    expect(ceramicDestinationRuleIssues(snapshot(destination("CTM GEORGE")),old)).toEqual([]);
  });
});

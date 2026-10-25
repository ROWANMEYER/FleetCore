import { describe, expect, it } from "vitest";
import { buildQuickMessage, isoWeek, weekProblem, type MessageOptions } from "./message";

const data: MessageOptions = {
  template: "standard", driver: { name: "Example Driver", idNumber: "ID123", phone: "0710000000" },
  truck: { fleetNo: "56", registration: "CAW19039" },
  trailer: { fleetNo: "69", trailers: [
    { length: "12m", registration: "REG12" }, { length: "6m", registration: "REG6" },
  ] }, week: "43", location: "Lesotho", shunter: false, loadNumber: "2", totalLoads: "10", eta: "14:00", notes: "Call on arrival",
};

describe("QuickSend messages", () => {
  it("matches the APK standard format using driver identity and trailer lengths", () => {
    expect(buildQuickMessage(data)).toBe([
      "DRIVER: Example Driver", "ID: ID123", "CELL: 0710000000", "TRUCK: 56", "REG: CAW19039",
      "TRAILER: 69", "6M: REG6", "12M: REG12", "NOTES Call on arrival", "",
    ].join("\n"));
  });
  it("includes week, destination, load count, shunter and ETA in Week Format", () => {
    const message = buildQuickMessage({ ...data, template: "week", shunter: true });
    expect(message).toContain("WEEK 43\n\nLESOTHO\nTYPE: SHUNTER\n\nVRAG: 2/10");
    expect(message).toContain("ETA 14:00\nNOTES Call on arrival");
  });
  it("does not include shunter for standard trips", () => {
    expect(buildQuickMessage({ ...data, template: "week" })).not.toContain("TYPE: SHUNTER");
  });
  it("uses a dash when a personal ID or registration is absent", () => {
    const message = buildQuickMessage({ ...data, driver: { name: "Example" }, trailer: { fleetNo: "1", trailers: [] } });
    expect(message).toContain("ID: -\nCELL: -");
    expect(message).toContain("6M: -\n12M: -");
  });
  it("validates the week and load counts", () => {
    expect(weekProblem("43", "2", "10")).toBe("");
    for (const week of ["", "0", "54", "1.5"]) expect(weekProblem(week, "1", "2")).not.toBe("");
    for (const pair of [["", "10"], ["0", "2"], ["3", "2"], ["1.5", "2"]]) expect(weekProblem("43", ...pair as [string, string])).not.toBe("");
  });
  it("uses ISO week-year boundaries", () => {
    expect(isoWeek(new Date(2021, 0, 1))).toBe(53);
    expect(isoWeek(new Date(2021, 0, 4))).toBe(1);
    expect(isoWeek(new Date(2025, 11, 29))).toBe(1);
  });
});

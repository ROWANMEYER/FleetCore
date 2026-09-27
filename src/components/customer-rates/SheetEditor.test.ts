import { describe, expect, it } from "vitest";
import { sameState } from "@/convex/rateSheets";
import { formKey, laneProblem, type DraftLane } from "./SheetEditor";

const lane = (patch: Partial<DraftLane> = {}): DraftLane => ({ key: "row-1", id: "", loadingPoint: "George", destination: "Cape Town", pricingUnit: "", rate: "1500", ...patch });

describe("laneProblem", () => {
  it("accepts a complete lane", () => {
    expect(laneProblem(lane())).toBeNull();
  });
  it("rejects a brand new empty row, which is what a half finished lane looks like", () => {
    expect(laneProblem(lane({ loadingPoint: "", destination: "" }))).toBe("needs a loading point and a destination");
  });
  it("rejects a lane missing only its destination", () => {
    expect(laneProblem(lane({ destination: "  " }))).toBe("needs a loading point and a destination");
  });
  it("rejects a lane missing only its loading point", () => {
    expect(laneProblem(lane({ loadingPoint: "" }))).toBe("needs a loading point and a destination");
  });
  it("treats whitespace as missing rather than as a real name", () => {
    expect(laneProblem(lane({ loadingPoint: "   ", destination: "Cape Town" }))).toBe("needs a loading point and a destination");
  });
  it("allows a rate of zero but not a negative one", () => {
    expect(laneProblem(lane({ rate: "0" }))).toBeNull();
    expect(laneProblem(lane({ rate: "-1" }))).toBe("needs a rate of zero or more");
  });
  it("rejects a rate that is not a number", () => {
    expect(laneProblem(lane({ rate: "abc" }))).toBe("needs a rate of zero or more");
    expect(laneProblem(lane({ rate: "" }))).toBe("needs a rate of zero or more");
  });
});

describe("formKey", () => {
  const form = (patch: Partial<Parameters<typeof formKey>[0]> = {}) => ({ effectiveDate: "2026-09-02", notes: "", oldDiesel: "20", newDiesel: "23.15", lanes: [{ loadingPoint: "George", destination: "Cape Town", pricingUnit: "", rate: "1500" }], ...patch });

  it("treats an untouched form as unchanged", () => {
    expect(formKey(form())).toBe(formKey(form()));
  });
  it("ignores lane ids, because the server mints them and would otherwise look like an edit", () => {
    expect(formKey(form())).toBe(formKey(form({ lanes: [{ loadingPoint: "George", destination: "Cape Town", pricingUnit: "", rate: "1500", id: "abc123" } as never] })));
  });
  it("ignores surrounding whitespace, which the server trims anyway", () => {
    expect(formKey(form())).toBe(formKey(form({ lanes: [{ loadingPoint: "  George ", destination: " Cape Town  ", pricingUnit: "", rate: "1500" }] })));
  });
  it("treats a rate written with trailing zeros as unchanged, so a pointless save is not offered", () => {
    expect(formKey(form())).toBe(formKey(form({ lanes: [{ loadingPoint: "George", destination: "Cape Town", pricingUnit: "", rate: "1500.00" }] })));
    expect(formKey(form())).toBe(formKey(form({ oldDiesel: "20.00", newDiesel: "23.150" })));
  });
  it("still sees a real rate change, even one that rounds away", () => {
    expect(formKey(form())).not.toBe(formKey(form({ lanes: [{ loadingPoint: "George", destination: "Cape Town", pricingUnit: "", rate: "1500.01" }] })));
    expect(formKey(form())).not.toBe(formKey(form({ lanes: [{ loadingPoint: "George", destination: "Cape Town", pricingUnit: "", rate: "1499.99" }] })));
  });
  it("sees a change to every field the server compares", () => {
    const base = formKey(form());
    expect(formKey(form({ effectiveDate: "2026-10-01" }))).not.toBe(base);
    expect(formKey(form({ notes: "delivered by email" }))).not.toBe(base);
    expect(formKey(form({ oldDiesel: "21" }))).not.toBe(base);
    expect(formKey(form({ newDiesel: "24" }))).not.toBe(base);
    expect(formKey(form({ lanes: [{ loadingPoint: "George", destination: "Durban", pricingUnit: "", rate: "1500" }] }))).not.toBe(base);
    expect(formKey(form({ lanes: [{ loadingPoint: "George", destination: "Cape Town", pricingUnit: "ton", rate: "1500" }] }))).not.toBe(base);
  });
  it("sees lane order, because that is the order the rates print in", () => {
    const two = { ...form(), lanes: [{ loadingPoint: "George", destination: "Cape Town", pricingUnit: "", rate: "1500" }, { loadingPoint: "George", destination: "Durban", pricingUnit: "", rate: "1600" }] };
    const swapped = { ...two, lanes: [two.lanes[1], two.lanes[0]] };
    expect(formKey(swapped)).not.toBe(formKey(two));
  });
  it("sees an added and a removed lane", () => {
    const base = formKey(form());
    expect(formKey(form({ lanes: [...form().lanes, { loadingPoint: "George", destination: "Durban", pricingUnit: "", rate: "1600" }] }))).not.toBe(base);
    expect(formKey(form({ lanes: [] }))).not.toBe(base);
  });

  // The browser blocks a save it thinks is a no-op, and the server rejects one it thinks is a no-op. If those two ever disagree the user gets an error they cannot act on, so they are checked against each other here.
  describe("agrees with the server about what counts as no change", () => {
    const serverState = (f: Parameters<typeof formKey>[0]) => ({ effectiveDate: f.effectiveDate, notes: f.notes, oldDieselPrice: Number(f.oldDiesel), newDieselPrice: Number(f.newDiesel),
      lanes: f.lanes.map((l, index) => ({ id: `id-${index}`, loadingPoint: l.loadingPoint.trim(), destination: l.destination.trim(), ...(l.pricingUnit ? { pricingUnit: l.pricingUnit as never } : {}), rate: Number(l.rate), sortOrder: index })) });
    const cases: [string, Parameters<typeof formKey>[0], Parameters<typeof formKey>[0]][] = [
      ["identical form", form(), form()],
      ["trailing zeros on the rate", form(), form({ lanes: [{ loadingPoint: "George", destination: "Cape Town", pricingUnit: "", rate: "1500.00" }] })],
      ["trailing zeros on the diesel", form(), form({ oldDiesel: "20.000", newDiesel: "23.1500" })],
      ["whitespace around a lane name", form(), form({ lanes: [{ loadingPoint: " George ", destination: " Cape Town ", pricingUnit: "", rate: "1500" }] })],
      ["a real rate change", form(), form({ lanes: [{ loadingPoint: "George", destination: "Cape Town", pricingUnit: "", rate: "1550" }] })],
      ["a change of one cent", form(), form({ lanes: [{ loadingPoint: "George", destination: "Cape Town", pricingUnit: "", rate: "1500.01" }] })],
      ["a different effective date", form(), form({ effectiveDate: "2026-10-01" })],
      ["added notes", form(), form({ notes: "confirm before printing" })],
      ["a new diesel baseline", form(), form({ newDiesel: "24" })],
      ["a different pricing unit", form(), form({ lanes: [{ loadingPoint: "George", destination: "Cape Town", pricingUnit: "ton", rate: "1500" }] })],
      ["a renamed destination", form(), form({ lanes: [{ loadingPoint: "George", destination: "Mossel Bay", pricingUnit: "", rate: "1500" }] })],
      ["an extra lane", form(), form({ lanes: [...form().lanes, { loadingPoint: "George", destination: "Durban", pricingUnit: "", rate: "1600" }] })],
    ];
    for (const [name, a, b] of cases) {
      it(name, () => {
        expect(formKey(a) === formKey(b)).toBe(sameState(serverState(a), serverState(b)));
      });
    }
  });
});

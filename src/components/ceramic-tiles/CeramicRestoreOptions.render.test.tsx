import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CeramicRestoreOptions } from "./CeramicRestoreOptions";

describe("Ceramic restore choice", () => {
  it("explains the unassigned default and keeps the previous assignment as an explicit alternative", () => {
    const html = renderToStaticMarkup(<CeramicRestoreOptions mode="unassigned" onChange={() => {}} disabled={false} />);
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="unassigned"/);
    expect(html).not.toMatch(/<input[^>]*checked=""[^>]*value="previous_assignment"/);
    expect(html).toContain("Restore previous assignment");
    expect(html).toContain("reports stay inactive");
    expect(html).toContain("Previous amounts remain in history");
  });
  it("keeps both choices disabled during a restore request", () => {
    const html = renderToStaticMarkup(<CeramicRestoreOptions mode="previous_assignment" onChange={() => {}} disabled />);
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="previous_assignment"/);
  });
});

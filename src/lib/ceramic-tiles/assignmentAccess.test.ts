import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { ceramicAssignmentAccess, ceramicErrorMessage } from "./assignmentAccess";

describe("Ceramic assignment access guidance", () => {
  it("permits shared Ceramic dispatch across allocated regions", () => {
    const access = ceramicAssignmentAccess({ role: "regional", region: "eastern_cape" }, "garden_route");
    expect(access).toEqual({ allowed: true, message: "" });
  });
  it("permits admins, a second allocated region and legacy one-region accounts", () => {
    expect(ceramicAssignmentAccess({ role: "admin", region: null }, "garden_route").allowed).toBe(true);
    expect(ceramicAssignmentAccess({ role: "regional", region: "kaap", regions: ["kaap", "durban"] }, "durban").allowed).toBe(true);
    expect(ceramicAssignmentAccess({ role: "regional", region: "garden_route" }, "garden_route").allowed).toBe(true);
  });
  it("requires sign-in but does not require a Ceramic dispatch user to own the load region", () => {
    expect(ceramicAssignmentAccess(null, "garden_route")).toMatchObject({ allowed: false, message: expect.stringContaining("Sign in") });
    expect(ceramicAssignmentAccess({ role: "regional", region: "garden_route", regions: [] }, "garden_route").allowed).toBe(true);
  });
  it("shows intentional Convex application errors in production", () => {
    expect(ceramicErrorMessage(new ConvexError({ code: "CERAMIC_REGION_ACCESS_REQUIRED", message: "Ask your administrator for Garden Route access." }), "fallback")).toBe("Ask your administrator for Garden Route access.");
    expect(ceramicErrorMessage(new ConvexError("Choose a valid planning date."), "fallback")).toBe("Choose a valid planning date.");
  });
  it("keeps a support reference while hiding unexpected server details", () => {
    const error = new Error("[CONVEX M(ceramicTilesMobile:assign)] [Request ID: cb85e59afd6d115b] Server Error secret details Called by client");
    expect(ceramicErrorMessage(error, "Please try again.")).toBe("Please try again. Support reference: cb85e59afd6d115b.");
    expect(ceramicErrorMessage(new Error("private server detail"), "Please try again.")).toBe("Please try again.");
  });
});

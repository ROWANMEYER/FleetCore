import { describe, expect, it } from "vitest";
import { signInDestination, signInPageFor } from "./signInDestination";
describe("Ceramic Tiles sign-in return", () => {
  it("returns to the protected tile destination after signing in", () => {
    expect(signInPageFor("/operations/ceramic-tiles")).toBe("/login?next=ceramic-tiles");
    expect(signInDestination("?next=ceramic-tiles")).toBe("/operations/ceramic-tiles");
  });
  it("keeps existing sign-in behavior and rejects arbitrary redirect destinations", () => {
    expect(signInPageFor("/dashboard")).toBe("/login");
    for (const search of ["", "?next=https://example.com", "?next=//example.com", "?next=/admin", "?next=login"]) expect(signInDestination(search)).toBe("/dashboard");
  });
});

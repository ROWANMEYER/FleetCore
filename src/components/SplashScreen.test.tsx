import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SplashScreen from "./SplashScreen";
import MobileSplashGate from "./MobileSplashGate";
vi.mock("@/src/components/auth/AuthProvider", () => ({ useAuth: () => ({ loading: true }) }));
describe("FleetCore splash", () => {
  it("renders branding as real text and eager optimized artwork", () => {
    const html = renderToStaticMarkup(<SplashScreen ready={false} onComplete={() => {}} />);
    expect(html).toContain("FleetCore</h1>");
    expect(html).toContain("People. Freight. Solutions.");
    expect(html).toContain("fleetcore-road-map.webp");
    expect(html).toContain('loading="eager"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Skip splash screen"');
    expect(html).toContain("Tap anywhere to continue");
  });
  it("mounts the real app while the overlay is still shown", () => {
    const html = renderToStaticMarkup(<MobileSplashGate><main>App content mounted</main></MobileSplashGate>);
    expect(html).toContain("App content mounted");
    expect(html).toContain('inert=""');
    expect(html).toContain("FleetCore is loading");
  });
});

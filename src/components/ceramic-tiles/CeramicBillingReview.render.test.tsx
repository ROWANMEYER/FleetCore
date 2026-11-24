import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Id } from "@/convex/_generated/dataModel";
import { ceramicBillingCalculation, DEFAULT_CERAMIC_BILLING } from "@/src/lib/ceramic-tiles/billing";
import { ceramicDestinationChecks } from "@/src/lib/ceramic-tiles/destinationTowns";
import type { CeramicShipment } from "@/src/lib/ceramic-tiles/parser";
import { CeramicBillingReview } from "./CeramicBillingReview";
const mock=vi.hoisted(()=>({preview:{} as Record<string,unknown>}));
vi.mock("convex/react",()=>({useMutation:()=>vi.fn(),useQuery:()=>mock.preview}));
vi.mock("@/src/components/auth/AuthProvider",()=>({useAuth:()=>({token:"synthetic"})}));
beforeEach(()=>{
 const snapshot:CeramicShipment={shipmentNumber:"SH00130726",version:1,totalWeightKg:1000,totalPallets:1,transporter:null,plannedLoadingDate:null,plannedDeliveryDate:null,warnings:[],destinations:["CTM MOSSELBAAI","BUILD IT OUDTSHOORN"].map((name,i)=>({name,addressLines:[],orders:[{deliveryNumber:String(i),orderNumber:"",weightKg:500,palletsEstimate:0.5,collectFrom:i?"Gryphon Vereeniging":"Samca 1 Babelegi"}]}))};
 const choice={key:"mossel",destination:"MOSSELBAY/ VOORBAAI",loadingPoint:"BABELEGI + KRUGERSDORP + VEREENIGING",effectiveDate:"2026-08-05",ratePerTon:1260.01,matchedDestinations:["CTM MOSSELBAAI"]};
 mock.preview={readOnly:false,routeDate:"2026-11-24",version:1,ruleIssues:[],fingerprint:"new",config:DEFAULT_CERAMIC_BILLING,choices:[choice],selected:choice,saved:null,destinationChecks:ceramicDestinationChecks(snapshot,[choice]),calculation:{...ceramicBillingCalculation(snapshot,1260.01),issues:["Oudtshoorn needs an agreed tariff."]}};
});
describe("Visible Ceramic delivery tariff review",()=>{
 it("shows the selected Mossel Bay price, unmatched Oudtshoorn and review action together",()=>{
  const html=renderToStaticMarkup(<CeramicBillingReview shipmentId={"shipment" as Id<"ceramicShipments">}/>);
  expect(html).toContain("Delivery town checks");expect(html).toContain("MOSSEL BAY");expect(html).toContain("OUDTSHOORN");expect(html).toContain("Needs review");expect(html).toContain("R 1 260,01");expect(html).toContain("Why this rate?");expect(html).toContain("Flag billing for review");expect(html).not.toContain("Confirm &amp; save billing");
 });
 it("waits for compatible backend town checks before allowing a billing save",()=>{
  delete mock.preview.destinationChecks;
  const html=renderToStaticMarkup(<CeramicBillingReview shipmentId={"shipment" as Id<"ceramicShipments">}/>);
  expect(html).toContain("Loading applicable rates and charges");expect(html).not.toContain("Flag billing for review");
 });
});

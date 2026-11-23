import { describe, expect, it } from "vitest";
import { ceramicMonthlyAmounts, ceramicWarehouseWeights } from "./monthlyReport";
import { buildCeramicTemplateSheets, excelTemplateFormula } from "./templateWorkbook";
import { ceramicTemplateExcel } from "./templateExport";
import type { CeramicReportRow } from "./reportExport";
import type { Id } from "@/convex/_generated/dataModel";
import JSZip from "jszip";

const row: CeramicReportRow = { shipmentId:"test-shipment" as Id<"ceramicShipments">, routeId:"test-route" as Id<"dailyRoutes">,
  region:"garden_route",shipmentNumber:"SH00990001",version:1,routeDate:"2026-03-09",driverName:"EXAMPLE DRIVER",truckFleetNo:"100",truckRegistration:"TEST-REG",
  fromLocations:[],toLocations:[],deliveryNumbers:[],weightKg:4000,pallets:2,needsReview:false,locals:[],
  warehouseWeights:[{code:"1100",weightKg:1000},{code:"1600",weightKg:3000}],unmappedWarehouses:[],
  billingSourceVersion:1,billing:{ratePerTon:1000,stops:0,drops:1500,crossBorder:"",load:"",locals:[]} };
describe("Exact monthly Ceramic template",()=>{
  it("uses rate × 34 and allocates the total to warehouse weights without forced rounding",()=>{
    const amounts=ceramicMonthlyAmounts(row.warehouseWeights!,row.billing);
    expect(amounts).toMatchObject({freight:34000,total:35500,loadedWeight:4000,ratePerKg:8.875,invoicePrice:35500,variance:0});
    expect(amounts.allocated.map(w=>w.amount)).toEqual([8875,26625]);
    expect(ceramicMonthlyAmounts(row.warehouseWeights!,{...row.billing!,stops:null}).total).toBeNull();
    expect(ceramicMonthlyAmounts(row.warehouseWeights!,{...row.billing!,ratePerTon:0,stops:0,drops:0}).total).toBe(0);
  });
  it("groups both Cedar/Pivical codes and exposes unknown sources rather than dropping their weight",()=>{
    const result=ceramicWarehouseWeights({shipmentNumber:row.shipmentNumber,version:1,totalWeightKg:40,totalPallets:null,transporter:null,plannedLoadingDate:null,plannedDeliveryDate:null,warnings:[],destinations:[{name:"EXAMPLE",addressLines:[],orders:[
      {deliveryNumber:"1",orderNumber:"1",collectFrom:"1200-Cedar",weightKg:10,palletsEstimate:null},
      {deliveryNumber:"2",orderNumber:"2",collectFrom:"1201-Pivical",weightKg:20,palletsEstimate:null},
      {deliveryNumber:"3",orderNumber:"3",collectFrom:"9999-Unknown",weightKg:10,palletsEstimate:null},
    ]}]}); expect(result.weights.find(w=>w.code==="1200")?.weightKg).toBe(30);expect(result.unmapped).toEqual([{name:"9999-Unknown",weightKg:10}]);
  });
  it("retains all 32 headings, original footer formulas and monthly/local sheet names",()=>{
    const [main,local]=buildCeramicTemplateSheets([row],"2026-03");
    expect(main.name).toBe("March_2026");expect(local.name).toBe("Locals_March_2026");expect(main.columns).toHaveLength(32);
    expect(main.rows[8].cells[8].value).toBe("BETTA(1100)");expect(main.rows[8].cells[31].value).toBe("Varience");
    expect(main.rows[10].cells[24]).toMatchObject({formula:"H11*34",value:34000});
    expect(main.rows[10].cells[11].formula).toBe("AC11*K11");expect(main.rows[10].cells[15].formula).toBe("AC11*O11");expect(main.rows[10].cells[17].formula).toBe("AC11*Q11");
    expect(main.rows[10].cells[30].value).toBe(35500);expect(main.rows[10].cells[31].value).toBe(0);
    expect(main.rows[55].cells[27]).toMatchObject({formula:"SUBTOTAL(109,AB10:AB55)",value:35500});
    expect(main.rows[56].cells[29]).toMatchObject({formula:"AD56*0.15",value:600});
    expect(main.rows[57].cells[29]).toMatchObject({formula:"SUBTOTAL(109,AD10:AD57)",value:8600});
    expect(main.rows[59].cells[3].formula).toBe("SUBTOTAL(103,[1]Sheet1!$D$10:$D$83)");
    expect(main.rows[59].cells[31].formula).toBe("SUBTOTAL(103,[1]Sheet1!$AF$10:$AF$83)");
    expect(local.rows[25].cells[5].formula).toBe("SUM(F4:F25)");
  });
  it("extends rows and totals beyond the original capacity without dropping shipments or locals",()=>{
    const rows=Array.from({length:60},(_,i)=>({...row,shipmentId:`shipment-${i}` as Id<"ceramicShipments">,shipmentNumber:`SH${String(i).padStart(8,"0")}`,locals:[{key:`local-${i}`,kind:"delivery" as const,name:"Cashbuild",address:"George",weightKg:1,pallets:null,deliveryNumbers:[]}],billing:{...row.billing!,locals:[{key:`local-${i}`,from:"GEO",to:"GEO",price:2700}]}}));
    const [main,local]=buildCeramicTemplateSheets(rows,"2026-11");expect(main.rows).toHaveLength(75);expect(local.rows).toHaveLength(64);
    expect(main.rows[70].cells[27].formula).toBe("SUBTOTAL(109,AB10:AB70)");
    expect(main.rows[70].cells[27].value).toBe(35500*60);expect(local.rows[63].cells[5]).toMatchObject({formula:"SUM(F4:F63)",value:2700*60});
    expect(main.rows[69].cells[1].value).toBe("SH00000059");
  });
  it("does not copy historical shipment data into empty exports",()=>{
    const sheets=buildCeramicTemplateSheets([],"2026-11");const json=JSON.stringify(sheets);
    expect(json).not.toContain("SH00118792");expect(json).not.toContain("RUFUS");expect(sheets[0].rows[10].cells[1].value).toBeUndefined();
  });
  it("always displays local trips as GEORGE to GEORGE and preserves local prices", () => {
    const local = { key: "local-1", kind: "delivery" as const, name: "Cashbuild", address: "George", weightKg: 100, pallets: 1, deliveryNumbers: ["1"] };
    const sheets = buildCeramicTemplateSheets([{ ...row, locals: [local], billing: { ...row.billing!, locals: [{ key: local.key, from: "OLD ORIGIN", to: "OLD DESTINATION", price: 2700 }] } }], "2026-03");
    const cells = sheets[1].rows[3].cells;
    expect([cells[3].value, cells[4].value, cells[5].value]).toEqual(["GEORGE", "GEORGE", 2700]);
  });
  it("exports native formulas, styles, dates, merges and a real January workbook link",async()=>{
    const bytes=await ceramicTemplateExcel(buildCeramicTemplateSheets([row],"2026-03"));const zip=await JSZip.loadAsync(bytes);
    const main=await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(main).toContain("<f>H11*34</f>");expect(main).toContain("<f>SUBTOTAL(103,[1]Sheet1!$D$10:$D$83)</f>");
    expect(main).toContain('ref="N8:O8"'); expect(main).toContain('t="e"><f>SUBTOTAL');
    const styles=await zip.file("xl/styles.xml")!.async("string");expect(styles).toContain("FFFF00");
    expect(await zip.file("xl/workbook.xml")!.async("string")).toContain('r:id="ceramicJanuaryLink"');
    expect(await zip.file("xl/externalLinks/_rels/externalLink1.xml.rels")!.async("string")).toContain('TargetMode="External"');
    expect(await zip.file("xl/sharedStrings.xml")!.async("string")).not.toContain("SH00118792");
  });
  it("keeps the original template columns but puts the combined stop charge only in Stops", () => {
    const billing = { ...row.billing!, stops: 200, drops: 1500, crossBorder: "Historical note" };
    const [main] = buildCeramicTemplateSheets([{ ...row, billing }], "2026-03");
    expect(main.rows[10].cells[2]).toMatchObject({ value: "" });
    expect(main.rows[10].cells[2].editShipment).toBeUndefined();
    expect(main.rows[10].cells[25]).toMatchObject({ value: 1700 });
    expect(main.rows[10].cells[26]).toMatchObject({ value: null });
    expect(main.rows[10].cells[26].editShipment).toBeUndefined();
    expect(main.rows[10].cells[27]).toMatchObject({ formula: "Y11+Z11+AA11", value: 35700 });
    expect(main.rows[9].cells[25].value).toBe("Stops");
    expect(main.rows[9].cells[26].value).toBe("Drops");
    expect(billing).toMatchObject({ stops: 200, drops: 1500, crossBorder: "Historical note" });
  });
  it("converts OpenDocument reference syntax without changing formula meaning",()=>expect(excelTemplateFormula("of:=SUBTOTAL(109;[.AD10:.AD57])")).toBe("SUBTOTAL(109,AD10:AD57)"));
});

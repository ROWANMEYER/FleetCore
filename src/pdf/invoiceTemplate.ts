import jsPDF from "jspdf";
import { InvoiceData } from "./types";

const W = 210, H = 297, ML = 20, MR = 190, MT = 15, MB = 15;
const fmtR = (n: number) => { const p = n.toFixed(2).split("."); return `R ${p[0].replace(/\B(?=(\d{3})+(?!\d))/g," ")},${p[1]}`; };
const fmtShort = (d: Date) => d.toLocaleDateString("en-ZA",{day:"2-digit",month:"short",year:"2-digit"});
const fmtLong  = (d: Date) => d.toLocaleDateString("en-ZA",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});
const CO = {name:"ANTON LE ROUX VERVOER",pobox:"POSBUS / BOX 132",city:"GEORGE",postal:"6530",tel:"Tel: 044 8742292",fax:"Fax: 044 8746515",vat:"4130255724",bank:"ABSA GEORGE",acc:"0890000118",branch:"630-114"};

export const generateInvoicePDF = (data: InvoiceData): jsPDF => {
  const doc = new jsPDF({unit:"mm",format:"a4"});
  const sf = (s:"normal"|"bold"|"italic"|"bolditalic",sz:number)=>{doc.setFont("helvetica",s);doc.setFontSize(sz);};
  const sw = (t:string,s:"normal"|"bold"|"italic"|"bolditalic",sz:number)=>{sf(s,sz);return doc.getTextWidth(t);};

  // SECTION 1: PROFORMA
  let y = MT+5;
  sf("bolditalic",11); const proW=sw("PROFORMA","bolditalic",11);
  doc.text("PROFORMA",W/2,y,{align:"center"});
  doc.setLineWidth(0.3); doc.line(W/2-proW/2,y+0.8,W/2+proW/2,y+0.8);
  if(data.copyLabel){sf("bold",8);doc.setTextColor(150,150,150);doc.text(data.copyLabel,MR,y,{align:"right"});doc.setTextColor(0,0,0);}
  y+=9;

  // SECTION 2: Title + invoice box
  sf("bolditalic",15); doc.text("TAX INVOICE / BELASTING FAKTUUR",ML,y);
  sf("bold",13);
  const bW=sw(data.invoiceNumber,"bold",13)+6,bH=8,bX=MR-bW,bY=y-6;
  doc.setLineWidth(1); doc.rect(bX,bY,bW,bH); doc.text(data.invoiceNumber,bX+3,bY+5.5);
  y+=3; doc.setLineWidth(1.5); doc.line(ML,y,MR,y); y+=6;

  // SECTION 3: Company block
  const cx=ML+sw(CO.name,"bolditalic",13)/2,rC=y,rP=y+6,rG=y+12,rZ=y+18;
  sf("bolditalic",13); doc.text(CO.name,ML,rC);
  sf("italic",9); doc.text(CO.pobox,cx-sw(CO.pobox,"italic",9)/2,rP);
  sf("bolditalic",11); doc.text(CO.city,cx-sw(CO.city,"bolditalic",11)/2,rG);
  sf("italic",9); doc.text(CO.postal,cx-sw(CO.postal,"italic",9)/2,rZ);
  const mx=W/2-10;
  sf("bolditalic",11); doc.text("DATUM:",mx,rC); sf("bolditalic",13); doc.text(fmtShort(data.date),mx+20,rC);
  sf("normal",9); doc.text(CO.tel,mx,rP); doc.text(CO.fax,mx,rG);
  const vbX=MR-42,vbY=rP-4;
  doc.setLineWidth(0.5); doc.rect(vbX,vbY,42,15);
  sf("bold",8); doc.text("V.A.T Regd No.",vbX+2,vbY+4.5); doc.text("B.T.W Gereg Nr.",vbX+2,vbY+9);
  sf("bold",9); doc.text(CO.vat,vbX+2,vbY+13.5);
  y=rZ+7; doc.setLineWidth(0.5); doc.line(ML,y,MR,y); y+=5;

  // SECTION 4: TO/AAN + Driver block
  const toY=y,rg=6,cX=ML+10,dX=W/2+5,dLW=30;

  // TO: client name bold + underline
  sf("bold",9); doc.text("TO:",ML,toY);
  sf("bold",10); doc.text(data.client.name,cX,toY);
  doc.setLineWidth(0.3); doc.line(cX,toY+0.8,cX+sw(data.client.name,"bold",10),toY+0.8);

  // AAN: with first address line inline, rest below at 5mm spacing
  sf("bold",9); doc.text("AAN:",ML,toY+rg);
  sf("normal",9);
  const al=(data.client.address||"").split(/[,\n]/).map((s:string)=>s.trim()).filter(Boolean);
  if(al.length>0){
    doc.text(al[0],cX,toY+rg);
    al.slice(1,4).forEach((l:string,i:number)=>doc.text(l,cX,toY+rg+(i+1)*5));
  }
  const addrExtraLines=Math.max(al.length-1,0);
  const abH=rg+addrExtraLines*5+5;

  // Right column vertically centred in the block
  const blockH=Math.max(abH,rg*2+6);
  const drvY=toY+(blockH-rg*2)/2-2;
  sf("normal",9); doc.text("Driver / Drywer:",dX,drvY); sf("bold",9); doc.text(data.lineItems[0]?.driverName||"",dX+dLW,drvY);
  sf("normal",9); doc.text("Trok / Truck:",dX,drvY+rg); sf("bold",9); doc.text(data.lineItems[0]?.truckReg||"",dX+dLW,drvY+rg);
  sf("italic",9); doc.text("BTW nommer:",dX,drvY+rg*2);
  if(data.client.vatNumber){sf("bold",9);doc.text(data.client.vatNumber,dX+dLW,drvY+rg*2);}

  y=toY+blockH; doc.setLineWidth(1); doc.line(ML,y,MR,y); y+=1;

  // SECTION 5: Description box
  const bsH=28,dbB=H-MB-bsH,dbH=dbB-y;
  doc.setLineWidth(0.5); doc.rect(ML,y,MR-ML,dbH);
  let dy=y+7;
  data.lineItems.forEach((item,idx)=>{
    sf("normal",10);
    doc.splitTextToSize(item.description,MR-ML-8).slice(0,2).forEach((l:string)=>{if(dy<dbB-4){doc.text(l,ML+4,dy);dy+=6;}});
    if(idx<data.lineItems.length-1&&dy<dbB-8){doc.setLineWidth(0.2);doc.setDrawColor(180,180,180);doc.line(ML+4,dy,MR-4,dy);doc.setDrawColor(0,0,0);dy+=4;}
  });
  dy+=4;
  const nt=data.lineItems[0]?.notes;
  if(nt&&dy<dbB-8){sf("italic",9);doc.splitTextToSize(nt,MR-ML-8).slice(0,2).forEach((l:string)=>{if(dy<dbB-4){doc.text(l,ML+4,dy);dy+=5.5;}});dy+=3;}
  sf("normal",10);
  if(data.client.contactPerson&&dy<dbB-6){doc.text(data.client.contactPerson,ML+4,dy);dy+=6;}
  if(data.client.phone&&dy<dbB-6){doc.text(data.client.phone,ML+4,dy);dy+=6;}
  if(data.client.email&&dy<dbB-6){doc.text(data.client.email,ML+4,dy);}

  // SECTION 6: Bottom strip
  const sY=H-MB-bsH+4,rH=8;
  doc.setLineWidth(0.5); doc.rect(ML,sY,58,24);
  sf("bolditalic",8); doc.text("ACCOUNT DETAILS:",ML+2,sY+5); doc.text("REKENING BESONDERHEDE:",ML+2,sY+10);
  sf("normal",8); doc.text(CO.bank,ML+2,sY+15); doc.text(CO.acc,ML+2,sY+19); doc.text(CO.branch,ML+2,sY+23);
  const ccX=ML+63;
  sf("bold",8); doc.text("V.A.T",ccX,sY+5); doc.text("B.T.W",ccX,sY+13);
  sf("normal",8); doc.text("@ 15% /",ccX+8,sY+5); doc.text("inclusive",ccX+8,sY+10); doc.text("ingesluit",ccX+8,sY+15);
  const tW=MR-(W/2+10),tX=W/2+10;
  [{top:"Sub Total",bot:"Subtotaal",amt:data.totals.subtotal,bold:false},{top:"inclusive",bot:"ingesluit",amt:data.totals.vatAmount,bold:false},{top:"TOTAL",bot:"TOTAAL",amt:data.totals.totalAmount,bold:true}]
    .forEach((r,i)=>{const ry=sY+i*rH;doc.setLineWidth(0.5);doc.rect(tX,ry,tW,rH);sf("normal",8);doc.text(r.top,tX+2,ry+3.5);sf("normal",7);doc.text(r.bot,tX+2,ry+7);sf(r.bold?"bold":"normal",r.bold?10:8);doc.text(fmtR(r.amt),MR-2,ry+5.5,{align:"right"});});

  sf("bolditalic",9); doc.text(fmtLong(data.date),ML,H-MB+8);
  sf("normal",7); doc.setTextColor(150,150,150); doc.text("Page 1 of 1",MR,H-MB+8,{align:"right"}); doc.setTextColor(0,0,0);
  return doc;
};

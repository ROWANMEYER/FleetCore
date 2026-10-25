export type MessageDriver = { name: string; idNumber?: string; phone?: string };
export type MessageTruck = { fleetNo: string; registration?: string };
export type MessageTrailer = { fleetNo: string; trailers: { length: string; registration: string }[] };
export type MessageOptions = {
  template: "standard" | "week";
  driver: MessageDriver; truck: MessageTruck; trailer: MessageTrailer;
  week: string; location: string; shunter: boolean; loadNumber: string; totalLoads: string;
  eta: string; notes: string;
};

export function isoWeek(date: Date): number {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  return Math.ceil(((day.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function buildQuickMessage(data: MessageOptions): string {
  const registration = (length: number) => data.trailer.trailers
    .filter((part) => parseFloat(part.length) === length)
    .map((part) => part.registration.trim()).filter(Boolean).join(" / ") || "-";
  const details = [
    `DRIVER: ${data.driver.name || "-"}`,
    `ID: ${data.driver.idNumber || "-"}`,
    `CELL: ${data.driver.phone || "-"}`,
    `TRUCK: ${data.truck.fleetNo || "-"}`,
    `REG: ${data.truck.registration || "-"}`,
    `TRAILER: ${data.trailer.fleetNo || "-"}`,
    `6M: ${registration(6)}`,
    `12M: ${registration(12)}`,
  ];
  if (data.template === "week") {
    return [
      `WEEK ${data.week || "-"}`, "", data.location.toUpperCase(),
      ...(data.shunter ? ["TYPE: SHUNTER"] : []), "",
      `VRAG: ${data.loadNumber || "-"}/${data.totalLoads || "-"}`, "",
      ...details, "", `ETA ${data.eta}`, `NOTES ${data.notes}`,
    ].join("\n");
  }
  return [...details, `NOTES ${data.notes}`, ""].join("\n");
}

export function weekProblem(week: string, loadNumber: string, totalLoads: string): string {
  if (!/^\d+$/.test(week) || Number(week) < 1 || Number(week) > 53) return "Enter a week from 1 to 53.";
  if (!/^\d+$/.test(loadNumber) || !/^\d+$/.test(totalLoads) || Number(loadNumber) < 1 || Number(totalLoads) < Number(loadNumber)) return "Enter a load number and total loads, with the total at least the load number.";
  return "";
}

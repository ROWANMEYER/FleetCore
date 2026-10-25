import { describe, expect, it } from "vitest";
import { birthdayOffset, johannesburgDay, timelinePage, upcomingTimeline } from "./birthdayTimeline";
const today = { year: 2026, month: 10, day: 25 };
const birthday = (id: string, month: number, day: number) => ({ driverId: id, name: id, phoneNumber: "", month, day });
describe("birthday timeline", () => {
  it("uses the Johannesburg calendar date after UTC 22:00", () => {
    expect(johannesburgDay(new Date("2026-10-25T22:30:00Z"))).toEqual({ year: 2026, month: 10, day: 26 });
  });
  it("orders today before future birthdays across month boundaries", () => {
    const rows = upcomingTimeline([birthday("November",11,4), birthday("Today",10,25), birthday("October",10,29)], today);
    expect(rows.map((row) => row.daysUntil)).toEqual([0,4,10]);
  });
  it("rolls upcoming birthdays across the new year and excludes past dates outside the window", () => {
    const rows = upcomingTimeline([birthday("Jan",1,4), birthday("Past",12,20)], { year: 2026, month: 12, day: 25 });
    expect(rows.map((row) => row.driverId)).toEqual(["Jan"]);
    expect(rows[0].daysUntil).toBe(10);
  });
  it("keeps all birthdays on a shared date, ordered by name", () => {
    expect(upcomingTimeline([birthday("Z",10,25), birthday("A",10,25)],today).map((row) => row.name)).toEqual(["A","Z"]);
  });
  it("includes the thirtieth day but excludes later birthdays", () => {
    expect(upcomingTimeline([birthday("Thirty",11,24), birthday("Later",11,25)],today).map((row) => row.driverId)).toEqual(["Thirty"]);
  });
  it("preserves signed offsets for viewing earlier birthdays in a month", () => {
    expect(birthdayOffset(10,15,today)).toBe(-10);
  });
  it("keeps every record reachable through fixed-size pages", () => {
    const rows = Array.from({length:8},(_,index) => index);
    expect([0,1,2].flatMap((page) => timelinePage(rows,page).rows)).toEqual(rows);
    expect(timelinePage(rows,2).rows).toEqual([6,7]);
  });
  it("clamps the page after a shorter query result and supports smaller screens", () => {
    expect(timelinePage([1,2],9)).toEqual({ rows:[1,2],current:0,pages:1 });
    expect(timelinePage([1,2,3],1,2).rows).toEqual([3]);
    expect(timelinePage([],0)).toEqual({ rows:[],current:0,pages:1 });
  });
});

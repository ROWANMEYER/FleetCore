export type TimelineBirthday = {
  driverId: string; name: string; phoneNumber: string; day: number; month: number;
  photoUrl?: string; photoOriginalUrl?: string;
};
export function johannesburgDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}
export function birthdayOffset(month: number, day: number, today: ReturnType<typeof johannesburgDay>, year = today.year) {
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(today.year, today.month - 1, today.day)) / 86400000);
}
export function upcomingTimeline<T extends TimelineBirthday>(rows: T[], today: ReturnType<typeof johannesburgDay>) {
  return rows.map((row) => {
    const offset = birthdayOffset(row.month, row.day, today);
    const daysUntil = offset < 0 ? birthdayOffset(row.month, row.day, today, today.year + 1) : offset;
    return { ...row, daysUntil };
  }).filter((row) => row.daysUntil <= 30).sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name));
}
export function timelinePage<T>(rows: T[], page: number, pageSize = 3) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.max(0, Math.min(page, pages - 1));
  return { rows: rows.slice(current * pageSize, (current + 1) * pageSize), current, pages };
}

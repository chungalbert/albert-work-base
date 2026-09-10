const TZ = "Asia/Taipei";

export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

export function addDaysISO(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return formatISODate(date);
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function startOfWeekMonday(iso = todayISO()): string {
  const date = parseISODate(iso);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return formatISODate(date);
}

export function endOfWeekSunday(iso = todayISO()): string {
  return addDaysISO(startOfWeekMonday(iso), 6);
}

export function inRange(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}

/** ISO-8601 week (Monday start). Returns calendar year of that week plus 1–53. */
export function isoWeekParts(iso = todayISO()): { year: number; week: number } {
  const local = parseISODate(iso);
  const utc = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const year = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year, week };
}

export function formatWW(iso = todayISO()): string {
  return `WW${String(isoWeekParts(iso).week).padStart(2, "0")}`;
}

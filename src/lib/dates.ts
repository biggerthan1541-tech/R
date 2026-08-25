const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses a `YYYY-MM-DD` calendar date to its UTC midnight epoch. */
export function parseDate(date: string): number {
  if (!ISO_DATE.test(date)) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
  const [y, m, d] = date.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  if (Number.isNaN(ms)) throw new Error(`Not a valid date: ${date}`);
  return ms;
}

export function isValidDate(date: string): boolean {
  if (!ISO_DATE.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

export function today(now: Date = new Date()): string {
  return toDateString(now);
}

export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to) - parseDate(from)) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  return toDateString(new Date(parseDate(date) + days * DAY_MS));
}

/** "in 12 days" / "3 days ago" / "today" — for nag copy and table cells. */
export function relativeDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

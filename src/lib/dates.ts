import type { ISODate, ISODateTime } from './types';

export const DAY_MS = 86_400_000;

export const toISODate = (d: Date): ISODate => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Parse `YYYY-MM-DD` as a *local* date so day arithmetic never drifts a day. */
export const parseISO = (s: ISODate): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

export const addDays = (s: ISODate, n: number): ISODate => {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
};

export const addMonths = (s: ISODate, n: number): ISODate => {
  const d = parseISO(s);
  d.setMonth(d.getMonth() + n);
  return toISODate(d);
};

export const diffDays = (a: ISODate, b: ISODate): number =>
  Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY_MS);

export const dayOfWeek = (s: ISODate): number => parseISO(s).getDay();

export const isWeekend = (s: ISODate): boolean => [0, 6].includes(dayOfWeek(s));

export const startOfWeek = (s: ISODate, weekStart = 0): ISODate => {
  const d = parseISO(s);
  const diff = (d.getDay() - weekStart + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toISODate(d);
};

export const endOfWeek = (s: ISODate, weekStart = 0): ISODate => addDays(startOfWeek(s, weekStart), 6);

export const startOfMonth = (s: ISODate): ISODate => `${s.slice(0, 7)}-01`;

export const endOfMonth = (s: ISODate): ISODate => {
  const d = parseISO(s);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};

export const monthKey = (s: ISODate): string => s.slice(0, 7);

export const rangeDays = (start: ISODate, end: ISODate): ISODate[] => {
  const out: ISODate[] = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard++ < 3000) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const fmtDate = (s: ISODate | null | undefined): string => {
  if (!s) return '—';
  const d = parseISO(s.slice(0, 10));
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

export const fmtDateShort = (s: ISODate | null | undefined): string => {
  if (!s) return '—';
  const d = parseISO(s.slice(0, 10));
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

export const fmtMonthYear = (s: ISODate): string => {
  const d = parseISO(s.slice(0, 7) + '-01');
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
};

export const fmtDow = (s: ISODate): string => DOW[dayOfWeek(s)];

export const fmtTime = (hhmm: string): string => {
  const [hRaw, m] = hhmm.split(':').map(Number);
  const period = hRaw >= 12 ? 'PM' : 'AM';
  const h = hRaw % 12 === 0 ? 12 : hRaw % 12;
  return `${h}:${String(m ?? 0).padStart(2, '0')} ${period}`;
};

export const fmtDateTime = (iso: ISODateTime | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${fmtClock(d)}`;
};

export const fmtClock = (d: Date): string => {
  const h24 = d.getHours();
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${period}`;
};

export const fmtClockSeconds = (d: Date): string => {
  const h24 = d.getHours();
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')} ${period}`;
};

export const timeAgo = (iso: ISODateTime | null | undefined, now = new Date()): string => {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const secs = Math.round((now.getTime() - then) / 1000);
  if (secs < 0) return 'in the future';
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
};

export const minutesBetween = (start: string, end: string): number => {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins;
};

export const hoursBetween = (start: string, end: string, breakMinutes = 0): number =>
  Math.max(0, (minutesBetween(start, end) - breakMinutes) / 60);

export const addMinutesToTime = (hhmm: string, minutes: number): string => {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + minutes + 1440 * 10) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export const isoAt = (date: ISODate, hhmm: string): ISODateTime => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = parseISO(date);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export const yearsBetween = (from: ISODate, to: ISODate): number =>
  Math.max(0, diffDays(from, to) / 365.25);

export const tenureLabel = (hireDate: ISODate, today: ISODate): string => {
  const days = diffDays(hireDate, today);
  if (days < 31) return `${Math.max(0, days)} days`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem ? `${years}y ${rem}mo` : `${years}y`;
};

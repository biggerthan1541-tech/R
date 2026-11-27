export const currency = (n: number, opts: { cents?: boolean; compact?: boolean } = {}): string => {
  if (!Number.isFinite(n)) return '—';
  if (opts.compact && Math.abs(n) >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
    }).format(n);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: opts.cents === false ? 0 : 2,
    maximumFractionDigits: opts.cents === false ? 0 : 2,
  }).format(n);
};

export const num = (n: number, decimals = 0): string =>
  Number.isFinite(n)
    ? new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n)
    : '—';

export const hours = (n: number): string => `${num(n, 2)}h`;

export const percent = (n: number, decimals = 1): string =>
  Number.isFinite(n) ? `${n >= 0 ? '' : ''}${n.toFixed(decimals)}%` : '—';

export const initials = (first: string, last: string): string =>
  `${(first || '?')[0]}${(last || '')[0] || ''}`.toUpperCase();

export const titleCase = (s: string): string =>
  s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const sentence = (s: string): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/[_-]+/g, ' ') : '';

export const truncate = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, max - 1)}…`;

export const pluralize = (count: number, one: string, many = `${one}s`): string =>
  `${count} ${count === 1 ? one : many}`;

export const maskAccount = (last4: string): string => `••••${last4}`;

export const phoneFmt = (p: string): string => {
  const d = p.replace(/\D/g, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
};

/** Stable HSL-ish avatar color drawn from the brand family. */
const AVATAR_COLORS = [
  '#5B3FD6', '#0E7C86', '#7B4BC4', '#2F7F5B', '#B4652A', '#3A63D0',
  '#8C4A7E', '#1B8894', '#4A31B3', '#9A5B2C', '#2D6E8F', '#6E56E4',
];

export const avatarColor = (seed: string): string => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

export const csvEscape = (value: unknown): string => {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows: Record<string, unknown>[], columns?: string[]): string => {
  if (!rows.length) return '';
  const cols = columns ?? Object.keys(rows[0]);
  const head = cols.map(csvEscape).join(',');
  const body = rows.map((r) => cols.map((c) => csvEscape(r[c])).join(',')).join('\n');
  return `${head}\n${body}`;
};

export const downloadText = (filename: string, content: string, mime = 'text/csv;charset=utf-8'): void => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

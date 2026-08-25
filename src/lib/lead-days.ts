/** Parses the "14, 7, 1" settings field. Returns null when the input is not usable. */
export function parseLeadDays(raw: string): number[] | null {
  const parts = raw
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return [];

  const days: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 365) return null;
    if (n > 0) days.push(n);
  }
  return [...new Set(days)].sort((a, b) => b - a);
}

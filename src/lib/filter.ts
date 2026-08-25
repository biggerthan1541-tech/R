import type { ExceptionWithEvents } from "./export";
import { daysUntilExpiry, deriveStatus } from "./status";
import { today } from "./dates";

export type SortKey = "title" | "type" | "risk" | "owner" | "expiry" | "status";
export type SortDir = "asc" | "desc";

export type RegisterQuery = {
  status?: string;
  type?: string;
  owner?: string;
  framework?: string;
  q?: string;
  sort?: SortKey;
  dir?: SortDir;
};

const RISK_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const STATUS_ORDER = { expired: 0, expiring: 1, open: 2, renewed: 3, closed: 4 } as const;

export function parseQuery(raw: Record<string, string | string[] | undefined>): RegisterQuery {
  const one = (k: string) => {
    const v = raw[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s !== "all" ? s : undefined;
  };
  const sort = one("sort");
  const dir = one("dir");
  return {
    status: one("status"),
    type: one("type"),
    owner: one("owner"),
    framework: one("framework"),
    q: one("q"),
    // Default view leads with what is on fire, then soonest expiry.
    sort: isSortKey(sort) ? sort : "status",
    dir: dir === "desc" ? "desc" : "asc",
  };
}

function isSortKey(v: string | undefined): v is SortKey {
  return (
    v === "title" || v === "type" || v === "risk" || v === "owner" || v === "expiry" || v === "status"
  );
}

export function applyQuery(
  rows: readonly ExceptionWithEvents[],
  query: RegisterQuery,
  now: string = today(),
): ExceptionWithEvents[] {
  const needle = query.q?.trim().toLowerCase();

  const filtered = rows.filter((r) => {
    if (query.status && deriveStatus(r, now) !== query.status) return false;
    if (query.type && r.type !== query.type) return false;
    if (query.owner && r.riskOwnerEmail !== query.owner) return false;
    if (query.framework && !r.frameworkTags.includes(query.framework)) return false;
    if (needle) {
      const haystack = [
        r.title,
        r.description,
        r.compensatingControl,
        r.riskOwnerName,
        r.riskOwnerEmail,
        r.approverName,
        r.approverEmail,
        ...r.frameworkTags,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const dir = query.dir === "desc" ? -1 : 1;
  const key = query.sort ?? "status";

  return filtered.sort((a, b) => {
    const cmp = compare(a, b, key, now);
    // Stable, meaningful tiebreak: soonest expiry, then title.
    return cmp !== 0 ? cmp * dir : a.expiryDate.localeCompare(b.expiryDate) || a.title.localeCompare(b.title);
  });
}

function compare(
  a: ExceptionWithEvents,
  b: ExceptionWithEvents,
  key: SortKey,
  now: string,
): number {
  switch (key) {
    case "title":
      return a.title.localeCompare(b.title);
    case "type":
      return a.type.localeCompare(b.type);
    case "risk":
      return RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel];
    case "owner":
      return a.riskOwnerName.localeCompare(b.riskOwnerName);
    case "expiry":
      return daysUntilExpiry(a, now) - daysUntilExpiry(b, now);
    case "status":
      return STATUS_ORDER[deriveStatus(a, now)] - STATUS_ORDER[deriveStatus(b, now)];
  }
}

/** Distinct owners and framework tags present in the register, for filter dropdowns. */
export function facets(rows: readonly ExceptionWithEvents[]) {
  const owners = new Map<string, string>();
  const frameworks = new Set<string>();
  for (const r of rows) {
    owners.set(r.riskOwnerEmail, r.riskOwnerName);
    for (const t of r.frameworkTags) frameworks.add(t);
  }
  return {
    owners: [...owners.entries()]
      .map(([email, name]) => ({ email, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    frameworks: [...frameworks].sort(),
  };
}

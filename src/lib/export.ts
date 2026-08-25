import type { Exception, ExceptionEvent, Workspace } from "@/db/schema";
import { EXCEPTION_TYPE_LABELS, RISK_LEVEL_LABELS } from "./labels";
import { toCsv } from "./csv";
import { daysUntilExpiry, deriveStatus, STATUS_LABELS } from "./status";
import { today } from "./dates";

export type ExceptionWithEvents = Exception & { events: ExceptionEvent[] };

export type RegisterSummary = {
  total: number;
  active: number;
  expiringSoon: number;
  overdue: number;
  closed: number;
  byType: Array<{ label: string; count: number }>;
  byRisk: Array<{ label: string; count: number }>;
};

export function summarize(
  rows: readonly ExceptionWithEvents[],
  now: string = today(),
): RegisterSummary {
  const statuses = rows.map((r) => deriveStatus(r, now));
  const count = (pred: (s: string) => boolean) => statuses.filter(pred).length;

  const tally = (keys: string[]) => {
    const m = new Map<string, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()]
      .map(([label, c]) => ({ label, count: c }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };

  return {
    total: rows.length,
    active: count((s) => s !== "closed"),
    expiringSoon: count((s) => s === "expiring"),
    overdue: count((s) => s === "expired"),
    closed: count((s) => s === "closed"),
    byType: tally(rows.map((r) => EXCEPTION_TYPE_LABELS[r.type])),
    byRisk: tally(rows.map((r) => RISK_LEVEL_LABELS[r.riskLevel])),
  };
}

/** Short human-quotable reference: stable per exception, unique in practice. */
export function shortRef(id: string): string {
  return `EX-${id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

const EXPORT_HEADERS = [
  "Ref",
  "ID",
  "Title",
  "Type",
  "Status",
  "Risk level",
  "Expiry date",
  "Days to expiry",
  "Risk owner",
  "Risk owner email",
  "Approver",
  "Approver email",
  "Why (business justification)",
  "Compensating control",
  "Framework tags",
  "Evidence URL",
  "Created",
  "Closed",
  "Event count",
  "Event history",
];

export function formatEventHistory(events: readonly ExceptionEvent[]): string {
  return [...events]
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .map((e) => {
      const when = e.timestamp.toISOString().replace("T", " ").slice(0, 16);
      const note = e.note ? ` — ${e.note}` : "";
      return `[${when}] ${e.kind} by ${e.actor}${note}`;
    })
    .join("\n");
}

export function buildExportRows(
  rows: readonly ExceptionWithEvents[],
  now: string = today(),
): unknown[][] {
  return [
    EXPORT_HEADERS,
    ...rows.map((r) => [
      shortRef(r.id),
      r.id,
      r.title,
      EXCEPTION_TYPE_LABELS[r.type],
      STATUS_LABELS[deriveStatus(r, now)],
      RISK_LEVEL_LABELS[r.riskLevel],
      r.expiryDate,
      daysUntilExpiry(r, now),
      r.riskOwnerName,
      r.riskOwnerEmail,
      r.approverName,
      r.approverEmail,
      r.description,
      r.compensatingControl,
      r.frameworkTags.join("; "),
      r.evidenceUrl ?? "",
      r.createdAt.toISOString().slice(0, 10),
      r.closedAt ? r.closedAt.toISOString().slice(0, 10) : "",
      r.events.length,
      formatEventHistory(r.events),
    ]),
  ];
}

export function buildExportCsv(
  rows: readonly ExceptionWithEvents[],
  now: string = today(),
): string {
  return toCsv(buildExportRows(rows, now));
}

export function exportFilename(
  workspace: Pick<Workspace, "slug">,
  ext: "csv" | "pdf",
  now: string = today(),
): string {
  return `lapse-exception-register-${workspace.slug}-${now}.${ext}`;
}

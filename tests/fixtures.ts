import type { ExceptionWithEvents } from "@/lib/export";
import type { EventKind, ExceptionStatus, ExceptionType, RiskLevel } from "@/lib/enums";

export const NOW = "2026-08-25";

let seq = 0;

export function makeException(over: Partial<ExceptionWithEvents> = {}): ExceptionWithEvents {
  seq += 1;
  const id = over.id ?? `0000000${seq}-0000-4000-8000-000000000000`.slice(-36);
  return {
    id,
    workspaceId: "ws-1",
    title: `Exception ${seq}`,
    type: "firewall_exception" as ExceptionType,
    description: "Because the vendor has no API.",
    compensatingControl: "IP allowlist and session logging.",
    riskLevel: "medium" as RiskLevel,
    riskOwnerName: "Dana Whitfield",
    riskOwnerEmail: "dana@example.com",
    approverName: "Priya Raman",
    approverEmail: "priya@example.com",
    status: "open" as ExceptionStatus,
    createdBy: "priya@example.com",
    expiryDate: "2026-12-01",
    closedAt: null,
    evidenceUrl: null,
    frameworkTags: ["SOC2"],
    createdAt: new Date("2026-01-15T09:00:00Z"),
    updatedAt: new Date("2026-01-15T09:00:00Z"),
    events: [],
    ...over,
  };
}

export function makeEvent(
  exceptionId: string,
  kind: EventKind,
  note: string,
  timestamp: string,
): ExceptionWithEvents["events"][number] {
  seq += 1;
  return {
    id: `ev-${seq}`,
    workspaceId: "ws-1",
    exceptionId,
    kind,
    note,
    actor: "dana@example.com",
    timestamp: new Date(timestamp),
  };
}

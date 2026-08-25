import type { ExceptionType, EventKind, RiskLevel } from "./enums";

export const EXCEPTION_TYPE_LABELS: Record<ExceptionType, string> = {
  firewall_exception: "Firewall exception",
  temp_access_grant: "Temporary access grant",
  accepted_finding: "Accepted finding",
  mfa_waiver: "MFA waiver",
  policy_waiver: "Policy waiver",
  other: "Other",
};

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  created: "Created",
  updated: "Updated",
  renewed: "Renewed",
  extended: "Extended",
  closed: "Closed",
  reopened: "Reopened",
  status_changed: "Status changed",
  nag_sent: "Reminder sent",
  imported: "Imported",
};

export const FRAMEWORK_SUGGESTIONS = [
  "SOC2",
  "ISO27001",
  "HIPAA",
  "PCI",
  "GDPR",
  "NIST",
  "FedRAMP",
];

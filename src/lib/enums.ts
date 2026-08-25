/**
 * Plain enum values, kept out of the Drizzle schema so client components can
 * import them without pulling the database layer into the browser bundle.
 */
export const EXCEPTION_TYPES = [
  "firewall_exception",
  "temp_access_grant",
  "accepted_finding",
  "mfa_waiver",
  "policy_waiver",
  "other",
] as const;

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;

export const EXCEPTION_STATUSES = ["open", "expiring", "expired", "closed", "renewed"] as const;

export const EVENT_KINDS = [
  "created",
  "updated",
  "renewed",
  "extended",
  "closed",
  "reopened",
  "status_changed",
  "nag_sent",
  "imported",
] as const;

/**
 * Workspace roles, most privileged first. `approver` and above may sign off on
 * risk decisions (renew / extend / close / reopen); `member` may only record and
 * edit. See `lib/permissions.ts` for the separation-of-duties rules.
 */
export const MEMBER_ROLES = ["owner", "admin", "approver", "member"] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];
export type RiskLevel = (typeof RISK_LEVELS)[number];
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];
export type EventKind = (typeof EVENT_KINDS)[number];

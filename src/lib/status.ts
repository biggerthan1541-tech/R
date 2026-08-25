import type { Exception } from "@/db/schema";
import type { ExceptionStatus } from "./enums";
import { daysBetween, today } from "./dates";

/** An exception is "expiring" once it is inside this many days of its expiry date. */
export const EXPIRING_WINDOW_DAYS = 14;

export type StatusInput = Pick<Exception, "expiryDate" | "closedAt" | "status">;

/**
 * The live status, derived on every read so the register is never stale between
 * cron runs. Dates win over the stored column; `renewed` survives derivation as a
 * decoration on an otherwise-open record, because "this keeps getting kicked down
 * the road" is exactly the signal the register exists to surface.
 */
export function deriveStatus(
  ex: StatusInput,
  now: string = today(),
  windowDays: number = EXPIRING_WINDOW_DAYS,
): ExceptionStatus {
  if (ex.closedAt) return "closed";
  const days = daysBetween(now, ex.expiryDate);
  if (days < 0) return "expired";
  if (days <= windowDays) return "expiring";
  return ex.status === "renewed" ? "renewed" : "open";
}

export function daysUntilExpiry(ex: StatusInput, now: string = today()): number {
  return daysBetween(now, ex.expiryDate);
}

/** Expired and nobody closed it — the state that embarrasses you at audit time. */
export function isOverdue(ex: StatusInput, now: string = today()): boolean {
  return deriveStatus(ex, now) === "expired";
}

export function isActive(ex: StatusInput): boolean {
  return !ex.closedAt;
}

export const STATUS_LABELS: Record<ExceptionStatus, string> = {
  open: "Open",
  expiring: "Expiring",
  expired: "Expired",
  closed: "Closed",
  renewed: "Renewed",
};

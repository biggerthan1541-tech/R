import { randomBytes } from "node:crypto";

/** URL-safe bearer token. 32 bytes of entropy — the same class of secret as a magic link. */
export function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

export const INVITATION_TTL_DAYS = 14;

/** Nag links have to outlive the reminder cadence, including the weekly overdue sweep. */
export const ACTION_TOKEN_TTL_DAYS = 45;

export function expiresIn(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

import type { MemberRole } from "./enums";

/**
 * Separation of duties.
 *
 * Recording an exception and signing off on it are different jobs. Whoever logs
 * an exception is asking for a risk to be accepted; somebody else has to accept
 * it. That rule is what makes the register evidence rather than a diary, so it
 * is enforced here, in one place, for every sign-off action.
 */

/** Actions that accept, extend or terminate a risk. Somebody else must do these. */
export const SIGN_OFF_ACTIONS = ["renew", "extend", "close", "reopen"] as const;

/** Everything a member can do without signing anything off. */
export const RECORD_ACTIONS = ["create", "edit"] as const;

export type SignOffAction = (typeof SIGN_OFF_ACTIONS)[number];
export type RecordAction = (typeof RECORD_ACTIONS)[number];
export type Action = SignOffAction | RecordAction;

const SIGN_OFF_ROLES: readonly MemberRole[] = ["owner", "admin", "approver"];

export type Actor = {
  email: string;
  role: MemberRole;
};

export type ExceptionSubject = {
  /** Email of whoever logged the exception. */
  createdBy: string;
  /** Email named as approver on the record itself. */
  approverEmail: string;
};

export type Decision = { allowed: true } | { allowed: false; reason: string };

const ALLOW: Decision = { allowed: true };
const deny = (reason: string): Decision => ({ allowed: false, reason });

export function isSignOffAction(action: Action): action is SignOffAction {
  return (SIGN_OFF_ACTIONS as readonly string[]).includes(action);
}

/** True when the actor may sign off in this workspace at all, by role or by name. */
export function canSignOffInPrinciple(actor: Actor, subject: ExceptionSubject): boolean {
  return (
    SIGN_OFF_ROLES.includes(actor.role) || sameEmail(actor.email, subject.approverEmail)
  );
}

export function can(action: Action, actor: Actor, subject: ExceptionSubject): Decision {
  if (!isSignOffAction(action)) return ALLOW;

  // The person named as approver on the record may act on it whatever their
  // workspace role — that is the whole point of naming them.
  if (!canSignOffInPrinciple(actor, subject)) {
    return deny(
      "Only an approver or an admin can sign off on an exception. Ask the named approver to review it.",
    );
  }

  if (sameEmail(actor.email, subject.createdBy)) {
    return deny(
      "You logged this exception, so you cannot sign off on it yourself. Ask the named approver or an admin to review it.",
    );
  }

  return ALLOW;
}

export function assertCan(action: Action, actor: Actor, subject: ExceptionSubject): void {
  const decision = can(action, actor, subject);
  if (!decision.allowed) throw new ForbiddenError(decision.reason);
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Roles a member of this workspace is allowed to hand out. */
export function assignableRoles(actorRole: MemberRole): MemberRole[] {
  if (actorRole === "owner") return ["owner", "admin", "approver", "member"];
  if (actorRole === "admin") return ["admin", "approver", "member"];
  return [];
}

export function canManageMembers(role: MemberRole): boolean {
  return role === "owner" || role === "admin";
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  approver: "Approver",
  member: "Member",
};

export const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  owner: "Full control, including workspace settings and removing members.",
  admin: "Can sign off on exceptions and manage members.",
  approver: "Can sign off on exceptions — renew, extend, close, reopen.",
  member: "Can log and edit exceptions, but not sign off on them.",
};

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase() && a.trim() !== "";
}

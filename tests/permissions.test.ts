import { describe, expect, it } from "vitest";
import {
  assertCan,
  assignableRoles,
  can,
  canManageMembers,
  ForbiddenError,
  isSignOffAction,
  RECORD_ACTIONS,
  SIGN_OFF_ACTIONS,
  type Action,
} from "@/lib/permissions";
import type { MemberRole } from "@/lib/enums";

const subject = { createdBy: "dana@example.com", approverEmail: "priya@example.com" };
const actor = (email: string, role: MemberRole) => ({ email, role });

describe("action classification", () => {
  it("treats risk decisions as sign-off and record-keeping as not", () => {
    for (const a of SIGN_OFF_ACTIONS) expect(isSignOffAction(a)).toBe(true);
    for (const a of RECORD_ACTIONS) expect(isSignOffAction(a as Action)).toBe(false);
  });
});

describe("recording is open to every member", () => {
  it.each(["create", "edit"] as const)("allows %s for a plain member", (action) => {
    expect(can(action, actor("member@example.com", "member"), subject).allowed).toBe(true);
  });

  it("lets the author edit their own exception", () => {
    expect(can("edit", actor("dana@example.com", "member"), subject).allowed).toBe(true);
  });
});

describe("sign-off requires standing", () => {
  it.each(SIGN_OFF_ACTIONS)("blocks a plain member from %s", (action) => {
    const decision = can(action, actor("member@example.com", "member"), subject);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/approver or an admin/);
  });

  it.each(["owner", "admin", "approver"] as const)("allows a %s who did not log it", (role) => {
    for (const action of SIGN_OFF_ACTIONS) {
      expect(can(action, actor("someone@example.com", role), subject).allowed).toBe(true);
    }
  });

  it("allows the approver named on the record even as a plain member", () => {
    for (const action of SIGN_OFF_ACTIONS) {
      expect(can(action, actor("priya@example.com", "member"), subject).allowed).toBe(true);
    }
  });
});

describe("nobody signs off on their own exception", () => {
  it.each(SIGN_OFF_ACTIONS)("blocks the author from %s even as an admin", (action) => {
    const decision = can(action, actor("dana@example.com", "admin"), subject);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/cannot sign off on it yourself/);
  });

  it("blocks the author even when they are also the workspace owner", () => {
    expect(can("close", actor("dana@example.com", "owner"), subject).allowed).toBe(false);
  });

  it("blocks the author even when they named themselves approver", () => {
    const selfApproved = { createdBy: "dana@example.com", approverEmail: "dana@example.com" };
    expect(can("renew", actor("dana@example.com", "approver"), selfApproved).allowed).toBe(false);
  });

  it("still lets the author edit the record", () => {
    expect(can("edit", actor("dana@example.com", "admin"), subject).allowed).toBe(true);
  });
});

describe("email comparison", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(can("close", actor("  DANA@Example.com ", "admin"), subject).allowed).toBe(false);
    expect(can("close", actor("PRIYA@EXAMPLE.COM", "member"), subject).allowed).toBe(true);
  });

  it("does not treat an unrecorded author as matching an empty actor", () => {
    const noAuthor = { createdBy: "", approverEmail: "priya@example.com" };
    expect(can("close", actor("", "admin"), noAuthor).allowed).toBe(true);
  });

  it("does not let a blank approver field grant standing", () => {
    const noApprover = { createdBy: "dana@example.com", approverEmail: "" };
    expect(can("close", actor("", "member"), noApprover).allowed).toBe(false);
  });
});

describe("assertCan", () => {
  it("throws ForbiddenError with the user-facing reason", () => {
    expect(() => assertCan("close", actor("dana@example.com", "admin"), subject)).toThrow(
      ForbiddenError,
    );
    expect(() => assertCan("close", actor("priya@example.com", "member"), subject)).not.toThrow();
  });
});

describe("member management", () => {
  it("lets owners and admins manage members", () => {
    expect(canManageMembers("owner")).toBe(true);
    expect(canManageMembers("admin")).toBe(true);
    expect(canManageMembers("approver")).toBe(false);
    expect(canManageMembers("member")).toBe(false);
  });

  it("stops an admin from minting another owner", () => {
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("admin")).not.toContain("owner");
    expect(assignableRoles("approver")).toEqual([]);
    expect(assignableRoles("member")).toEqual([]);
  });
});

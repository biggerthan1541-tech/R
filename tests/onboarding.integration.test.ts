import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { addDays, today } from "@/lib/dates";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Covers the two ways somebody who has never used Lapse ends up able to act:
 * an invitation, and a nag reminder addressed to them. Runs against real
 * Postgres when DATABASE_URL is set; skipped otherwise.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("onboarding a new person", () => {
  let db: typeof import("@/db").db;
  let schema: typeof import("@/db/schema");
  let eq: typeof import("drizzle-orm").eq;
  let and: typeof import("drizzle-orm").and;

  let workspaceId: string;
  let slug: string;
  const stamp = () => crypto.randomUUID().slice(0, 8);

  const NOW = today();
  const AUTHOR = `author-${stamp()}@example.com`;
  const APPROVER = `approver-${stamp()}@example.com`;
  const OWNER = `owner-${stamp()}@example.com`;

  beforeAll(async () => {
    ({ db } = await import("@/db"));
    schema = await import("@/db/schema");
    ({ eq, and } = await import("drizzle-orm"));

    slug = `onboarding-${stamp()}`;
    const [ws] = await db
      .insert(schema.workspaces)
      .values({ name: "Onboarding Test", slug })
      .returning();
    workspaceId = ws.id;
  });

  afterAll(async () => {
    if (workspaceId) {
      await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
    }
    for (const email of [AUTHOR, APPROVER, OWNER]) {
      await db.delete(schema.users).where(eq(schema.users.email, email));
    }
  });

  const membershipFor = async (email: string) => {
    const [row] = await db
      .select({ role: schema.workspaceMemberships.role })
      .from(schema.workspaceMemberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMemberships.userId))
      .where(
        and(
          eq(schema.workspaceMemberships.workspaceId, workspaceId),
          eq(schema.users.email, email),
        ),
      )
      .limit(1);
    return row ?? null;
  };

  describe("invitations", () => {
    it("creates a pending invitation for an address with no account", async () => {
      const { inviteToWorkspace, listPendingInvitations } = await import("@/lib/invitations");

      const result = await inviteToWorkspace({
        workspaceId,
        workspaceName: "Onboarding Test",
        email: OWNER.toUpperCase(),
        role: "admin",
        invitedBy: "founder@example.com",
      });

      expect(result).toEqual({ ok: true, alreadyMember: false });
      const pending = await listPendingInvitations(workspaceId);
      expect(pending).toHaveLength(1);
      expect(pending[0].email).toBe(OWNER); // normalised to lowercase
      expect(pending[0].role).toBe("admin");
      expect(await membershipFor(OWNER)).toBeNull();
    });

    it("turns into a membership the first time that address signs in", async () => {
      const { claimInvitations } = await import("@/lib/invitations");

      const [user] = await db.insert(schema.users).values({ email: OWNER }).returning();
      const claimed = await claimInvitations(user.id, OWNER);

      expect(claimed).toBe(1);
      expect(await membershipFor(OWNER)).toEqual({ role: "admin" });
    });

    it("is idempotent — signing in again claims nothing further", async () => {
      const { claimInvitations } = await import("@/lib/invitations");
      const [user] = await db.select().from(schema.users).where(eq(schema.users.email, OWNER));
      expect(await claimInvitations(user.id, OWNER)).toBe(0);
    });

    it("reports an existing member instead of inviting them again", async () => {
      const { inviteToWorkspace } = await import("@/lib/invitations");
      const result = await inviteToWorkspace({
        workspaceId,
        workspaceName: "Onboarding Test",
        email: OWNER,
        role: "member",
        invitedBy: "founder@example.com",
      });
      expect(result).toEqual({ ok: true, alreadyMember: true });
    });

    it("refuses an expired invitation", async () => {
      const { lookupInvitation } = await import("@/lib/invitations");
      const { mintToken } = await import("@/lib/tokens");

      const token = mintToken();
      await db.insert(schema.invitations).values({
        workspaceId,
        email: `stale-${stamp()}@example.com`,
        role: "member",
        token,
        invitedBy: "founder@example.com",
        expiresAt: new Date(Date.now() - 1000),
      });

      expect(await lookupInvitation(token)).toBeNull();
      expect(await lookupInvitation("not-a-real-token")).toBeNull();
    });
  });

  describe("a nagged non-member can land on the item and act", () => {
    let exceptionId: string;

    it("mints a per-recipient reminder link when the sweep runs", async () => {
      const { runDailySweep } = await import("@/lib/sweep");

      // Logged by the author, approved by somebody who has never used Lapse.
      const [ex] = await db
        .insert(schema.exceptions)
        .values({
          workspaceId,
          title: "Vendor VPN without device posture check",
          type: "firewall_exception",
          riskLevel: "high",
          riskOwnerName: "The Author",
          riskOwnerEmail: AUTHOR,
          approverName: "The Approver",
          approverEmail: APPROVER,
          createdBy: AUTHOR,
          expiryDate: addDays(NOW, 14),
        })
        .returning();
      exceptionId = ex.id;

      const result = await runDailySweep(NOW, workspaceId);
      expect(result.nagsSent).toBe(1);
      expect(result.errors).toEqual([]);

      const tokens = await db
        .select()
        .from(schema.actionTokens)
        .where(eq(schema.actionTokens.exceptionId, exceptionId));

      // One token each for the risk owner and the approver, never shared.
      expect(tokens.map((t) => t.email).sort()).toEqual([APPROVER, AUTHOR].sort());
      const approverToken = tokens.find((t) => t.email === APPROVER)!;
      expect(approverToken.role).toBe("approver");
      expect(tokens.find((t) => t.email === AUTHOR)!.role).toBe("member");
      expect(approverToken.token.length).toBeGreaterThan(32);
      expect(approverToken.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("reuses the same link on later reminders rather than minting a new one", async () => {
      const { actionLinkFor } = await import("@/lib/action-tokens");
      const [ex] = await db
        .select()
        .from(schema.exceptions)
        .where(eq(schema.exceptions.id, exceptionId));

      const first = await actionLinkFor(ex, APPROVER);
      const second = await actionLinkFor(ex, APPROVER);
      expect(first).toBe(second);
    });

    it("signs the approver in, joins them to the workspace and points at the exception", async () => {
      const { redeemActionToken } = await import("@/lib/action-tokens");

      expect(await membershipFor(APPROVER)).toBeNull();

      const [token] = await db
        .select()
        .from(schema.actionTokens)
        .where(
          and(
            eq(schema.actionTokens.exceptionId, exceptionId),
            eq(schema.actionTokens.email, APPROVER),
          ),
        );

      const redeemed = await redeemActionToken(token.token);
      expect(redeemed.ok).toBe(true);
      if (!redeemed.ok) return;

      expect(redeemed.email).toBe(APPROVER);
      expect(redeemed.workspaceSlug).toBe(slug);
      expect(redeemed.exceptionId).toBe(exceptionId);
      expect(redeemed.joined).toBe(true);

      // The account was created on the spot and is now a workspace approver.
      expect(await membershipFor(APPROVER)).toEqual({ role: "approver" });
      const [user] = await db.select().from(schema.users).where(eq(schema.users.email, APPROVER));
      expect(user.id).toBe(redeemed.userId);
    });

    it("lets that approver actually sign off, and blocks the author from doing so", async () => {
      const { can } = await import("@/lib/permissions");
      const [ex] = await db
        .select()
        .from(schema.exceptions)
        .where(eq(schema.exceptions.id, exceptionId));

      const approverRole = (await membershipFor(APPROVER))!.role;
      expect(can("close", { email: APPROVER, role: approverRole }, ex).allowed).toBe(true);
      expect(can("renew", { email: APPROVER, role: approverRole }, ex).allowed).toBe(true);

      // The risk owner who logged it gets a link too, but cannot self-approve.
      const authorDecision = can("close", { email: AUTHOR, role: "member" }, ex);
      expect(authorDecision.allowed).toBe(false);
    });

    it("closes the exception as the approver, writing the reason to the event log", async () => {
      const { closeException } = await import("@/lib/exceptions");

      await closeException(workspaceId, exceptionId, "Posture check shipped in CHG-4410.", APPROVER);

      const [ex] = await db
        .select()
        .from(schema.exceptions)
        .where(eq(schema.exceptions.id, exceptionId));
      expect(ex.closedAt).not.toBeNull();

      const events = await db
        .select()
        .from(schema.events)
        .where(eq(schema.events.exceptionId, exceptionId));
      const closure = events.find((e) => e.kind === "closed");
      expect(closure?.actor).toBe(APPROVER);
      expect(closure?.note).toContain("CHG-4410");
      // Append-only: the original creation event is still there.
      expect(events.some((e) => e.kind === "created" || e.kind === "nag_sent")).toBe(true);
    });

    it("does not re-grant membership on a second visit, and never downgrades a role", async () => {
      const { redeemActionToken } = await import("@/lib/action-tokens");
      const [token] = await db
        .select()
        .from(schema.actionTokens)
        .where(
          and(
            eq(schema.actionTokens.exceptionId, exceptionId),
            eq(schema.actionTokens.email, APPROVER),
          ),
        );

      await db
        .update(schema.workspaceMemberships)
        .set({ role: "admin" })
        .where(eq(schema.workspaceMemberships.workspaceId, workspaceId));

      const again = await redeemActionToken(token.token);
      expect(again.ok).toBe(true);
      if (again.ok) expect(again.joined).toBe(false);
      expect((await membershipFor(APPROVER))!.role).toBe("admin");
    });

    it("rejects an unknown or expired reminder link", async () => {
      const { redeemActionToken } = await import("@/lib/action-tokens");
      const { mintToken } = await import("@/lib/tokens");

      expect(await redeemActionToken("nope")).toEqual({ ok: false, reason: "unknown" });

      const stale = mintToken();
      await db.insert(schema.actionTokens).values({
        token: stale,
        workspaceId,
        exceptionId,
        email: `stale-${stamp()}@example.com`,
        role: "member",
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(await redeemActionToken(stale)).toEqual({ ok: false, reason: "expired" });
    });
  });
});

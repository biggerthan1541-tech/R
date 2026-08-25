import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  actionTokens,
  exceptions,
  users,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import type { Exception } from "@/db/schema";
import type { MemberRole } from "./enums";
import { ACTION_TOKEN_TTL_DAYS, expiresIn, mintToken } from "./tokens";
import { appUrl } from "./urls";

/**
 * A reminder that cannot be acted on is just noise. Every nag carries a bearer
 * link scoped to one exception: it signs the recipient in, joins them to the
 * workspace at the role their part on the record implies, and lands them on the
 * item. Same trust class as a magic link — long random secret, fixed expiry.
 */

/** The named approver signs off; the risk owner records and updates. */
export function roleForRecipient(exception: Exception, email: string): MemberRole {
  return sameEmail(email, exception.approverEmail) ? "approver" : "member";
}

/** Returns a reusable link for this (exception, recipient) pair, minting one if needed. */
export async function actionLinkFor(exception: Exception, email: string): Promise<string> {
  const address = email.trim().toLowerCase();

  const [existing] = await db
    .select()
    .from(actionTokens)
    .where(and(eq(actionTokens.exceptionId, exception.id), eq(actionTokens.email, address)))
    .limit(1);

  if (existing && existing.expiresAt > new Date()) {
    return appUrl(`/a/${existing.token}`);
  }

  const token = mintToken();
  const values = {
    token,
    workspaceId: exception.workspaceId,
    exceptionId: exception.id,
    email: address,
    role: roleForRecipient(exception, address),
    expiresAt: expiresIn(ACTION_TOKEN_TTL_DAYS),
  };

  if (existing) {
    await db.update(actionTokens).set(values).where(eq(actionTokens.id, existing.id));
  } else {
    await db.insert(actionTokens).values(values);
  }

  return appUrl(`/a/${token}`);
}

export type Redemption =
  | {
      ok: true;
      userId: string;
      email: string;
      workspaceSlug: string;
      exceptionId: string;
      joined: boolean;
    }
  | { ok: false; reason: "unknown" | "expired" };

/**
 * Signs the bearer in and makes sure they can act: creates the user if this is
 * their first contact with Lapse, and grants membership if they have none.
 * An existing membership is never downgraded.
 */
export async function redeemActionToken(token: string): Promise<Redemption> {
  const [row] = await db
    .select({ token: actionTokens, workspace: workspaces })
    .from(actionTokens)
    .innerJoin(workspaces, eq(workspaces.id, actionTokens.workspaceId))
    .where(eq(actionTokens.token, token))
    .limit(1);

  if (!row) return { ok: false, reason: "unknown" };
  if (row.token.expiresAt < new Date()) return { ok: false, reason: "expired" };

  const email = row.token.email;

  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    [user] = await db
      .insert(users)
      .values({ email, emailVerified: new Date() })
      .returning();
  }

  const [membership] = await db
    .select({ id: workspaceMemberships.id })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, row.token.workspaceId),
        eq(workspaceMemberships.userId, user.id),
      ),
    )
    .limit(1);

  if (!membership) {
    await db.insert(workspaceMemberships).values({
      workspaceId: row.token.workspaceId,
      userId: user.id,
      role: row.token.role,
    });
  }

  await db
    .update(actionTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(actionTokens.id, row.token.id));

  return {
    ok: true,
    userId: user.id,
    email,
    workspaceSlug: row.workspace.slug,
    exceptionId: row.token.exceptionId,
    joined: !membership,
  };
}

/** Confirms the exception still exists in the workspace the token points at. */
export async function exceptionExists(workspaceId: string, exceptionId: string) {
  const [row] = await db
    .select({ id: exceptions.id })
    .from(exceptions)
    .where(and(eq(exceptions.workspaceId, workspaceId), eq(exceptions.id, exceptionId)))
    .limit(1);
  return Boolean(row);
}

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase() && a.trim() !== "";
}

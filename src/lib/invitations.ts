import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { invitations, users, workspaceMemberships, workspaces } from "@/db/schema";
import type { MemberRole } from "./enums";
import { ROLE_LABELS } from "./permissions";
import { sendEmail } from "./notify";
import { expiresIn, INVITATION_TTL_DAYS, mintToken } from "./tokens";
import { appUrl } from "./urls";

export type InviteResult =
  | { ok: true; alreadyMember: boolean }
  | { ok: false; error: string };

export async function inviteToWorkspace(input: {
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: MemberRole;
  invitedBy: string;
}): Promise<InviteResult> {
  const email = input.email.trim().toLowerCase();

  // Already a member? Nothing to send — say so rather than creating a dead invite.
  const [existing] = await db
    .select({ id: workspaceMemberships.id })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(
      and(eq(workspaceMemberships.workspaceId, input.workspaceId), eq(users.email, email)),
    )
    .limit(1);
  if (existing) return { ok: true, alreadyMember: true };

  const token = mintToken();
  await db
    .insert(invitations)
    .values({
      workspaceId: input.workspaceId,
      email,
      role: input.role,
      token,
      invitedBy: input.invitedBy,
      expiresAt: expiresIn(INVITATION_TTL_DAYS),
    })
    .onConflictDoUpdate({
      target: [invitations.workspaceId, invitations.email],
      set: {
        role: input.role,
        token,
        invitedBy: input.invitedBy,
        createdAt: new Date(),
        expiresAt: expiresIn(INVITATION_TTL_DAYS),
        acceptedAt: null,
      },
    });

  await sendEmail({
    to: [email],
    subject: `${input.invitedBy} invited you to the ${input.workspaceName} exception register`,
    html: inviteHtml(input.workspaceName, input.invitedBy, input.role, token),
    text: inviteText(input.workspaceName, input.invitedBy, input.role, token),
  });

  return { ok: true, alreadyMember: false };
}

export async function revokeInvitation(workspaceId: string, invitationId: string) {
  await db
    .delete(invitations)
    .where(and(eq(invitations.workspaceId, workspaceId), eq(invitations.id, invitationId)));
}

export async function listPendingInvitations(workspaceId: string) {
  return db
    .select()
    .from(invitations)
    .where(and(eq(invitations.workspaceId, workspaceId), isNull(invitations.acceptedAt)));
}

/**
 * Turns every unexpired invitation for this address into a membership. Called on
 * sign-in, so an invite lands whether the person follows the emailed link or
 * just signs up on their own.
 */
export async function claimInvitations(userId: string, email: string): Promise<number> {
  const pending = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.email, email.trim().toLowerCase()), isNull(invitations.acceptedAt)));

  const now = new Date();
  const live = pending.filter((i) => i.expiresAt > now);

  for (const invitation of live) {
    await db
      .insert(workspaceMemberships)
      .values({ workspaceId: invitation.workspaceId, userId, role: invitation.role })
      .onConflictDoNothing();
    await db
      .update(invitations)
      .set({ acceptedAt: now })
      .where(eq(invitations.id, invitation.id));
  }

  return live.length;
}

/** Resolves an invitation token to the workspace it belongs to, if still valid. */
export async function lookupInvitation(token: string) {
  const [row] = await db
    .select({ invitation: invitations, workspace: workspaces })
    .from(invitations)
    .innerJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
    .where(eq(invitations.token, token))
    .limit(1);

  if (!row) return null;
  if (row.invitation.expiresAt < new Date()) return null;
  return row;
}

/* -------------------------------------------------------------------------- */

function inviteText(workspace: string, invitedBy: string, role: MemberRole, token: string) {
  return [
    `${invitedBy} added you to the ${workspace} exception register on Lapse as ${ROLE_LABELS[role]}.`,
    "",
    "Lapse tracks security exceptions, risk acceptances and temporary access grants",
    "that expire — and chases their owners before they do.",
    "",
    "Accept the invitation:",
    appUrl(`/invite/${token}`),
    "",
    `This link expires in ${INVITATION_TTL_DAYS} days.`,
  ].join("\n");
}

function inviteHtml(workspace: string, invitedBy: string, role: MemberRole, token: string) {
  return `<div style="font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#201e1d">
  <p style="margin:0 0 22px;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#ae1800">Lapse — exception register</p>
  <p style="margin:0 0 10px;font-size:19px;font-weight:700;line-height:1.35">${escapeHtml(invitedBy)} invited you to ${escapeHtml(workspace)}</p>
  <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#444141">
    You have been added as <strong>${ROLE_LABELS[role]}</strong>. Lapse tracks security
    exceptions, risk acceptances and temporary access grants that expire — and chases
    their owners before they do.
  </p>
  <p style="margin:0 0 24px">
    <a href="${appUrl(`/invite/${token}`)}" style="display:inline-block;background:#ec3013;color:#f3f2f2;text-decoration:none;padding:11px 18px;font-weight:800;font-size:14px">Accept invitation</a>
  </p>
  <p style="margin:0;color:#7d7979;font-size:12px;line-height:1.6">This link expires in ${INVITATION_TTL_DAYS} days.</p>
</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

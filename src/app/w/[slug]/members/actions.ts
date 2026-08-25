"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workspaceMemberships } from "@/db/schema";
import { requireWorkspace } from "@/lib/workspace";
import { inviteToWorkspace, revokeInvitation } from "@/lib/invitations";
import { assignableRoles, canManageMembers } from "@/lib/permissions";
import { MEMBER_ROLES } from "@/lib/enums";

export type MembersState = { error?: string; notice?: string };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("That is not a valid email address")),
  role: z.enum(MEMBER_ROLES),
});

export async function inviteMemberAction(
  slug: string,
  _prev: MembersState,
  formData: FormData,
): Promise<MembersState> {
  const { workspace, user, role: actorRole } = await requireWorkspace(slug);
  if (!canManageMembers(actorRole)) return { error: "Only owners and admins can invite people." };

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (!assignableRoles(actorRole).includes(parsed.data.role)) {
    return { error: `You cannot grant the ${parsed.data.role} role.` };
  }

  const result = await inviteToWorkspace({
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    email: parsed.data.email,
    role: parsed.data.role,
    invitedBy: user.email,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath(`/w/${slug}/members`);
  return {
    notice: result.alreadyMember
      ? `${parsed.data.email} is already a member of this workspace.`
      : `Invitation sent to ${parsed.data.email}.`,
  };
}

export async function changeRoleAction(
  slug: string,
  _prev: MembersState,
  formData: FormData,
): Promise<MembersState> {
  const { workspace, user, role: actorRole } = await requireWorkspace(slug);
  if (!canManageMembers(actorRole)) return { error: "Only owners and admins can change roles." };

  const membershipId = String(formData.get("membershipId") ?? "");
  const parsedRole = z.enum(MEMBER_ROLES).safeParse(formData.get("role"));
  if (!parsedRole.success) return { error: "Unknown role." };
  if (!assignableRoles(actorRole).includes(parsedRole.data)) {
    return { error: `You cannot grant the ${parsedRole.data} role.` };
  }

  const [target] = await db
    .select()
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.id, membershipId),
        eq(workspaceMemberships.workspaceId, workspace.id),
      ),
    )
    .limit(1);
  if (!target) return { error: "That member is no longer in this workspace." };

  if (target.userId === user.id) return { error: "You cannot change your own role." };
  if (target.role === "owner" && actorRole !== "owner") {
    return { error: "Only an owner can change another owner's role." };
  }
  if (await wouldOrphanWorkspace(workspace.id, target.id, parsedRole.data)) {
    return { error: "A workspace needs at least one owner." };
  }

  await db
    .update(workspaceMemberships)
    .set({ role: parsedRole.data })
    .where(eq(workspaceMemberships.id, membershipId));

  revalidatePath(`/w/${slug}/members`);
  return { notice: "Role updated." };
}

export async function removeMemberAction(
  slug: string,
  _prev: MembersState,
  formData: FormData,
): Promise<MembersState> {
  const { workspace, user, role: actorRole } = await requireWorkspace(slug);
  if (!canManageMembers(actorRole)) return { error: "Only owners and admins can remove people." };

  const membershipId = String(formData.get("membershipId") ?? "");
  const [target] = await db
    .select()
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.id, membershipId),
        eq(workspaceMemberships.workspaceId, workspace.id),
      ),
    )
    .limit(1);
  if (!target) return { error: "That member is no longer in this workspace." };

  if (target.userId === user.id) return { error: "You cannot remove yourself." };
  if (target.role === "owner" && actorRole !== "owner") {
    return { error: "Only an owner can remove another owner." };
  }
  if (await wouldOrphanWorkspace(workspace.id, target.id, null)) {
    return { error: "A workspace needs at least one owner." };
  }

  await db.delete(workspaceMemberships).where(eq(workspaceMemberships.id, membershipId));

  revalidatePath(`/w/${slug}/members`);
  return { notice: "Member removed." };
}

export async function revokeInvitationAction(
  slug: string,
  _prev: MembersState,
  formData: FormData,
): Promise<MembersState> {
  const { workspace, role: actorRole } = await requireWorkspace(slug);
  if (!canManageMembers(actorRole)) return { error: "Only owners and admins can revoke invites." };

  await revokeInvitation(workspace.id, String(formData.get("invitationId") ?? ""));
  revalidatePath(`/w/${slug}/members`);
  return { notice: "Invitation revoked." };
}

/** True when demoting or removing this membership would leave nobody in charge. */
async function wouldOrphanWorkspace(
  workspaceId: string,
  membershipId: string,
  newRole: string | null,
): Promise<boolean> {
  if (newRole === "owner") return false;

  const others = await db
    .select({ role: workspaceMemberships.role })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        ne(workspaceMemberships.id, membershipId),
      ),
    );

  return !others.some((m) => m.role === "owner");
}

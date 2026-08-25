import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, workspaceMemberships } from "@/db/schema";
import { requireWorkspace } from "@/lib/workspace";
import { listPendingInvitations } from "@/lib/invitations";
import { assignableRoles, canManageMembers, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/permissions";
import { MembersScreen } from "@/components/members-screen";
import {
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
  type MembersState,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { workspace, user, role } = await requireWorkspace(slug);

  const rows = await db
    .select({
      membershipId: workspaceMemberships.id,
      userId: workspaceMemberships.userId,
      role: workspaceMemberships.role,
      email: users.email,
      name: users.name,
      joinedAt: workspaceMemberships.createdAt,
    })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(eq(workspaceMemberships.workspaceId, workspace.id));

  const pending = await listPendingInvitations(workspace.id);

  async function invite(prev: MembersState, formData: FormData) {
    "use server";
    return inviteMemberAction(slug, prev, formData);
  }
  async function changeRole(prev: MembersState, formData: FormData) {
    "use server";
    return changeRoleAction(slug, prev, formData);
  }
  async function remove(prev: MembersState, formData: FormData) {
    "use server";
    return removeMemberAction(slug, prev, formData);
  }
  async function revoke(prev: MembersState, formData: FormData) {
    "use server";
    return revokeInvitationAction(slug, prev, formData);
  }

  return (
    <main className="flex flex-1 justify-center px-6 pt-8 pb-16">
      <div className="w-full max-w-[760px]">
        <h2 className="mb-1">People</h2>
        <p className="max-w-[64ch] text-[14px] text-neutral-700">
          Everyone who can see {workspace.name}. Separation of duties is enforced by role:
          whoever logs an exception can never sign off on it themselves.
        </p>

        <div className="hair mt-5 grid sm:grid-cols-2">
          {(["owner", "admin", "approver", "member"] as const).map((r, i) => (
            <div
              key={r}
              className={`px-3.5 py-3 ${i % 2 === 1 ? "sm:border-l" : ""} ${i > 1 ? "border-t" : ""} border-[var(--divider)]`}
            >
              <div className="text-[13px] font-extrabold">{ROLE_LABELS[r]}</div>
              <div className="text-[12px] leading-snug text-neutral-700">
                {ROLE_DESCRIPTIONS[r]}
              </div>
            </div>
          ))}
        </div>

        <hr className="my-6 h-0.5 border-0" style={{ background: "var(--divider)" }} />

        <MembersScreen
          members={rows
            .map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString().slice(0, 10) }))
            .sort((a, b) => a.email.localeCompare(b.email))}
          pending={pending.map((p) => ({
            id: p.id,
            email: p.email,
            role: p.role,
            invitedBy: p.invitedBy,
            expiresAt: p.expiresAt.toISOString().slice(0, 10),
          }))}
          currentUserId={user.id}
          canManage={canManageMembers(role)}
          assignable={assignableRoles(role)}
          inviteAction={invite}
          changeRoleAction={changeRole}
          removeAction={remove}
          revokeAction={revoke}
        />
      </div>
    </main>
  );
}

"use client";

import { useActionState } from "react";
import type { MemberRole } from "@/lib/enums";
import { ROLE_LABELS } from "@/lib/permissions";
import type { MembersState } from "@/app/w/[slug]/members/actions";

type Member = {
  membershipId: string;
  userId: string;
  role: MemberRole;
  email: string;
  name: string | null;
  joinedAt: string;
};

type Pending = {
  id: string;
  email: string;
  role: MemberRole;
  invitedBy: string;
  expiresAt: string;
};

type ServerAction = (state: MembersState, formData: FormData) => Promise<MembersState>;

export function MembersScreen({
  members,
  pending,
  currentUserId,
  canManage,
  assignable,
  inviteAction,
  changeRoleAction,
  removeAction,
  revokeAction,
}: {
  members: Member[];
  pending: Pending[];
  currentUserId: string;
  canManage: boolean;
  assignable: MemberRole[];
  inviteAction: ServerAction;
  changeRoleAction: ServerAction;
  removeAction: ServerAction;
  revokeAction: ServerAction;
}) {
  const [inviteState, invite, inviting] = useActionState(inviteAction, {});
  const [manageState, manage, managing] = useActionState(
    async (prev: MembersState, formData: FormData) => {
      const intent = formData.get("intent");
      if (intent === "remove") return removeAction(prev, formData);
      if (intent === "revoke") return revokeAction(prev, formData);
      return changeRoleAction(prev, formData);
    },
    {},
  );

  return (
    <div className="flex flex-col gap-6">
      {canManage && (
        <form action={invite} className="hair flex flex-wrap items-end gap-3 bg-surface p-4">
          <div className="min-w-52 flex-1">
            <label className="label" htmlFor="email">
              Invite by email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="teammate@company.com"
              className="input bg-bg"
            />
          </div>
          <div>
            <label className="label" htmlFor="role">
              Role
            </label>
            <select id="role" name="role" defaultValue="approver" className="input w-40 bg-bg">
              {assignable.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary" disabled={inviting}>
            {inviting ? "Sending…" : "Send invite"}
          </button>
          <p className="w-full text-[12px] text-neutral-700">
            They get an email with a link that signs them in — no password to set up.
          </p>
        </form>
      )}

      <Notice state={inviteState} />
      <Notice state={manageState} />

      <div className="hair overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th className="pl-4">Person</th>
              <th className="w-40">Role</th>
              <th className="w-28">Joined</th>
              {canManage && <th className="w-24 pr-4" />}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.membershipId}>
                <td className="pl-4">
                  <div className="font-semibold">{m.name ?? m.email}</div>
                  {m.name && <div className="text-[12px] text-neutral-700">{m.email}</div>}
                </td>
                <td>
                  {canManage && m.userId !== currentUserId && assignable.length > 0 ? (
                    <form action={manage} className="flex items-center gap-2">
                      <input type="hidden" name="membershipId" value={m.membershipId} />
                      <select
                        name="role"
                        defaultValue={m.role}
                        className="input w-32"
                        disabled={managing}
                      >
                        {[...new Set([m.role, ...assignable])].map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                      <button className="btn-secondary px-2 py-1 text-[12px]" disabled={managing}>
                        Save
                      </button>
                    </form>
                  ) : (
                    <span className="chip bg-neutral-200 text-neutral-800">
                      {ROLE_LABELS[m.role]}
                      {m.userId === currentUserId && " · you"}
                    </span>
                  )}
                </td>
                <td className="num text-[13px] text-neutral-700">{m.joinedAt}</td>
                {canManage && (
                  <td className="pr-4">
                    {m.userId !== currentUserId && (
                      <form action={manage}>
                        <input type="hidden" name="membershipId" value={m.membershipId} />
                        <input type="hidden" name="intent" value="remove" />
                        <button className="btn-ghost px-1 text-[13px]" disabled={managing}>
                          Remove
                        </button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pending.length > 0 && (
        <div>
          <div className="kicker mb-2">Pending invitations</div>
          <div className="hair overflow-hidden">
            <table className="table">
              <thead>
                <tr>
                  <th className="pl-4">Email</th>
                  <th className="w-32">Role</th>
                  <th className="w-32">Expires</th>
                  {canManage && <th className="w-24 pr-4" />}
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id}>
                    <td className="pl-4">
                      <div className="font-semibold">{p.email}</div>
                      <div className="text-[12px] text-neutral-700">invited by {p.invitedBy}</div>
                    </td>
                    <td>
                      <span className="chip bg-neutral-200 text-neutral-800">
                        {ROLE_LABELS[p.role]}
                      </span>
                    </td>
                    <td className="num text-[13px] text-neutral-700">{p.expiresAt}</td>
                    {canManage && (
                      <td className="pr-4">
                        <form action={manage}>
                          <input type="hidden" name="invitationId" value={p.id} />
                          <input type="hidden" name="intent" value="revoke" />
                          <button className="btn-ghost px-1 text-[13px]" disabled={managing}>
                            Revoke
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Notice({ state }: { state: MembersState }) {
  if (state.error) {
    return (
      <p className="border-l-[3px] border-accent bg-accent-100 px-3 py-2 text-[13px] font-semibold text-accent-800">
        {state.error}
      </p>
    );
  }
  if (state.notice) {
    return (
      <p
        className="border-l-[3px] px-3 py-2 text-[13px] font-semibold"
        style={{
          borderColor: "var(--color-good)",
          background: "var(--color-good-bg)",
          color: "var(--color-good)",
        }}
      >
        {state.notice}
      </p>
    );
  }
  return null;
}

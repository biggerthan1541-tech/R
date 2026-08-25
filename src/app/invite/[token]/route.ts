import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, workspaceMemberships } from "@/db/schema";
import { claimInvitations, lookupInvitation } from "@/lib/invitations";
import { startSession } from "@/lib/session";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Accepting a workspace invitation. If the invited address already has an
 * account we can sign them straight in; otherwise the invitation waits and is
 * claimed automatically the first time they sign in.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const found = await lookupInvitation(token);
  if (!found) redirect("/login?invite=invalid");

  const { invitation, workspace } = found;
  const session = await auth();

  // Signed in as somebody else: do not silently move them between accounts.
  if (session?.user?.email && session.user.email !== invitation.email) {
    redirect(`/login?invite=mismatch&for=${encodeURIComponent(invitation.email)}`);
  }

  let [user] = await db.select().from(users).where(eq(users.email, invitation.email)).limit(1);
  if (!user) {
    [user] = await db
      .insert(users)
      .values({ email: invitation.email, emailVerified: new Date() })
      .returning();
  }

  await db
    .insert(workspaceMemberships)
    .values({ workspaceId: invitation.workspaceId, userId: user.id, role: invitation.role })
    .onConflictDoNothing();
  await claimInvitations(user.id, invitation.email);

  if (!session?.user) await startSession(user.id);
  redirect(`/w/${workspace.slug}`);
}

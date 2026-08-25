import { redirect } from "next/navigation";
import { exceptionExists, redeemActionToken } from "@/lib/action-tokens";
import { startSession } from "@/lib/session";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The link inside a nag email. Signs the recipient in, joins them to the
 * workspace if they are not a member, and drops them on the exception.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const result = await redeemActionToken(token);

  if (!result.ok) redirect(`/login?reminder=${result.reason}`);

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, result.workspaceSlug))
    .limit(1);

  if (!workspace || !(await exceptionExists(workspace.id, result.exceptionId))) {
    redirect("/login?reminder=unknown");
  }

  await startSession(result.userId);
  redirect(`/w/${result.workspaceSlug}/exceptions/${result.exceptionId}`);
}

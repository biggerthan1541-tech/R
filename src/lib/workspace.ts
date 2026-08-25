import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaceMemberships, workspaces } from "@/db/schema";
import { auth } from "@/auth";

export type SessionUser = { id: string; email: string; name: string | null };

export const requireUser = cache(async (): Promise<SessionUser> => {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) redirect("/login");
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
  };
});

export const listWorkspaces = cache(async (userId: string) => {
  const rows = await db
    .select({ workspace: workspaces, role: workspaceMemberships.role })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(eq(workspaceMemberships.userId, userId));
  return rows
    .map((r) => ({ ...r.workspace, role: r.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

/**
 * The single tenancy gate: every workspace-scoped page and route handler resolves
 * the workspace through here, so an unauthorised slug is indistinguishable from a
 * missing one.
 */
export async function requireWorkspace(slug: string) {
  const user = await requireUser();
  const [row] = await db
    .select({ workspace: workspaces, role: workspaceMemberships.role })
    .from(workspaces)
    .innerJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.workspaceId, workspaces.id),
        eq(workspaceMemberships.userId, user.id),
      ),
    )
    .where(eq(workspaces.slug, slug))
    .limit(1);

  if (!row) redirect("/");
  return { user, workspace: row.workspace, role: row.role };
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "workspace";
}

export async function createWorkspace(name: string, userId: string) {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; ; i++) {
    const existing = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, slug))
      .limit(1);
    if (existing.length === 0) break;
    slug = `${base}-${i}`;
  }

  const [workspace] = await db.insert(workspaces).values({ name, slug }).returning();
  await db
    .insert(workspaceMemberships)
    .values({ workspaceId: workspace.id, userId, role: "owner" });
  return workspace;
}

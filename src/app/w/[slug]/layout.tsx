import Link from "next/link";
import { listWorkspaces, requireWorkspace } from "@/lib/workspace";
import { signOutAction } from "@/app/actions";
import { Wordmark } from "@/components/wordmark";
import { NavTab } from "@/components/nav-tab";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { workspace, user } = await requireWorkspace(slug);
  const workspaces = await listWorkspaces(user.id);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="rule-b sticky top-0 z-40 flex items-stretch gap-8 bg-bg px-6">
        <div className="mr-auto flex items-center gap-3 py-3.5">
          <Link href={`/w/${slug}`}>
            <Wordmark eyebrow="Exception register" />
          </Link>
          {workspaces.length > 1 ? (
            <Link
              href="/?switch=1"
              className="border-l border-[var(--divider)] pl-3 text-[13px] text-neutral-700 hover:text-accent"
            >
              {workspace.name} ▾
            </Link>
          ) : (
            <span className="border-l border-[var(--divider)] pl-3 text-[13px] text-neutral-700">
              {workspace.name}
            </span>
          )}
        </div>

        <nav className="flex items-stretch">
          <NavTab href={`/w/${slug}`} label="Register" exact />
          <NavTab href={`/w/${slug}/import`} label="Import" />
          <NavTab href={`/w/${slug}/members`} label="People" />
          <NavTab href={`/w/${slug}/settings`} label="Settings" />
        </nav>

        <div className="flex items-center gap-3 border-l border-[var(--divider)] py-2.5 pl-6">
          <form action={signOutAction}>
            <button className="text-[12px] text-neutral-700 hover:text-accent">Sign out</button>
          </form>
          <Link className="btn-primary" href={`/w/${slug}/exceptions/new`}>
            New exception
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}

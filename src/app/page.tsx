import Link from "next/link";
import { redirect } from "next/navigation";
import { listWorkspaces, requireUser } from "@/lib/workspace";
import { createWorkspaceAction, signOutAction } from "./actions";
import { Wordmark } from "@/components/wordmark";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ switch?: string }>;
}) {
  const user = await requireUser();
  const workspaces = await listWorkspaces(user.id);
  const { switch: switching } = await searchParams;

  if (workspaces.length === 1 && !switching) redirect(`/w/${workspaces[0].slug}`);

  return (
    <main className="mx-auto max-w-[720px] px-6 py-14">
      <div className="flex items-center justify-between">
        <Wordmark eyebrow="Exception register" />
        <form action={signOutAction}>
          <button className="text-[12px] text-neutral-700 hover:text-accent">Sign out</button>
        </form>
      </div>

      <h2 className="mt-12 mb-1.5">Workspaces</h2>
      <p className="max-w-[58ch] text-[14px] text-neutral-700">
        One workspace per organisation you are responsible for. Exceptions, owners, reminders and
        exports never cross between them.
      </p>

      {workspaces.length > 0 && (
        <div className="hair mt-6">
          {workspaces.map((w, i) => (
            <Link
              key={w.id}
              href={`/w/${w.slug}`}
              className={`rowlink flex items-center justify-between px-4 py-3.5 ${
                i > 0 ? "border-t border-[var(--divider)]" : ""
              }`}
            >
              <span className="text-[15px] font-semibold">{w.name}</span>
              <span className="kicker">{w.role}</span>
            </Link>
          ))}
        </div>
      )}

      <form action={createWorkspaceAction} className="hair mt-6 flex flex-col gap-3 bg-surface p-4">
        <div>
          <label className="label" htmlFor="name">
            New workspace
          </label>
          <input id="name" name="name" required placeholder="Northwind Systems" className="input bg-bg" />
          <p className="hint">Usually the client or company name.</p>
        </div>
        <button className="btn-primary self-start">Create workspace</button>
      </form>
    </main>
  );
}

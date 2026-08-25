import { requireWorkspace } from "@/lib/workspace";
import { ImportWizard } from "@/components/import-wizard";
import { importAction, type ImportState } from "./actions";

export const dynamic = "force-dynamic";

export default async function ImportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireWorkspace(slug);

  async function action(prev: ImportState, formData: FormData) {
    "use server";
    return importAction(slug, prev, formData);
  }

  return (
    <main className="flex flex-1 justify-center px-6 pt-8 pb-16">
      <div className="w-full max-w-[860px]">
        <h2 className="mb-1">Import your spreadsheet</h2>
        <p className="max-w-[64ch] text-[14px] text-neutral-700">
          Upload the CSV you keep today. Lapse guesses which column is which — check the mapping,
          then import. Nothing is written until you confirm.
        </p>
        <p className="mt-2 text-[14px]">
          <a
            href={`/w/${slug}/import/template`}
            className="text-accent-700 underline underline-offset-[3px] hover:text-accent"
          >
            Download the template CSV
          </a>{" "}
          <span className="text-neutral-700">if you would rather start from our columns.</span>
        </p>
        <hr className="my-4 h-0.5 border-0" style={{ background: "var(--divider)" }} />
        <ImportWizard action={action} registerHref={`/w/${slug}`} />
      </div>
    </main>
  );
}

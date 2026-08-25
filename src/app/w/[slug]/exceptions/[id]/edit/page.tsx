import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { getException } from "@/lib/exceptions";
import { ExceptionForm } from "@/components/exception-form";
import { updateExceptionAction, type FormState } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditExceptionPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { workspace } = await requireWorkspace(slug);
  const exception = await getException(workspace.id, id);
  if (!exception) notFound();

  async function action(prev: FormState, formData: FormData) {
    "use server";
    return updateExceptionAction(slug, id, prev, formData);
  }

  return (
    <main className="flex flex-1 justify-center px-6 pt-8 pb-16">
      <div className="w-full max-w-[640px]">
        <Link href={`/w/${slug}/exceptions/${id}`} className="btn-ghost pl-0">
          ← Back to exception
        </Link>
        <h2 className="mt-2.5 mb-1">Edit exception</h2>
        <p className="mb-0 max-w-[62ch] text-[14px] text-neutral-700">
          Editing records an <strong>Updated</strong> event. To move the expiry date use Renew or
          Extend instead, so the reason is captured against the date change.
        </p>
        <hr className="my-4 h-0.5 border-0" style={{ background: "var(--divider)" }} />
        <ExceptionForm
          action={action}
          submitLabel="Save changes"
          cancelHref={`/w/${slug}/exceptions/${id}`}
          footnote="Recorded in the audit trail as edited by you."
          defaults={{
            title: exception.title,
            type: exception.type,
            description: exception.description,
            compensatingControl: exception.compensatingControl,
            riskLevel: exception.riskLevel,
            riskOwnerName: exception.riskOwnerName,
            riskOwnerEmail: exception.riskOwnerEmail,
            approverName: exception.approverName,
            approverEmail: exception.approverEmail,
            expiryDate: exception.expiryDate,
            evidenceUrl: exception.evidenceUrl ?? "",
            frameworkTags: exception.frameworkTags.join(", "),
          }}
        />
      </div>
    </main>
  );
}

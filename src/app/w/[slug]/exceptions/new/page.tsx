import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { ExceptionForm } from "@/components/exception-form";
import { createExceptionAction, type FormState } from "../actions";
import { addDays, today } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function NewExceptionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await requireWorkspace(slug);

  async function action(prev: FormState, formData: FormData) {
    "use server";
    return createExceptionAction(slug, prev, formData);
  }

  return (
    <main className="flex flex-1 justify-center px-6 pt-8 pb-16">
      <div className="w-full max-w-[640px]">
        <Link href={`/w/${slug}`} className="btn-ghost pl-0">
          ← Register
        </Link>
        <h2 className="mt-2.5 mb-1">New exception</h2>
        <p className="mb-0 text-[14px] text-neutral-700">
          Eleven fields, one of them non-negotiable. Everything here lands in the auditor export.
        </p>
        <hr className="my-4 h-0.5 border-0" style={{ background: "var(--divider)" }} />
        <ExceptionForm
          action={action}
          submitLabel="Log exception"
          cancelHref={`/w/${slug}`}
          footnote="Recorded in the audit trail as created by you."
          defaults={{
            expiryDate: addDays(today(), 90),
            approverName: user.name ?? "",
            approverEmail: user.email,
          }}
        />
      </div>
    </main>
  );
}

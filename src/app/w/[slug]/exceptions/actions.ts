"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import {
  closeException,
  createException,
  getException,
  moveExpiry,
  reopenException,
  updateException,
} from "@/lib/exceptions";
import { can, type SignOffAction } from "@/lib/permissions";
import {
  exceptionFormSchema,
  fieldErrors,
  formValues,
  moveExpirySchema,
  parseTags,
  reasonSchema,
} from "@/lib/validation";

export type FormState = {
  errors?: Record<string, string>;
  values?: Record<string, string>;
};

/**
 * Separation of duties, checked on the server for every sign-off. The UI hides
 * the controls too, but this is the enforcement point.
 */
async function guardSignOff(
  slug: string,
  id: string,
  action: SignOffAction,
): Promise<{ workspace: { id: string }; actorEmail: string } | { error: string }> {
  const { workspace, user, role } = await requireWorkspace(slug);
  const exception = await getException(workspace.id, id);
  if (!exception) return { error: "That exception no longer exists." };

  const decision = can(action, { email: user.email, role }, exception);
  if (!decision.allowed) return { error: decision.reason };

  return { workspace, actorEmail: user.email };
}

function toRow(values: ReturnType<typeof exceptionFormSchema.parse>) {
  return {
    title: values.title,
    type: values.type,
    description: values.description,
    compensatingControl: values.compensatingControl,
    riskLevel: values.riskLevel,
    riskOwnerName: values.riskOwnerName,
    riskOwnerEmail: values.riskOwnerEmail,
    approverName: values.approverName,
    approverEmail: values.approverEmail,
    expiryDate: values.expiryDate,
    evidenceUrl: values.evidenceUrl || null,
    frameworkTags: parseTags(values.frameworkTags),
  };
}

export async function createExceptionAction(
  slug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { workspace, user } = await requireWorkspace(slug);
  const parsed = exceptionFormSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  }

  const row = await createException(
    { ...toRow(parsed.data), workspaceId: workspace.id, createdBy: user.email },
    user.email,
    "created",
    `Logged with expiry ${parsed.data.expiryDate}.`,
  );

  revalidatePath(`/w/${slug}`);
  redirect(`/w/${slug}/exceptions/${row.id}`);
}

export async function updateExceptionAction(
  slug: string,
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { workspace, user } = await requireWorkspace(slug);
  const parsed = exceptionFormSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  }

  await updateException(workspace.id, id, toRow(parsed.data), user.email, "Details edited.");

  revalidatePath(`/w/${slug}`);
  redirect(`/w/${slug}/exceptions/${id}`);
}

export async function moveExpiryAction(
  slug: string,
  id: string,
  kind: "renewed" | "extended",
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const guard = await guardSignOff(slug, id, kind === "renewed" ? "renew" : "extend");
  if ("error" in guard) return { errors: { _: guard.error }, values: formValues(formData) };

  const parsed = moveExpirySchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  }

  await moveExpiry(
    guard.workspace.id,
    id,
    kind,
    parsed.data.expiryDate,
    parsed.data.reason,
    guard.actorEmail,
  );

  revalidatePath(`/w/${slug}`);
  redirect(`/w/${slug}/exceptions/${id}`);
}

export async function closeExceptionAction(
  slug: string,
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const guard = await guardSignOff(slug, id, "close");
  if ("error" in guard) return { errors: { _: guard.error }, values: formValues(formData) };

  const parsed = reasonSchema.safeParse(formData.get("reason") ?? "");
  if (!parsed.success) {
    return { errors: { reason: parsed.error.issues[0].message }, values: formValues(formData) };
  }

  await closeException(guard.workspace.id, id, parsed.data, guard.actorEmail);

  revalidatePath(`/w/${slug}`);
  redirect(`/w/${slug}/exceptions/${id}`);
}

export async function reopenExceptionAction(
  slug: string,
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const guard = await guardSignOff(slug, id, "reopen");
  if ("error" in guard) return { errors: { _: guard.error }, values: formValues(formData) };

  const parsed = reasonSchema.safeParse(formData.get("reason") ?? "");
  if (!parsed.success) {
    return { errors: { reason: parsed.error.issues[0].message }, values: formValues(formData) };
  }

  await reopenException(guard.workspace.id, id, parsed.data, guard.actorEmail);

  revalidatePath(`/w/${slug}`);
  redirect(`/w/${slug}/exceptions/${id}`);
}

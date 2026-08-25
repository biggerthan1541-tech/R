"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/workspace";
import {
  closeException,
  createException,
  moveExpiry,
  reopenException,
  updateException,
} from "@/lib/exceptions";
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
    { ...toRow(parsed.data), workspaceId: workspace.id },
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
  const { workspace, user } = await requireWorkspace(slug);
  const parsed = moveExpirySchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), values: formValues(formData) };
  }

  await moveExpiry(
    workspace.id,
    id,
    kind,
    parsed.data.expiryDate,
    parsed.data.reason,
    user.email,
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
  const { workspace, user } = await requireWorkspace(slug);
  const parsed = reasonSchema.safeParse(formData.get("reason") ?? "");
  if (!parsed.success) {
    return { errors: { reason: parsed.error.issues[0].message }, values: formValues(formData) };
  }

  await closeException(workspace.id, id, parsed.data, user.email);

  revalidatePath(`/w/${slug}`);
  redirect(`/w/${slug}/exceptions/${id}`);
}

export async function reopenExceptionAction(
  slug: string,
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { workspace, user } = await requireWorkspace(slug);
  const parsed = reasonSchema.safeParse(formData.get("reason") ?? "");
  if (!parsed.success) {
    return { errors: { reason: parsed.error.issues[0].message }, values: formValues(formData) };
  }

  await reopenException(workspace.id, id, parsed.data, user.email);

  revalidatePath(`/w/${slug}`);
  redirect(`/w/${slug}/exceptions/${id}`);
}

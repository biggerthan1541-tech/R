import { z } from "zod";
import { EXCEPTION_TYPES, RISK_LEVELS } from "./enums";
import { isValidDate } from "./dates";

const trimmed = z.string().trim();
const dateString = trimmed.refine(isValidDate, "Use a YYYY-MM-DD date");

export const exceptionFormSchema = z.object({
  title: trimmed.min(3, "Give it a title someone else would recognise").max(200),
  type: z.enum(EXCEPTION_TYPES),
  description: trimmed.max(4000).default(""),
  compensatingControl: trimmed.max(4000).default(""),
  riskLevel: z.enum(RISK_LEVELS),
  riskOwnerName: trimmed.min(1, "Risk owner name is required").max(120),
  riskOwnerEmail: trimmed.toLowerCase().pipe(z.email("Risk owner email is not valid")),
  approverName: trimmed.min(1, "Approver name is required").max(120),
  approverEmail: trimmed.toLowerCase().pipe(z.email("Approver email is not valid")),
  expiryDate: dateString,
  evidenceUrl: z
    .union([trimmed.length(0), trimmed.pipe(z.url("Evidence must be a URL"))])
    .default(""),
  frameworkTags: trimmed.default(""),
});

export type ExceptionFormValues = z.infer<typeof exceptionFormSchema>;

export const reasonSchema = trimmed.min(5, "Write a reason — this goes in the audit trail").max(2000);

export const moveExpirySchema = z.object({
  expiryDate: dateString,
  reason: reasonSchema,
});

export function parseTags(raw: string): string[] {
  return [...new Set(raw.split(/[,;]/).map((t) => t.trim()).filter(Boolean))];
}

/** Flattens a zod error into `{ field: message }` for rendering next to inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    out[key] ??= issue.message;
  }
  return out;
}

export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

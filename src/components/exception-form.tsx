"use client";

import { useActionState } from "react";
import Link from "next/link";
import { EXCEPTION_TYPES, RISK_LEVELS } from "@/lib/enums";
import { EXCEPTION_TYPE_LABELS, FRAMEWORK_SUGGESTIONS, RISK_LEVEL_LABELS } from "@/lib/labels";
import type { FormState } from "@/app/w/[slug]/exceptions/actions";

export type ExceptionFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults?: Partial<Record<string, string>>;
  submitLabel: string;
  cancelHref: string;
  footnote: string;
};

export function ExceptionForm({
  action,
  defaults = {},
  submitLabel,
  cancelHref,
  footnote,
}: ExceptionFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = { ...defaults, ...state.values };
  const err = state.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-[18px]">
      <Field label="Title" name="title" error={err.title}>
        <input
          id="title"
          name="title"
          defaultValue={v.title ?? ""}
          required
          placeholder="Legacy SFTP port 22 open to vendor CIDR"
          className="input"
        />
      </Field>

      <Field
        label="What deviates from policy, and why"
        name="description"
        error={err.description}
        hint="The business justification. This is the question you will be asked."
      >
        <textarea
          id="description"
          name="description"
          defaultValue={v.description ?? ""}
          placeholder="Vendor batch feed has no API; TLS migration is scheduled for Q3."
          className="input"
        />
      </Field>

      <div className="grid gap-[18px] sm:grid-cols-2">
        <Field label="Type" name="type" error={err.type}>
          <select id="type" name="type" defaultValue={v.type ?? "firewall_exception"} className="input">
            {EXCEPTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {EXCEPTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Residual risk" name="riskLevel" error={err.riskLevel}>
          <select id="riskLevel" name="riskLevel" defaultValue={v.riskLevel ?? "medium"} className="input">
            {RISK_LEVELS.map((r) => (
              <option key={r} value={r}>
                {RISK_LEVEL_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-[18px] sm:grid-cols-2">
        <Field label="Accountable risk owner" name="riskOwnerName" error={err.riskOwnerName}>
          <input id="riskOwnerName" name="riskOwnerName" defaultValue={v.riskOwnerName ?? ""} required className="input" />
        </Field>
        <Field
          label="Risk owner email"
          name="riskOwnerEmail"
          error={err.riskOwnerEmail}
          hint="Receives the expiry reminders."
        >
          <input
            id="riskOwnerEmail"
            name="riskOwnerEmail"
            type="email"
            defaultValue={v.riskOwnerEmail ?? ""}
            required
            className="input"
          />
        </Field>
        <Field label="Approver" name="approverName" error={err.approverName}>
          <input id="approverName" name="approverName" defaultValue={v.approverName ?? ""} required className="input" />
        </Field>
        <Field label="Approver email" name="approverEmail" error={err.approverEmail}>
          <input
            id="approverEmail"
            name="approverEmail"
            type="email"
            defaultValue={v.approverEmail ?? ""}
            required
            className="input"
          />
        </Field>
      </div>

      <div className="border-2 border-accent bg-accent-100 p-4">
        <div className="kicker mb-2.5 text-accent-700">Expiry — the field auditors read first</div>
        <div className="grid items-end gap-[18px] sm:grid-cols-[200px_1fr]">
          <div>
            <label className="label text-accent-900" htmlFor="expiryDate">
              Expires on
            </label>
            <input
              id="expiryDate"
              name="expiryDate"
              type="date"
              defaultValue={v.expiryDate ?? ""}
              required
              className="input num min-h-[46px] bg-bg text-[20px] font-extrabold"
            />
            {err.expiryDate && <p className="err">{err.expiryDate}</p>}
          </div>
          <p className="num m-0 text-[12px] text-accent-900">
            An exception without an end date is just a decision nobody revisits. The register
            reminds the owner 14, 7 and 1 days out, on the day, and weekly after that.
          </p>
        </div>
      </div>

      <Field
        label="Compensating control"
        name="compensatingControl"
        error={err.compensatingControl}
        hint="What reduces the risk while this exception stands."
      >
        <textarea
          id="compensatingControl"
          name="compensatingControl"
          defaultValue={v.compensatingControl ?? ""}
          placeholder="Source IP allowlist, session logging to SIEM, quarterly access review."
          className="input"
        />
      </Field>

      <div className="grid gap-[18px] sm:grid-cols-2">
        <Field
          label="Evidence link"
          name="evidenceUrl"
          error={err.evidenceUrl}
          hint="Ticket, approval thread, or design doc."
        >
          <input
            id="evidenceUrl"
            name="evidenceUrl"
            type="url"
            defaultValue={v.evidenceUrl ?? ""}
            placeholder="https://jira.example.com/SEC-1841"
            className="input"
          />
        </Field>
        <Field
          label="Framework tags"
          name="frameworkTags"
          error={err.frameworkTags}
          hint={`Comma separated. Common: ${FRAMEWORK_SUGGESTIONS.slice(0, 4).join(", ")}`}
        >
          <input
            id="frameworkTags"
            name="frameworkTags"
            defaultValue={v.frameworkTags ?? ""}
            placeholder="SOC2, ISO27001"
            className="input"
            list="framework-suggestions"
          />
          <datalist id="framework-suggestions">
            {FRAMEWORK_SUGGESTIONS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </Field>
      </div>

      <hr className="my-2 h-0.5 border-0" style={{ background: "var(--divider)" }} />

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link href={cancelHref} className="btn-secondary">
          Cancel
        </Link>
        <span className="ml-auto text-[12px] text-neutral-700">{footnote}</span>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      {children}
      {error ? <p className="err">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

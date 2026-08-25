"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/w/[slug]/exceptions/actions";

type Props = {
  label: string;
  summary: string;
  tone?: "default" | "primary";
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaultExpiry?: string;
  reasonPlaceholder: string;
  withExpiry?: boolean;
};

/**
 * Every lifecycle action is a disclosure that will not submit without a written
 * reason — the reason is the whole point of the audit trail.
 */
export function ReasonAction({
  label,
  summary,
  tone = "default",
  action,
  defaultExpiry,
  reasonPlaceholder,
  withExpiry = false,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const err = state.errors ?? {};
  const slug = label.toLowerCase().replace(/\W+/g, "-");

  return (
    <details open={Object.keys(err).length > 0}>
      <summary
        className={`${tone === "primary" ? "btn-primary" : "btn-secondary"} w-full cursor-pointer list-none justify-start select-none`}
      >
        {label}
      </summary>

      <div className="hair mt-2 flex flex-col gap-3 bg-surface p-3">
        <p className="m-0 text-[12px] text-neutral-700">{summary}</p>
        <form action={formAction} className="flex flex-col gap-3">
          {withExpiry && (
            <div>
              <label className="label" htmlFor={`${slug}-expiry`}>
                New expiry date
              </label>
              <input
                id={`${slug}-expiry`}
                name="expiryDate"
                type="date"
                required
                defaultValue={state.values?.expiryDate ?? defaultExpiry}
                className="input num bg-bg"
              />
              {err.expiryDate && <p className="err">{err.expiryDate}</p>}
            </div>
          )}

          <div>
            <label className="label" htmlFor={`${slug}-reason`}>
              Reason — recorded in the audit trail
            </label>
            <textarea
              id={`${slug}-reason`}
              name="reason"
              rows={2}
              required
              defaultValue={state.values?.reason ?? ""}
              placeholder={reasonPlaceholder}
              className="input min-h-[64px] bg-bg"
            />
            {err.reason && <p className="err">{err.reason}</p>}
          </div>

          <button className={tone === "primary" ? "btn-primary" : "btn-secondary"} disabled={pending}>
            {pending ? "Saving…" : `Confirm ${label.toLowerCase()}`}
          </button>
        </form>
      </div>
    </details>
  );
}

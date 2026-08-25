"use client";

import { useActionState } from "react";
import type { SettingsState } from "@/app/w/[slug]/settings/actions";

type Defaults = {
  name: string;
  nagLeadDays: string;
  nagEmailEnabled: boolean;
  nagSlackEnabled: boolean;
  slackWebhookUrl: string;
};

export function SettingsForm({
  action,
  defaults,
}: {
  action: (state: SettingsState, formData: FormData) => Promise<SettingsState>;
  defaults: Defaults;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-[18px]">
      <div>
        <label className="label" htmlFor="name">
          Workspace name
        </label>
        <input id="name" name="name" defaultValue={defaults.name} required className="input" />
      </div>

      <hr className="my-1 h-0.5 border-0" style={{ background: "var(--divider)" }} />

      <div>
        <div className="kicker mb-2.5">Reminders</div>
        <label className="label" htmlFor="nagLeadDays">
          Lead times — days before expiry
        </label>
        <input
          id="nagLeadDays"
          name="nagLeadDays"
          defaultValue={defaults.nagLeadDays}
          placeholder="14, 7, 1"
          className="input num max-w-[220px]"
        />
        <p className="hint max-w-[62ch]">
          The risk owner and approver are always reminded on the expiry day, and once a week after
          that for as long as the exception stays open past it.
        </p>
      </div>

      <Toggle
        name="nagEmailEnabled"
        defaultChecked={defaults.nagEmailEnabled}
        label="Email reminders"
        hint="Sent via Resend to the risk owner and the approver."
      />

      <Toggle
        name="nagSlackEnabled"
        defaultChecked={defaults.nagSlackEnabled}
        label="Slack reminders"
        hint="Posts to one incoming webhook — usually your #security channel."
      />

      <div>
        <label className="label" htmlFor="slackWebhookUrl">
          Slack incoming webhook URL
        </label>
        <input
          id="slackWebhookUrl"
          name="slackWebhookUrl"
          type="url"
          defaultValue={defaults.slackWebhookUrl}
          placeholder="https://hooks.slack.com/services/…"
          className="input"
        />
      </div>

      {state.error && (
        <p className="border-l-[3px] border-accent bg-accent-100 px-3 py-2 text-[13px] font-semibold text-accent-800">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p
          className="border-l-[3px] px-3 py-2 text-[13px] font-semibold"
          style={{
            borderColor: "var(--color-good)",
            background: "var(--color-good-bg)",
            color: "var(--color-good)",
          }}
        >
          Settings saved.
        </p>
      )}

      <button className="btn-primary self-start" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
      />
      <span>
        <span className="block text-[14px] font-semibold">{label}</span>
        <span className="block text-[12px] text-neutral-700">{hint}</span>
      </span>
    </label>
  );
}

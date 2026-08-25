import { requireWorkspace } from "@/lib/workspace";
import { SettingsForm } from "@/components/settings-form";
import { saveSettingsAction, type SettingsState } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);

  async function action(prev: SettingsState, formData: FormData) {
    "use server";
    return saveSettingsAction(slug, prev, formData);
  }

  return (
    <main className="flex flex-1 justify-center px-6 pt-8 pb-16">
      <div className="w-full max-w-[640px]">
        <h2 className="mb-1">Workspace settings</h2>
        <p className="text-[14px] text-neutral-700">
          Reminders run once a day. Everything here applies to {workspace.name} only.
        </p>
        <hr className="my-4 h-0.5 border-0" style={{ background: "var(--divider)" }} />
        <SettingsForm
          action={action}
          defaults={{
            name: workspace.name,
            nagLeadDays: workspace.nagLeadDays.join(", "),
            nagEmailEnabled: workspace.nagEmailEnabled,
            nagSlackEnabled: workspace.nagSlackEnabled,
            slackWebhookUrl: workspace.slackWebhookUrl ?? "",
          }}
        />
      </div>
    </main>
  );
}

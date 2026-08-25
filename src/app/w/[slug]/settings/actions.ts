"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { requireWorkspace } from "@/lib/workspace";
import { parseLeadDays } from "@/lib/lead-days";

export type SettingsState = { error?: string; saved?: boolean };

export async function saveSettingsAction(
  slug: string,
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { workspace } = await requireWorkspace(slug);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Workspace name is required" };

  const leadDays = parseLeadDays(String(formData.get("nagLeadDays") ?? ""));
  if (!leadDays) {
    return { error: "Lead times must be comma-separated whole numbers of days, e.g. 14, 7, 1" };
  }

  const slackWebhookUrl = String(formData.get("slackWebhookUrl") ?? "").trim();
  const nagSlackEnabled = formData.get("nagSlackEnabled") === "on";
  if (nagSlackEnabled && !slackWebhookUrl.startsWith("https://hooks.slack.com/")) {
    return { error: "Add a https://hooks.slack.com/… incoming webhook URL to enable Slack nags" };
  }

  await db
    .update(workspaces)
    .set({
      name,
      nagLeadDays: leadDays,
      nagEmailEnabled: formData.get("nagEmailEnabled") === "on",
      nagSlackEnabled,
      slackWebhookUrl: slackWebhookUrl || null,
    })
    .where(eq(workspaces.id, workspace.id));

  revalidatePath(`/w/${slug}`, "layout");
  return { saved: true };
}


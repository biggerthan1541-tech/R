import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { exceptions, nagLog, workspaces } from "@/db/schema";
import type { Exception, Workspace } from "@/db/schema";
import { daysBetween, relativeDays, today } from "./dates";
import { decideNag, nagSubject } from "./nag";
import { deriveStatus } from "./status";
import { EXCEPTION_TYPE_LABELS, RISK_LEVEL_LABELS } from "./labels";
import { sendEmail, sendSlack } from "./notify";
import { recordEvent } from "./exceptions";

export type SweepResult = {
  date: string;
  scanned: number;
  statusChanges: number;
  nagsSent: number;
  errors: string[];
};

/**
 * The daily job: flip stored statuses so the register reflects reality even when
 * nobody logs in, then send exactly the reminders that fell due today.
 */
export async function runDailySweep(
  now: string = today(),
  /** Restrict the sweep to one workspace. Used by tests and by manual re-runs. */
  workspaceId?: string,
): Promise<SweepResult> {
  const result: SweepResult = { date: now, scanned: 0, statusChanges: 0, nagsSent: 0, errors: [] };

  const scope = db.select().from(workspaces);
  const allWorkspaces = workspaceId
    ? await scope.where(eq(workspaces.id, workspaceId))
    : await scope;

  for (const workspace of allWorkspaces) {
    const active = await db
      .select()
      .from(exceptions)
      .where(and(eq(exceptions.workspaceId, workspace.id), isNull(exceptions.closedAt)));

    result.scanned += active.length;

    for (const ex of active) {
      try {
        if (await syncStatus(ex, now)) result.statusChanges++;
        if (await nagIfDue(workspace, ex, now)) result.nagsSent++;
      } catch (err) {
        result.errors.push(`${ex.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return result;
}

async function syncStatus(ex: Exception, now: string): Promise<boolean> {
  const derived = deriveStatus(ex, now);
  // `renewed` is a badge the derivation preserves, not a transition to record.
  if (derived === ex.status || derived === "renewed") return false;

  await db
    .update(exceptions)
    .set({ status: derived, updatedAt: new Date() })
    .where(eq(exceptions.id, ex.id));

  await recordEvent({
    workspaceId: ex.workspaceId,
    exceptionId: ex.id,
    kind: "status_changed",
    note: `${ex.status} → ${derived}`,
    actor: "system",
  });
  return true;
}

async function nagIfDue(workspace: Workspace, ex: Exception, now: string): Promise<boolean> {
  if (!workspace.nagEmailEnabled && !workspace.nagSlackEnabled) return false;

  const days = daysBetween(now, ex.expiryDate);
  const sent = await db
    .select({ leadDays: nagLog.leadDays })
    .from(nagLog)
    .where(eq(nagLog.exceptionId, ex.id));

  const decision = decideNag(days, workspace.nagLeadDays, sent.map((s) => s.leadDays));
  if (!decision) return false;

  // Claim the milestones first: a crash mid-send must not re-nag on the next run.
  await db
    .insert(nagLog)
    .values(decision.consume.map((leadDays) => ({ exceptionId: ex.id, leadDays })))
    .onConflictDoNothing();

  const subject = nagSubject(ex.title, days);
  const recipients = [...new Set([ex.riskOwnerEmail, ex.approverEmail])].filter(Boolean);

  if (workspace.nagEmailEnabled) {
    await sendEmail({
      to: recipients,
      subject,
      html: nagHtml(workspace, ex, days),
      text: nagText(workspace, ex, days),
    });
  }
  if (workspace.nagSlackEnabled && workspace.slackWebhookUrl) {
    await sendSlack(workspace.slackWebhookUrl, slackText(workspace, ex, days));
  }

  await recordEvent({
    workspaceId: ex.workspaceId,
    exceptionId: ex.id,
    kind: "nag_sent",
    note: `${subject} → ${recipients.join(", ")}`,
    actor: "system",
  });
  return true;
}

/* -------------------------------------------------------------------------- */
/* Message bodies                                                             */
/* -------------------------------------------------------------------------- */

function appUrl(workspace: Workspace, ex: Exception): string {
  const base = (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/w/${workspace.slug}/exceptions/${ex.id}`;
}

function lede(ex: Exception, days: number): string {
  if (days < 0) return `expired ${relativeDays(days)} and is still open`;
  if (days === 0) return "expires today";
  return `expires ${relativeDays(days)}`;
}

export function nagText(workspace: Workspace, ex: Exception, days: number): string {
  return [
    `"${ex.title}" ${lede(ex, days)}.`,
    "",
    `Type:                  ${EXCEPTION_TYPE_LABELS[ex.type]}`,
    `Risk level:            ${RISK_LEVEL_LABELS[ex.riskLevel]}`,
    `Expiry date:           ${ex.expiryDate}`,
    `Risk owner:            ${ex.riskOwnerName} <${ex.riskOwnerEmail}>`,
    `Approver:              ${ex.approverName} <${ex.approverEmail}>`,
    `Compensating control:  ${ex.compensatingControl || "—"}`,
    "",
    "Renew it, extend it, or close it:",
    appUrl(workspace, ex),
    "",
    `— Lapse, the exception register for ${workspace.name}`,
  ].join("\n");
}

export function nagHtml(workspace: Workspace, ex: Exception, days: number): string {
  const urgent = days <= 0;
  const accent = urgent ? "#b91c1c" : "#b45309";
  const row = (label: string, value: string) =>
    `<tr><td style="padding:5px 16px 5px 0;color:#6b7280;font-size:13px;white-space:nowrap">${label}</td>` +
    `<td style="padding:5px 0;color:#111827;font-size:13px">${escapeHtml(value)}</td></tr>`;

  return `<div style="font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111827">
  <p style="margin:0 0 20px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${accent}">
    ${urgent ? "Action overdue" : "Expiring soon"}
  </p>
  <p style="margin:0 0 8px;font-size:19px;font-weight:700;line-height:1.35">${escapeHtml(ex.title)}</p>
  <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#374151">
    This exception <strong style="color:${accent}">${lede(ex, days)}</strong>.
    It stays on the register — and in the auditor export — until someone renews, extends or closes it.
  </p>
  <table style="border-collapse:collapse;margin:0 0 24px;width:100%">
    ${row("Type", EXCEPTION_TYPE_LABELS[ex.type])}
    ${row("Risk level", RISK_LEVEL_LABELS[ex.riskLevel])}
    ${row("Expiry date", ex.expiryDate)}
    ${row("Risk owner", `${ex.riskOwnerName} <${ex.riskOwnerEmail}>`)}
    ${row("Approver", `${ex.approverName} <${ex.approverEmail}>`)}
    ${row("Compensating control", ex.compensatingControl || "—")}
  </table>
  <p style="margin:0 0 28px">
    <a href="${appUrl(workspace, ex)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:14px">Review this exception</a>
  </p>
  <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6">
    Lapse — the exception register for ${escapeHtml(workspace.name)}.
  </p>
</div>`;
}

export function slackText(workspace: Workspace, ex: Exception, days: number): string {
  const flag = days <= 0 ? ":rotating_light:" : ":hourglass_flowing_sand:";
  return [
    `${flag} *${ex.title}* ${lede(ex, days)}.`,
    `_${EXCEPTION_TYPE_LABELS[ex.type]} · ${RISK_LEVEL_LABELS[ex.riskLevel]} risk · owner ${ex.riskOwnerName} · approver ${ex.approverName}_`,
    appUrl(workspace, ex),
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

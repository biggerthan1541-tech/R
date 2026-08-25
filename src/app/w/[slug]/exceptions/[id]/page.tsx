import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { getException } from "@/lib/exceptions";
import { deriveStatus, daysUntilExpiry } from "@/lib/status";
import { addDays, relativeDays, today } from "@/lib/dates";
import { EVENT_KIND_LABELS, EXCEPTION_TYPE_LABELS, RISK_LEVEL_LABELS } from "@/lib/labels";
import { STATUS_STYLES, StatusChip, Tag } from "@/components/badges";
import { ReasonAction } from "@/components/exception-actions";
import {
  closeExceptionAction,
  moveExpiryAction,
  reopenExceptionAction,
  type FormState,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function ExceptionPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { workspace } = await requireWorkspace(slug);
  const exception = await getException(workspace.id, id);
  if (!exception) notFound();

  const now = today();
  const status = deriveStatus(exception, now);
  const days = daysUntilExpiry(exception, now);
  const isClosed = Boolean(exception.closedAt);
  const nagCount = exception.events.filter((e) => e.kind === "nag_sent").length;

  async function renew(prev: FormState, formData: FormData) {
    "use server";
    return moveExpiryAction(slug, id, "renewed", prev, formData);
  }
  async function extend(prev: FormState, formData: FormData) {
    "use server";
    return moveExpiryAction(slug, id, "extended", prev, formData);
  }
  async function close(prev: FormState, formData: FormData) {
    "use server";
    return closeExceptionAction(slug, id, prev, formData);
  }
  async function reopen(prev: FormState, formData: FormData) {
    "use server";
    return reopenExceptionAction(slug, id, prev, formData);
  }

  const fields: Array<[string, React.ReactNode]> = [
    ["Type", EXCEPTION_TYPE_LABELS[exception.type]],
    ["Residual risk", RISK_LEVEL_LABELS[exception.riskLevel]],
    ["Risk owner", `${exception.riskOwnerName} · ${exception.riskOwnerEmail}`],
    ["Approver", `${exception.approverName} · ${exception.approverEmail}`],
    ["Expires on", exception.expiryDate],
    ["Logged on", exception.createdAt.toISOString().slice(0, 10)],
    [
      "Frameworks",
      exception.frameworkTags.length > 0 ? (
        <span className="flex flex-wrap gap-1">
          {exception.frameworkTags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </span>
      ) : (
        <span className="text-neutral-600">None</span>
      ),
    ],
    [
      "Evidence",
      exception.evidenceUrl ? (
        <a
          href={exception.evidenceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-accent-700 underline underline-offset-[3px] hover:text-accent"
        >
          {exception.evidenceUrl}
        </a>
      ) : (
        <span className="text-neutral-600">None linked</span>
      ),
    ],
  ];

  return (
    <main className="flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="rule-r">
        <div className="rule-b px-6 py-6">
          <Link href={`/w/${slug}`} className="btn-ghost mb-3 pl-0">
            ← Register
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <StatusChip status={status} full />
            <span className="text-[11px] uppercase tracking-[0.06em] text-neutral-600">
              {EXCEPTION_TYPE_LABELS[exception.type]} · {RISK_LEVEL_LABELS[exception.riskLevel]} risk
            </span>
          </div>
          <h2 className="mt-2.5 mb-2 max-w-[26ch]">{exception.title}</h2>
          <p className="m-0 max-w-[68ch] text-[14px] text-neutral-800">
            {exception.description || "No business justification recorded."}
          </p>
        </div>

        {!isClosed && (status === "expired" || status === "expiring") && (
          <div
            className="flex flex-wrap items-center gap-4 border-b-2 px-6 py-4"
            style={
              status === "expired"
                ? { background: "var(--color-accent-100)", borderColor: "var(--color-accent)" }
                : { background: "var(--color-warn-bg)", borderColor: "var(--color-warn-edge)" }
            }
          >
            <span
              className="num text-[22px] font-extrabold"
              style={{ color: STATUS_STYLES[status].text }}
            >
              {status === "expired"
                ? `EXPIRED ${-days} days ago`
                : `Expires ${relativeDays(days)}`}
            </span>
            <span
              className="text-[13px]"
              style={{ color: status === "expired" ? "var(--color-accent-900)" : "var(--color-warn)" }}
            >
              {status === "expired"
                ? "Still on the register and still on the auditor export."
                : "Renewal or closure required before the expiry date."}
              {nagCount > 0 && ` Owner reminded ${nagCount} time${nagCount === 1 ? "" : "s"}.`}
            </span>
          </div>
        )}

        <div className="rule-b grid sm:grid-cols-2">
          {fields.map(([label, value]) => (
            <div key={label} className="hair-b hair-r px-6 py-3.5">
              <div className="kicker mb-1">{label}</div>
              <div className="num text-[14px]">{value}</div>
            </div>
          ))}
        </div>

        <div className="rule-b bg-surface px-6 py-5">
          <div className="kicker mb-2 text-neutral-700">Compensating control</div>
          <p className="m-0 max-w-[74ch] text-[15px] whitespace-pre-wrap">
            {exception.compensatingControl || (
              <span className="text-neutral-600">
                Nothing recorded — an auditor will ask what reduces the risk while this stands.
              </span>
            )}
          </p>
        </div>

        <div className="px-6 py-5">
          <div className="kicker mb-3.5 text-neutral-700">Approval chain</div>
          <div className="hair grid sm:grid-cols-2">
            <div className="px-3.5 py-3">
              <div className="kicker">Risk owner — accountable</div>
              <div className="mt-1 text-[14px] font-semibold">{exception.riskOwnerName}</div>
              <div className="num text-[12px] text-neutral-700">{exception.riskOwnerEmail}</div>
            </div>
            <div className="border-l border-[var(--divider)] px-3.5 py-3">
              <div className="kicker">Approver — accepted the risk</div>
              <div className="mt-1 text-[14px] font-semibold">{exception.approverName}</div>
              <div className="num text-[12px] text-neutral-700">{exception.approverEmail}</div>
            </div>
          </div>
          <Link href={`/w/${slug}/exceptions/${id}/edit`} className="btn-secondary mt-4">
            Edit details
          </Link>
        </div>
      </div>

      <aside className="px-6 py-6">
        <div className="kicker mb-4 text-neutral-700">Actions</div>
        <div className="mb-8 flex flex-col gap-2">
          {isClosed ? (
            <ReasonAction
              label="Reopen"
              summary="Puts the exception back on the register with its existing expiry date."
              action={reopen}
              reasonPlaceholder="Closed in error; the vendor feed is still live."
            />
          ) : (
            <>
              <ReasonAction
                label="Renew"
                summary="Still justified for another full term. Reminders re-arm from the new date."
                action={renew}
                withExpiry
                defaultExpiry={addDays(today(), 90)}
                reasonPlaceholder="Reviewed with the risk owner; vendor migration slipped to Q4."
              />
              <ReasonAction
                label="Extend"
                summary="A short grace period while the fix lands. Same exception, later date."
                action={extend}
                withExpiry
                defaultExpiry={addDays(exception.expiryDate, 30)}
                reasonPlaceholder="TLS cutover scheduled for the 14th; need two more weeks."
              />
              <ReasonAction
                label="Close & revoke"
                summary="The underlying risk is gone or the access has been revoked."
                tone="primary"
                action={close}
                reasonPlaceholder="Vendor migrated to the API; firewall rule removed in change CHG-2291."
              />
            </>
          )}
        </div>

        <div className="kicker mb-4 text-neutral-700">Event timeline</div>
        <div className="flex flex-col">
          {exception.events.map((e, i) => {
            const last = i === exception.events.length - 1;
            const accent = e.kind === "nag_sent" || e.kind === "status_changed";
            return (
              <div key={e.id} className="grid grid-cols-[14px_1fr] gap-3.5">
                <div className="flex flex-col items-center">
                  <div
                    className="mt-1.5 h-2.5 w-2.5"
                    style={{
                      background: accent ? "var(--color-accent)" : "var(--color-neutral-800)",
                    }}
                  />
                  {!last && <div className="w-0.5 flex-1 bg-neutral-300" />}
                </div>
                <div className="pb-5.5">
                  <div className="num text-[11px] tracking-[0.04em] text-neutral-600">
                    {e.timestamp.toISOString().replace("T", " ").slice(0, 16)}
                  </div>
                  <div
                    className="text-[14px] font-semibold"
                    style={{ color: accent ? "var(--color-accent-700)" : undefined }}
                  >
                    {EVENT_KIND_LABELS[e.kind]}
                  </div>
                  {e.note && <div className="text-[13px] text-neutral-800">{e.note}</div>}
                  <div className="text-[12px] text-neutral-700">{e.actor}</div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </main>
  );
}

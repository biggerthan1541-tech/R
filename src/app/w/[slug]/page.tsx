import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { listExceptions } from "@/lib/exceptions";
import { applyQuery, facets, parseQuery, type SortKey } from "@/lib/filter";
import { daysUntilExpiry, deriveStatus, STATUS_LABELS } from "@/lib/status";
import { today } from "@/lib/dates";
import { EXCEPTION_TYPE_LABELS } from "@/lib/labels";
import { EXCEPTION_TYPES } from "@/lib/enums";
import { RiskLabel, STATUS_STYLES, StatusChip, Tag } from "@/components/badges";
import type { ExceptionWithEvents } from "@/lib/export";
import { EmptyRegister } from "@/components/empty-register";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const FILTERS = [
  { key: "all", label: "All" },
  { key: "expired", label: "Expired but open" },
  { key: "expiring", label: "Expiring ≤14d" },
  { key: "open", label: "Open" },
  { key: "renewed", label: "Renewed" },
  { key: "closed", label: "Closed" },
] as const;

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const { workspace } = await requireWorkspace(slug);
  const raw = await searchParams;
  const query = parseQuery(raw);
  const now = today();

  const all = await listExceptions(workspace.id);
  if (all.length === 0) return <EmptyRegister slug={slug} workspaceName={workspace.name} />;

  const rows = applyQuery(all, query, now);
  const { owners, frameworks } = facets(all);

  const statusOf = (r: ExceptionWithEvents) => deriveStatus(r, now);
  const counts = {
    all: all.length,
    expired: all.filter((r) => statusOf(r) === "expired").length,
    expiring: all.filter((r) => statusOf(r) === "expiring").length,
    open: all.filter((r) => statusOf(r) === "open").length,
    renewed: all.filter((r) => statusOf(r) === "renewed").length,
    closed: all.filter((r) => statusOf(r) === "closed").length,
  };

  const overdue = all
    .filter((r) => statusOf(r) === "expired")
    .sort((a, b) => daysUntilExpiry(a, now) - daysUntilExpiry(b, now));
  const oldestLapse = overdue.length > 0 ? -daysUntilExpiry(overdue[0], now) : 0;
  const expiring = all.filter((r) => statusOf(r) === "expiring");
  const uncontrolled = expiring.filter((r) => !r.compensatingControl.trim()).length;

  return (
    <main className="flex flex-1 flex-col">
      <section className="rule-b grid md:grid-cols-2">
        <div
          className="hair-r border-l-[6px] bg-accent-100 px-6 pt-6 pb-5"
          style={{ borderLeftColor: "var(--color-accent)" }}
        >
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="eyebrow text-accent-700">■ Expired but still open</span>
            <span className="text-[11px] text-accent-800/80">
              The number an auditor reads first
            </span>
          </div>
          <div className="mt-2.5 flex items-end gap-4">
            <span className="num text-[56px] leading-[0.9] font-extrabold text-accent-700">
              {counts.expired}
            </span>
            <p className="mb-1.5 max-w-[34ch] text-[13px] text-accent-900">
              {counts.expired === 0 ? (
                "Nothing on the register is past its expiry date. Keep it that way."
              ) : (
                <>
                  exception{counts.expired === 1 ? "" : "s"} past expiry with nobody having renewed
                  or closed them. Oldest lapsed <strong className="num">{oldestLapse} days</strong>{" "}
                  ago.
                </>
              )}
            </p>
          </div>
          {counts.expired > 0 && (
            <div className="mt-4 flex gap-2">
              <Link className="btn-primary" href={`/w/${slug}?status=expired`}>
                Review all {counts.expired}
              </Link>
              <Link className="btn-secondary" href={`/w/${slug}/exceptions/${overdue[0].id}`}>
                Open oldest
              </Link>
            </div>
          )}
        </div>

        <div className="border-l-[6px] px-6 pt-6 pb-5" style={{ borderLeftColor: "var(--color-warn-edge)" }}>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="eyebrow text-warn">▲ Expiring in ≤ 14 days</span>
            <span className="text-[11px] text-neutral-700">Renewal or closure required</span>
          </div>
          <div className="mt-2.5 flex items-end gap-4">
            <span className="num text-[56px] leading-[0.9] font-extrabold text-warn">
              {counts.expiring}
            </span>
            <p className="mb-1.5 max-w-[34ch] text-[13px] text-neutral-800">
              {counts.expiring === 0 ? (
                "Nothing reaches expiry this fortnight."
              ) : (
                <>
                  exception{counts.expiring === 1 ? "" : "s"} reach expiry this fortnight.{" "}
                  {uncontrolled > 0 && (
                    <>
                      <strong className="num">{uncontrolled}</strong> ha
                      {uncontrolled === 1 ? "s" : "ve"} no compensating control on file.
                    </>
                  )}
                </>
              )}
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            {counts.expiring > 0 && (
              <Link className="btn-secondary" href={`/w/${slug}?status=expiring`}>
                Review queue
              </Link>
            )}
            <a className="btn-ghost" href={`/w/${slug}/export/pdf`}>
              Export for auditor →
            </a>
          </div>
        </div>
      </section>

      <section className="hair-b flex flex-wrap items-center gap-4 px-6 py-3">
        <div className="hair flex flex-wrap items-center">
          {FILTERS.map((f, i) => {
            const active = (query.status ?? "all") === f.key;
            return (
              <Link
                key={f.key}
                href={filterHref(slug, raw, f.key)}
                className={`px-3.5 py-[7px] text-[13px] ${i > 0 ? "border-l border-[var(--divider)]" : ""} ${
                  active ? "bg-accent text-bg" : "text-ink hover:bg-neutral-200"
                }`}
              >
                {f.label}
                <span className="num ml-1.5 opacity-55">{counts[f.key]}</span>
              </Link>
            );
          })}
        </div>

        <form method="get" className="flex flex-wrap items-center gap-2">
          {query.status && <input type="hidden" name="status" value={query.status} />}
          <input type="hidden" name="sort" value={query.sort} />
          <input type="hidden" name="dir" value={query.dir} />
          <input
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Search owner, control, title…"
            className="input w-56"
          />
          <select name="type" defaultValue={query.type ?? "all"} className="input w-44">
            <option value="all">All types</option>
            {EXCEPTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {EXCEPTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <select name="owner" defaultValue={query.owner ?? "all"} className="input w-40">
            <option value="all">All owners</option>
            {owners.map((o) => (
              <option key={o.email} value={o.email}>
                {o.name}
              </option>
            ))}
          </select>
          <select name="framework" defaultValue={query.framework ?? "all"} className="input w-36">
            <option value="all">All frameworks</option>
            {frameworks.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button className="btn-secondary">Apply</button>
        </form>

        <span className="num ml-auto text-[12px] text-neutral-700">
          {rows.length} of {all.length} shown
        </span>
        <a className="btn-secondary" href={`/w/${slug}/export/csv`}>
          Export CSV
        </a>
        <a className="btn-primary" href={`/w/${slug}/export/pdf`}>
          Export PDF
        </a>
      </section>

      <section className="flex-1 overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <Th sortKey="title" query={raw} slug={slug} label="Exception" className="pl-6" />
              <Th sortKey="owner" query={raw} slug={slug} label="Owner" className="w-44" />
              <Th sortKey="risk" query={raw} slug={slug} label="Risk" className="w-24" />
              <Th sortKey="status" query={raw} slug={slug} label="Status" className="w-44" />
              <Th sortKey="expiry" query={raw} slug={slug} label="Expiry" className="w-32" />
              <th className="w-52 pr-6">Countdown</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const status = statusOf(r);
              const style = STATUS_STYLES[status];
              const days = daysUntilExpiry(r, now);
              return (
                <tr
                  key={r.id}
                  className="rowlink"
                  style={{ borderLeft: `4px solid ${style.edge}` }}
                >
                  <td className="py-2.5 pl-5">
                    <Link href={`/w/${slug}/exceptions/${r.id}`} className="font-semibold text-ink">
                      {r.title}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-neutral-700">
                      <span>{EXCEPTION_TYPE_LABELS[r.type]}</span>
                      {r.frameworkTags.map((t) => (
                        <Tag key={t}>{t}</Tag>
                      ))}
                    </div>
                  </td>
                  <td className="text-[13px]">
                    <div>{r.riskOwnerName}</div>
                    <div className="text-[12px] text-neutral-700">{r.riskOwnerEmail}</div>
                  </td>
                  <td>
                    <RiskLabel level={r.riskLevel} />
                  </td>
                  <td>
                    <StatusChip status={status} full />
                  </td>
                  <td className="num text-[13px]">{r.expiryDate}</td>
                  <td
                    className="num pr-6 text-[13px]"
                    style={{ color: style.text, fontWeight: status === "expired" ? 700 : 400 }}
                  >
                    {countdown(r.closedAt, days)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="hair-b px-6 py-16">
            <h4 className="mb-1.5">No exceptions match this filter</h4>
            <p className="mb-4 max-w-[46ch] text-[13px] text-neutral-700">
              {all.length} exception{all.length === 1 ? " is" : "s are"} on the register — none of
              them match what you have selected.
            </p>
            <Link className="btn-secondary" href={`/w/${slug}`}>
              Clear filters
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

function countdown(closedAt: Date | null, days: number): string {
  if (closedAt) return `Closed ${closedAt.toISOString().slice(0, 10)}`;
  if (days < 0) return `EXPIRED ${-days} days ago`;
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}

function filterHref(slug: string, query: SearchParams, status: string): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (typeof v === "string" && k !== "status") search.set(k, v);
  }
  if (status !== "all") search.set("status", status);
  const qs = search.toString();
  return qs ? `/w/${slug}?${qs}` : `/w/${slug}`;
}

function Th({
  sortKey,
  label,
  query,
  slug,
  className = "",
}: {
  sortKey: SortKey;
  label: string;
  query: SearchParams;
  slug: string;
  className?: string;
}) {
  const current = parseQuery(query);
  const active = current.sort === sortKey;
  const next = active && current.dir === "asc" ? "desc" : "asc";

  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (typeof v === "string" && k !== "sort" && k !== "dir") search.set(k, v);
  }
  search.set("sort", sortKey);
  search.set("dir", next);

  return (
    <th className={className}>
      <Link
        href={`/w/${slug}?${search}`}
        className={`inline-flex items-center gap-1 hover:text-accent ${active ? "text-ink" : ""}`}
      >
        {label}
        <span aria-hidden className={active ? "" : "opacity-0"}>
          {current.dir === "asc" ? "↑" : "↓"}
        </span>
      </Link>
    </th>
  );
}

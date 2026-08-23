import type { ClientRow, EvidenceRow, PackRow } from '../db/tenant.ts';
import type { Assessment } from '../domain/readiness.ts';
import type { Control, ProfileDefinition } from '../domain/types.ts';
import { formatDate, formatDateTime, html, raw, type SafeHtml } from './html.ts';
import { csrfField, page, requirementPill, statusPill, type ViewContext } from './layout.ts';

export type ClientSummary = {
  client: ClientRow;
  profileName: string | null;
  score: number | null;
  state: string | null;
  stateHeadline: string | null;
  answered: number;
  total: number;
  topGap: string | null;
  lastActivity: string | null;
};

/**
 * The roll-up console: every client an MSP has, with where each one stands, on
 * one screen. Sorted worst-first, because the reason to open this page is to
 * find out who needs attention.
 */
export function consolePage(input: {
  ctx: ViewContext;
  summaries: ClientSummary[];
  profiles: ProfileDefinition[];
  canCreate: boolean;
  flash: { ok?: string; err?: string };
}): string {
  const { ctx, summaries, profiles, canCreate, flash } = input;

  const scored = summaries.filter((row) => row.score !== null);
  const averageScore = scored.length
    ? Math.round(scored.reduce((sum, row) => sum + (row.score ?? 0), 0) / scored.length)
    : null;
  const notReady = summaries.filter((row) => row.state === 'not_ready').length;
  const unconfigured = summaries.filter((row) => row.score === null).length;

  const body = html`
    ${flash.err ? html`<div class="err">${flash.err}</div>` : ''}
    ${flash.ok ? html`<div class="ok">${flash.ok}</div>` : ''}

    <h1>${ctx.msp.name}</h1>
    <p class="lede">
      Every client you manage, worst first. Nothing from another provider is reachable from this
      account. <a href="/audit">Audit log</a> · <a href="/users">People</a>
    </p>

    <div class="grid mb-2xl">
      <div class="stat"><div class="n">${summaries.length}</div><div class="k">Clients</div></div>
      <div class="stat"><div class="n">${averageScore ?? '—'}</div><div class="k">Average readiness</div></div>
      <div class="stat"><div class="n">${notReady}</div><div class="k">Not ready</div></div>
      <div class="stat"><div class="n">${unconfigured}</div><div class="k">Awaiting setup</div></div>
    </div>

    ${summaries.length === 0
      ? html`<div class="card"><p class="muted m0">
          No clients yet.${canCreate ? ' Add your first one below — it takes about a minute.' : ''}
        </p></div>`
      : html`<div class="card">
          <table class="t-console">
            <thead><tr>
              <th>Client</th><th>Score</th><th>Status</th>
              <th>Assessed against</th><th>Answered</th><th>Biggest gap</th>
            </tr></thead>
            <tbody>
              ${summaries.map(
                (row) => html`<tr>
                  <td>
                    <a href="/clients/${row.client.id}"><strong>${row.client.name}</strong></a>
                    ${row.client.industry ? html`<br /><span class="muted small">${row.client.industry}</span>` : ''}
                  </td>
                  <td>${row.score === null ? html`<span class="muted">—</span>` : html`<strong>${row.score}</strong>`}</td>
                  <td>${row.state ? statePill(row.state, row.stateHeadline ?? row.state) : html`<span class="pill unknown">Not set up</span>`}</td>
                  <td class="small muted">${row.profileName ?? 'No profile assigned'}</td>
                  <td class="small muted">${row.total > 0 ? html`${row.answered}/${row.total}` : '—'}</td>
                  <td class="small muted">${row.topGap ?? (row.score === null ? 'Assign a profile to begin' : 'Nothing outstanding')}</td>
                </tr>`,
              )}
            </tbody>
          </table>
        </div>`}

    ${canCreate
      ? html`
          <h2>Add a client</h2>
          <form method="post" action="/clients" class="card">
            ${csrfField(ctx)}
            <p class="hint mt0">
              Name and one profile is enough to start — everything else can wait. You land straight
              on the control form, so a new client goes from nothing to a scored evidence pack in a
              single sitting.
            </p>
            <div class="row">
              <div><label for="name">Company name</label><input type="text" id="name" name="name" required autofocus></div>
              <div><label for="industry">Industry <span class="muted">(optional)</span></label><input type="text" id="industry" name="industry"></div>
            </div>
            <div class="row mt-sm">
              <div><label for="employeeCount">Staff <span class="muted">(optional)</span></label><input type="number" id="employeeCount" name="employeeCount" min="0"></div>
              <div><label for="primaryContact">Main contact <span class="muted">(optional)</span></label><input type="text" id="primaryContact" name="primaryContact"></div>
            </div>
            <div class="mt-md">
              <label>Assess against</label>
              <div class="hint mb-xs">Pick at least one. You can change this later.</div>
              ${profiles.map(
                (profile, index) => html`<label class="checkbox-row">
                  <input type="checkbox" name="profileKey" value="${profile.key}"
                    ${raw(index === 0 ? 'checked' : '')}>
                  ${profile.name} <span class="muted small">— ${profile.publisher}</span>
                </label>`,
              )}
            </div>
            <div class="mt-md"><button type="submit">Add client and start recording</button></div>
          </form>
        `
      : ''}
  `;
  return page(ctx.msp.name, ctx, body);
}

function statePill(state: string, label: string): SafeHtml {
  const tone = state === 'ready' ? 'pass' : state === 'conditional' ? 'partial' : 'fail';
  return html`<span class="pill ${raw(tone)}">${label}</span>`;
}

export function clientPage(input: {
  ctx: ViewContext;
  client: ClientRow;
  controls: Control[];
  current: Map<string, EvidenceRow>;
  profiles: ProfileDefinition[];
  assignedProfiles: string[];
  assessment: Assessment | null;
  packs: PackRow[];
  portalSection: SafeHtml | null;
  permissions: { evidenceWrite: boolean; configure: boolean; generate: boolean };
  flash: { ok?: string; err?: string };
}): string {
  const { ctx, client, controls, current, profiles, assignedProfiles, assessment, packs, flash } = input;
  const { permissions } = input;

  const body = html`
    ${flash.err ? html`<div class="err">${flash.err}</div>` : ''}
    ${flash.ok ? html`<div class="ok">${flash.ok}</div>` : ''}

    <nav class="crumbs"><a href="/">Clients</a></nav>
    <h1>${client.name}</h1>
    <p class="lede">
      ${[client.industry, client.employee_count ? `${client.employee_count} staff` : null, client.primary_contact]
        .filter(Boolean)
        .join(' · ') || 'No profile details recorded'}
    </p>

    ${assignedProfiles.length > 1 && assessment
      ? html`<div class="tabs">
          ${assignedProfiles.map((key) => {
            const profile = profiles.find((p) => p.key === key);
            const active = key === assessment.profile.key;
            return html`<a class="tab ${raw(active ? 'active' : '')}"
              href="/clients/${client.id}?profile=${key}">${profile?.name ?? key}</a>`;
          })}
        </div>`
      : ''}

    ${assessment
      ? html`
          <div class="grid mb-lg">
            <div class="stat"><div class="n">${assessment.score}</div><div class="k">Readiness score</div></div>
            <div class="stat"><div class="n">${assessment.stateHeadline}</div><div class="k">${assessment.profile.name}</div></div>
            <div class="stat"><div class="n">${assessment.counts.pass}/${assessment.controls.length}</div><div class="k">Controls in place</div></div>
            <div class="stat"><div class="n">${assessment.coverage.answered}/${assessment.coverage.total}</div><div class="k">Answered</div></div>
          </div>
          <div class="card tight"><p class="small m0">${assessment.stateExplanation}</p></div>
          ${permissions.generate
            ? html`<form method="post" action="/clients/${client.id}/packs" class="block-gap">
            ${csrfField(ctx)}
            <input type="hidden" name="profileKey" value="${assessment.profile.key}">
            <div class="row">
              <div class="field-narrow">
                <label for="generatedBy">Generate pack as</label>
                <input type="text" id="generatedBy" name="generatedBy" value="MSP technician" required>
              </div>
              <div class="field-auto"><button type="submit">Generate evidence pack</button></div>
            </div>
          </form>`
            : ''}
        `
      : html`<div class="card"><p class="muted m0">
          Assign a requirement profile below to see this client's readiness score.
        </p></div>`}

    <h2>Requirement profiles</h2>
    ${permissions.configure
      ? html`<form method="post" action="/clients/${client.id}/profiles" class="card">
      ${csrfField(ctx)}
      <p class="hint mt0">
        Which obligations does this client have to satisfy? Scoring and the evidence pack are always
        relative to a profile, so at least one is needed. Profiles are data --
        add your own in <code>config/profiles/</code>.
      </p>
      ${profiles.map(
        (profile) => html`<div class="mb-sm">
          <label class="semibold">
            <input type="checkbox" name="profileKey" value="${profile.key}"
              ${raw(assignedProfiles.includes(profile.key) ? 'checked' : '')}>
            ${profile.name}
            <span class="muted small normal-weight">— ${profile.publisher} ${profile.version}</span>
          </label>
          <div class="hint indent">${profile.description}</div>
        </div>`,
      )}
      <button type="submit">Save profiles</button>
    </form>`
      : html`<div class="card"><p class="small muted m0">
          Assessed against ${assignedProfiles.length > 0 ? assignedProfiles.join(', ') : 'no profile yet'}.
          Your role cannot change this.
        </p></div>`}

    <h2>Record where this client stands</h2>
    ${permissions.evidenceWrite
      ? html`<form method="post" action="/clients/${client.id}/evidence" class="card">
      ${csrfField(ctx)}
      <div class="row mb-xs">
        <div class="field-mid">
          <label for="recordedBy">Recorded by</label>
          <input type="text" id="recordedBy" name="recordedBy" value="MSP technician" required>
          <div class="hint">Stamped onto every record you save below.</div>
        </div>
      </div>
      ${controls.map((control) => controlField(control, current.get(control.key), assessment))}
      <div class="mt-lg"><button type="submit">Save evidence</button>
        <span class="hint inline-note">
          Only changed answers are written. Nothing is ever overwritten.
        </span>
      </div>
    </form>`
      : html`<div class="card">
          ${controls.map((control) => readOnlyControl(control, current.get(control.key)))}
          <p class="hint tight-gap">Your role is read-only, so these cannot be changed.</p>
        </div>`}

    ${input.portalSection ?? ''}

    <h2>Evidence packs</h2>
    ${packs.length === 0
      ? html`<div class="card"><p class="muted m0">None generated yet.</p></div>`
      : html`<div class="card"><table>
          <thead><tr><th>Generated</th><th>Standard</th><th>Score</th><th>Verdict</th><th>By</th><th></th></tr></thead>
          <tbody>
            ${packs.map(
              (pack) => html`<tr>
                <td>${formatDateTime(pack.generated_at)}</td>
                <td class="muted">${pack.profile_key}</td>
                <td><strong>${pack.score}</strong></td>
                <td class="muted">${pack.state.replace('_', ' ')}</td>
                <td class="muted">${pack.generated_by}</td>
                <td><a href="/packs/${pack.id}" target="_blank">Open</a></td>
              </tr>`,
            )}
          </tbody>
        </table></div>`}

    <h2>Evidence history</h2>
    <div class="card tight">
      <p class="small m0">
        Every answer ever recorded for this client is kept, dated and attributed.
        <a href="/clients/${client.id}/history">View the full audit trail</a>.
      </p>
    </div>
  `;
  return page(client.name, ctx, body);
}

function controlField(
  control: Control,
  row: EvidenceRow | undefined,
  assessment: Assessment | null,
): SafeHtml {
  const currentValue = row ? (JSON.parse(row.answer_value) as unknown) : null;
  const assessed = assessment?.controls.find((c) => c.controlKey === control.key);

  return html`<div class="control">
    <div class="control-head">
      <h3>${control.title}</h3>
      ${statusPill(row?.status ?? 'unknown')}
      ${assessed ? requirementPill(assessed.requirement) : ''}
      <span class="muted small push-right">${control.category}</span>
    </div>
    <div class="hint">${control.question}${control.help ? html` ${control.help}` : ''}</div>
    <div class="row">
      <div>${answerInput(control, currentValue)}</div>
      <div>
        <input type="text" name="note__${control.key}" value="${row?.note ?? ''}"
          placeholder="Note (optional) — e.g. where the evidence lives">
      </div>
    </div>
    ${row
      ? html`<div class="hint mt-xs">
          Last recorded ${formatDateTime(row.recorded_at)} by ${row.recorded_by} (${row.source}) ·
          <a href="/clients/${row.client_id}/history?control=${control.key}">history</a>
        </div>`
      : ''}
  </div>`;
}

function readOnlyControl(control: Control, row: EvidenceRow | undefined): SafeHtml {
  return html`<div class="control">
    <div class="control-head">
      <h3>${control.title}</h3>
      ${statusPill(row?.status ?? 'unknown')}
      <span class="muted small push-right">${control.category}</span>
    </div>
    <div class="hint">
      ${row ? html`${row.answer_label} — recorded ${formatDateTime(row.recorded_at)} by ${row.recorded_by}` : 'Not answered'}
    </div>
  </div>`;
}

function answerInput(control: Control, currentValue: unknown): SafeHtml {
  const name = `answer__${control.key}`;
  switch (control.answer.type) {
    case 'enum':
      return html`<select name="${name}">
        <option value="">— not answered —</option>
        ${control.answer.options.map(
          (option) => html`<option value="${option.value}"
            ${raw(option.value === currentValue ? 'selected' : '')}>${option.label}</option>`,
        )}
      </select>`;
    case 'boolean':
      return html`<select name="${name}">
        <option value="">— not answered —</option>
        <option value="true" ${raw(currentValue === true ? 'selected' : '')}>Yes</option>
        <option value="false" ${raw(currentValue === false ? 'selected' : '')}>No</option>
      </select>`;
    case 'percent':
      return html`<input type="number" name="${name}" min="0" max="100" step="1"
        value="${currentValue ?? ''}" placeholder="0–100">`;
    case 'number':
      return html`<input type="number" name="${name}" value="${currentValue ?? ''}">`;
  }
}

export function historyPage(input: {
  ctx: ViewContext;
  client: ClientRow;
  records: EvidenceRow[];
  controls: Map<string, Control>;
  controlFilter: string | null;
}): string {
  const { client, records, controls, controlFilter } = input;
  const body = html`
    <nav class="crumbs"><a href="/">Clients</a> / <a href="/clients/${client.id}">${client.name}</a></nav>
    <h1>Evidence history</h1>
    <p class="lede">
      ${controlFilter
        ? html`${controls.get(controlFilter)?.title ?? controlFilter} ·
            <a href="/clients/${client.id}/history">show all controls</a>`
        : html`Every record ever written for ${client.name}, newest first. Records are appended, never edited.`}
    </p>

    ${records.length === 0
      ? html`<div class="card"><p class="muted m0">Nothing recorded yet.</p></div>`
      : html`<div class="card"><table class="t-history">
          <thead><tr><th>When</th><th>Control</th><th>Status</th>
            <th>Answer</th><th>Recorded by</th></tr></thead>
          <tbody>
            ${records.map(
              (record) => html`<tr>
                <td class="small">${formatDateTime(record.recorded_at)}</td>
                <td>${controls.get(record.control_key)?.title ?? record.control_key}</td>
                <td>${statusPill(record.status)}</td>
                <td class="small">
                  ${record.answer_label}
                  ${record.note ? html`<br /><span class="muted">${record.note}</span>` : ''}
                </td>
                <td class="small muted">
                  ${record.recorded_by} · ${record.source}<br />
                  <span class="tiny">definition ${record.control_version}</span>
                </td>
              </tr>`,
            )}
          </tbody>
        </table></div>`}
  `;
  return page(`History — ${client.name}`, input.ctx, body);
}

export function errorPage(ctx: ViewContext, message: string): string {
  return page('Error', ctx, html`<h1>Something went wrong</h1><div class="err">${message}</div>
    <p><a href="/">Back to clients</a></p>`);
}

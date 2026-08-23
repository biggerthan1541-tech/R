import type { ClientRow, EvidenceRow, PackRow } from '../db/tenant.ts';
import type { Assessment, AssessmentDelta, PortfolioAssessment } from '../domain/readiness.ts';
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
  portfolio: PortfolioAssessment;
  delta: AssessmentDelta | null;
  packs: PackRow[];
  portalSection: SafeHtml | null;
  permissions: { evidenceWrite: boolean; configure: boolean; generate: boolean };
  flash: { ok?: string; err?: string };
}): string {
  const { ctx, client, controls, current, profiles, assignedProfiles, portfolio, delta, packs, flash } = input;
  const { permissions } = input;
  const assignedNames = assignedProfiles.map(
    (key) => profiles.find((profile) => profile.key === key)?.name ?? key,
  );

  const body = html`
    ${flash.err ? html`<div class="err">${flash.err}</div>` : ''}
    ${flash.ok ? html`<div class="ok">${flash.ok}</div>` : ''}

    <nav class="crumbs"><a href="/">Clients</a></nav>
    <h1>${client.name}</h1>
    <p class="lede">
      ${[client.industry, client.employee_count ? `${client.employee_count} staff` : null, client.primary_contact]
        .filter(Boolean)
        .join(' · ') || 'No details recorded'}
    </p>

    ${readinessSection(ctx, client.id, portfolio, delta)}

    ${permissions.generate && assignedProfiles.length > 0
      ? html`<h2>Hand this to the client</h2>
          <form method="post" action="/clients/${client.id}/packs" class="card">
            ${csrfField(ctx)}
            <p class="hint mt0">
              Freezes today's position into a dated pack you can share as a link or attach to an
              application as a PDF.
            </p>
            <div class="row">
              <div>
                <label for="profileKey">Assessed against</label>
                <select id="profileKey" name="profileKey">
                  ${assignedProfiles.map(
                    (key, index) => html`<option value="${key}">${assignedNames[index]}</option>`,
                  )}
                </select>
              </div>
              <div class="field-auto"><button type="submit">Generate evidence pack</button></div>
            </div>
          </form>`
      : ''}

    <h2>Requirement profiles</h2>
    ${permissions.configure
      ? html`<form method="post" action="/clients/${client.id}/profiles" class="card">
      ${csrfField(ctx)}
      <p class="hint mt0">
        Which obligations does this client have to satisfy? Scoring is relative to these, so at
        least one is needed. Profiles are data — add your own in <code>config/profiles/</code>.
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
          Assessed against ${assignedNames.length > 0 ? assignedNames.join(', ') : 'no profile yet'}.
          Your role cannot change this.
        </p></div>`}

    <h2>Record where this client stands</h2>
    ${permissions.evidenceWrite
      ? html`<form method="post" action="/clients/${client.id}/evidence" class="card">
      ${csrfField(ctx)}
      ${controls.map((control) => controlField(control, current.get(control.key), portfolio))}
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
  portfolio: PortfolioAssessment,
): SafeHtml {
  const currentValue = row ? (JSON.parse(row.answer_value) as unknown) : null;
  const blocking = portfolio.blockers.some((blocker) => blocker.controlKey === control.key);

  return html`<div class="control" id="control-${control.key}">
    <div class="control-head">
      <h3>${control.title}</h3>
      ${statusPill(row?.status ?? 'unknown')}
      ${blocking ? requirementPill('mandatory') : ''}
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


/**
 * Everything the client is measured against, on one screen, plus the single
 * ordered list of what to do about it. A control three standards all demand is
 * one job for the tech -- so it is shown once, tagged with who wants it.
 */
export function readinessSection(
  ctx: ViewContext,
  clientId: string,
  portfolio: PortfolioAssessment,
  delta: AssessmentDelta | null,
): SafeHtml {
  if (portfolio.profiles.length === 0) {
    return html`<div class="card"><p class="m0 muted">
      Assign at least one requirement profile below to see where this client stands.
    </p></div>`;
  }

  return html`
    <div class="grid mb-lg">
      ${portfolio.profiles.map(
        (profile) => html`<a class="stat profile-stat" href="/clients/${clientId}?profile=${profile.key}">
          <div class="n">${profile.score}</div>
          <div class="k">${profile.name}</div>
          <div class="mt-xs">${statePill(profile.state, profile.stateHeadline)}</div>
        </a>`,
      )}
    </div>

    ${delta ? changeSummary(delta) : ''}

    ${portfolio.blockers.length === 0
      ? html`<div class="ok">
          <strong>Nothing is blocking readiness.</strong>
          ${portfolio.improvements.length > 0
            ? html` ${portfolio.improvements.length} item${portfolio.improvements.length === 1 ? '' : 's'}
                would still improve the score.`
            : ' Every control is fully in place.'}
        </div>`
      : html`<h2>What is blocking "ready"</h2>
          <p class="lede">
            ${portfolio.blockers.length} control${portfolio.blockers.length === 1 ? '' : 's'} that at least
            one standard treats as non-negotiable ${portfolio.blockers.length === 1 ? 'is' : 'are'} not in
            place. Fix these before anything else — the score does not compensate for them.
          </p>
          ${portfolio.blockers.map((blocker) => blockerCard(clientId, blocker, true))}`}

    ${portfolio.improvements.length > 0
      ? html`<h2>Worth fixing next</h2>
          <p class="lede">Costs score and invites questions, but will not stop a policy on its own.</p>
          ${portfolio.improvements.map((blocker) => blockerCard(clientId, blocker, false))}`
      : ''}
  `;
}

function blockerCard(clientId: string, blocker: PortfolioAssessment['blockers'][number], blocking: boolean): SafeHtml {
  return html`<div class="card blocker ${raw(blocking ? 'blocking' : '')}">
    <div class="control-head">
      <h3>${blocker.title}</h3>
      ${statusPill(blocker.status)}
      <span class="muted small push-right">
        ${blocker.answerLabel ? html`Now: ${blocker.answerLabel}` : 'Not answered'}
      </span>
    </div>
    <div class="mb-xs">
      ${blocker.requiredBy.length > 0
        ? html`<span class="pill mandatory">Required by ${blocker.requiredBy.join(', ')}</span> `
        : ''}
      ${blocker.expectedBy.length > 0
        ? html`<span class="pill recommended">Expected by ${blocker.expectedBy.join(', ')}</span>`
        : ''}
    </div>
    <p class="small m0">${blocker.consequence}</p>
    <div class="fixbox mt-sm">
      <strong>What to do</strong>
      <div class="small">${blocker.fix}</div>
    </div>
    <div class="hint mt-xs">
      <a href="#control-${blocker.controlKey}">Update this control</a> ·
      <a href="/clients/${clientId}/history?control=${blocker.controlKey}">history</a>
    </div>
  </div>`;
}

function changeSummary(delta: AssessmentDelta): SafeHtml {
  const direction = delta.scoreDelta > 0 ? 'up' : delta.scoreDelta < 0 ? 'down' : 'flat';
  const sign = delta.scoreDelta > 0 ? '+' : '';
  return html`<div class="card tight">
    <p class="m0 small">
      <strong class="delta-score ${raw(direction)}">
        ${delta.scoreDelta === 0 ? 'No score change' : html`Score ${sign}${delta.scoreDelta}`}
      </strong>
      since the last pack on ${formatDate(delta.since)}${delta.changes.length > 0
        ? html` — ${delta.changes.length} control${delta.changes.length === 1 ? '' : 's'} moved:
            ${delta.changes.slice(0, 4).map((change, index) => html`${index > 0 ? ', ' : ''}${change.title}`)}${delta.changes.length > 4 ? ' …' : ''}`
        : ' — nothing has moved.'}
    </p>
  </div>`;
}

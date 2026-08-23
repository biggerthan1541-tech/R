import type { ClientRow, EvidenceRow, PackRow } from '../db/tenant.ts';
import type { Assessment } from '../domain/readiness.ts';
import type { Control, ProfileDefinition } from '../domain/types.ts';
import { formatDate, formatDateTime, html, raw, type SafeHtml } from './html.ts';
import { csrfField, page, requirementPill, statusPill, type ViewContext } from './layout.ts';

export function clientsPage(
  ctx: ViewContext,
  clients: ClientRow[],
  flash: { ok?: string; err?: string } = {},
): string {
  const body = html`
    ${flash.err ? html`<div class="err">${flash.err}</div>` : ''}
    ${flash.ok ? html`<div class="ok">${flash.ok}</div>` : ''}

    <h1>Clients</h1>
    <p class="lede">Every client below belongs to ${ctx.msp.name}. Nothing from another provider is reachable from here.</p>

    ${clients.length === 0
      ? html`<div class="card"><p class="muted" style="margin:0">
          No clients yet. Add your first one below, then record where they stand on each control.
        </p></div>`
      : html`<div class="card">
          <table>
            <thead><tr><th>Client</th><th>Industry</th><th>Staff</th><th>Added</th></tr></thead>
            <tbody>
              ${clients.map(
                (client) => html`<tr>
                  <td><a href="/clients/${client.id}"><strong>${client.name}</strong></a></td>
                  <td class="muted">${client.industry ?? '--'}</td>
                  <td class="muted">${client.employee_count ?? '--'}</td>
                  <td class="muted">${formatDate(client.created_at)}</td>
                </tr>`,
              )}
            </tbody>
          </table>
        </div>`}

    <h2>Add a client</h2>
    <form method="post" action="/clients" class="card">
      ${csrfField(ctx)}
      <div class="row">
        <div><label for="name">Company name</label><input type="text" id="name" name="name" required></div>
        <div><label for="industry">Industry</label><input type="text" id="industry" name="industry"></div>
      </div>
      <div class="row" style="margin-top:12px">
        <div><label for="employeeCount">Staff count</label><input type="number" id="employeeCount" name="employeeCount" min="0"></div>
        <div><label for="primaryContact">Main contact</label><input type="text" id="primaryContact" name="primaryContact"></div>
      </div>
      <div style="margin-top:14px"><button type="submit">Add client</button></div>
    </form>
  `;
  return page('Clients', ctx, body);
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
  flash: { ok?: string; err?: string };
}): string {
  const { ctx, client, controls, current, profiles, assignedProfiles, assessment, packs, flash } = input;

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
          <div class="grid" style="margin-bottom:14px">
            <div class="stat"><div class="n">${assessment.score}</div><div class="k">Readiness score</div></div>
            <div class="stat"><div class="n">${assessment.stateHeadline}</div><div class="k">${assessment.profile.name}</div></div>
            <div class="stat"><div class="n">${assessment.counts.pass}/${assessment.controls.length}</div><div class="k">Controls in place</div></div>
            <div class="stat"><div class="n">${assessment.coverage.answered}/${assessment.coverage.total}</div><div class="k">Answered</div></div>
          </div>
          <div class="card tight"><p class="small" style="margin:0">${assessment.stateExplanation}</p></div>
          <form method="post" action="/clients/${client.id}/packs" style="margin:14px 0 0">
            ${csrfField(ctx)}
            <input type="hidden" name="profileKey" value="${assessment.profile.key}">
            <div class="row">
              <div style="flex:0 0 240px">
                <label for="generatedBy">Generate pack as</label>
                <input type="text" id="generatedBy" name="generatedBy" value="MSP technician" required>
              </div>
              <div style="flex:0 0 auto"><button type="submit">Generate evidence pack</button></div>
            </div>
          </form>
        `
      : html`<div class="card"><p class="muted" style="margin:0">
          Assign a requirement profile below to see this client's readiness score.
        </p></div>`}

    <h2>Requirement profiles</h2>
    <form method="post" action="/clients/${client.id}/profiles" class="card">
      ${csrfField(ctx)}
      <p class="hint" style="margin-top:0">
        Which obligations does this client have to satisfy? Scoring and the evidence pack are always
        relative to a profile, so at least one is needed. Profiles are data --
        add your own in <code>config/profiles/</code>.
      </p>
      ${profiles.map(
        (profile) => html`<div style="margin-bottom:10px">
          <label style="font-weight:600">
            <input type="checkbox" name="profileKey" value="${profile.key}"
              ${raw(assignedProfiles.includes(profile.key) ? 'checked' : '')}>
            ${profile.name}
            <span class="muted small" style="font-weight:400">— ${profile.publisher} ${profile.version}</span>
          </label>
          <div class="hint" style="margin-left:22px">${profile.description}</div>
        </div>`,
      )}
      <button type="submit">Save profiles</button>
    </form>

    <h2>Record where this client stands</h2>
    <form method="post" action="/clients/${client.id}/evidence" class="card">
      ${csrfField(ctx)}
      <div class="row" style="margin-bottom:6px">
        <div style="flex:0 0 260px">
          <label for="recordedBy">Recorded by</label>
          <input type="text" id="recordedBy" name="recordedBy" value="MSP technician" required>
          <div class="hint">Stamped onto every record you save below.</div>
        </div>
      </div>
      ${controls.map((control) => controlField(control, current.get(control.key), assessment))}
      <div style="margin-top:16px"><button type="submit">Save evidence</button>
        <span class="hint" style="display:inline-block;margin-left:10px">
          Only changed answers are written. Nothing is ever overwritten.
        </span>
      </div>
    </form>

    <h2>Evidence packs</h2>
    ${packs.length === 0
      ? html`<div class="card"><p class="muted" style="margin:0">None generated yet.</p></div>`
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
      <p class="small" style="margin:0">
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
      <span class="muted small" style="margin-left:auto">${control.category}</span>
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
      ? html`<div class="hint" style="margin-top:6px">
          Last recorded ${formatDateTime(row.recorded_at)} by ${row.recorded_by} (${row.source}) ·
          <a href="/clients/${row.client_id}/history?control=${control.key}">history</a>
        </div>`
      : ''}
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
      ? html`<div class="card"><p class="muted" style="margin:0">Nothing recorded yet.</p></div>`
      : html`<div class="card"><table>
          <thead><tr><th style="width:16%">When</th><th style="width:22%">Control</th><th style="width:10%">Status</th>
            <th style="width:26%">Answer</th><th style="width:26%">Recorded by</th></tr></thead>
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
                  <span style="font-size:11px">definition ${record.control_version}</span>
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

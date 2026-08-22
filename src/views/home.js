import { layout, esc, brandMark } from './layout.js';

export function homePage({ branding, clients, questionnaire }) {
  const rows = clients.length
    ? clients
        .map(
          (c) => `<tr>
        <td><a href="/clients/${esc(c.id)}">${esc(c.name)}</a></td>
        <td>${esc(c.industry ?? '—')}</td>
        <td>${esc(c.employee_count ?? '—')}</td>
        <td>${c.assessment_count}</td>
        <td>${c.latest_score === null ? '—' : `${c.latest_score}/100`}</td>
      </tr>`,
        )
        .join('')
    : `<tr><td colspan="5" class="muted">No clients yet. Add one to run your first assessment.</td></tr>`;

  const body = `
<header class="topbar">
  ${brandMark(branding)}
</header>
<main class="wrap">
  <h1>Cyber insurance readiness</h1>
  <p class="lede">Run a client through the ${esc(questionnaire.name)} (v${esc(
    questionnaire.version,
  )}) and produce a gap report you can hand them.</p>

  <section class="card">
    <h2>Clients</h2>
    <table class="grid">
      <thead><tr><th>Client</th><th>Industry</th><th>Staff</th><th>Assessments</th><th>Latest score</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>

  <section class="card">
    <h2>Add a client</h2>
    <form method="post" action="/clients" class="inline-form">
      <label>Client name<input name="name" required placeholder="Acme Joinery Ltd"></label>
      <label>Industry<input name="industry" placeholder="Manufacturing"></label>
      <label>Employees<input name="employeeCount" type="number" min="1" placeholder="45"></label>
      <button type="submit">Add client</button>
    </form>
  </section>
</main>`;

  return layout({ title: `${branding.companyName} — Readiness`, branding, body });
}

export function clientPage({ branding, client, assessments }) {
  const rows = assessments.length
    ? assessments
        .map(
          (a) => `<tr>
        <td>${esc(new Date(a.started_at).toLocaleString('en-GB'))}</td>
        <td>${esc(a.questionnaire_id)} v${esc(a.questionnaire_version)}</td>
        <td>${esc(a.status)}</td>
        <td>${a.readiness_score === null ? '—' : `${a.readiness_score}/100`}</td>
        <td>${
          a.status === 'complete'
            ? `<a href="/clients/${esc(client.id)}/assessments/${esc(a.id)}/report">Report</a>
               &nbsp;<a href="/clients/${esc(client.id)}/assessments/${esc(
                 a.id,
               )}/evidence.json">Evidence</a>`
            : '—'
        }</td>
      </tr>`,
        )
        .join('')
    : `<tr><td colspan="5" class="muted">No assessments yet.</td></tr>`;

  const body = `
<header class="topbar">${brandMark(branding)}</header>
<main class="wrap">
  <p class="crumbs"><a href="/">All clients</a> / ${esc(client.name)}</p>
  <h1>${esc(client.name)}</h1>
  <p class="lede">${esc(client.industry ?? 'Industry not set')} · ${esc(
    client.employee_count ?? '—',
  )} staff</p>

  <p><a class="button" href="/clients/${esc(client.id)}/assessments/new">Start a new assessment</a></p>

  <section class="card">
    <h2>Assessment history</h2>
    <table class="grid">
      <thead><tr><th>Started</th><th>Questionnaire</th><th>Status</th><th>Score</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>
</main>`;

  return layout({ title: `${client.name} — ${branding.companyName}`, branding, body });
}

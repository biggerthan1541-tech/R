import { layout, esc, brandMark } from './layout.js';

function questionField(question) {
  // Deliberately not `required`: "nobody here knows" is a real answer, and the report
  // has its own narrative for an unanswered control.
  if (question.type === 'number') {
    return `<div class="number-input">
      <input type="number" name="${esc(question.id)}" min="0" max="100" step="1">
      ${question.unit ? `<span class="unit">${esc(question.unit)}</span>` : ''}
    </div>`;
  }
  return `<div class="options">${question.options
    .map(
      (o) => `<label class="option">
        <input type="radio" name="${esc(question.id)}" value="${esc(o.value)}">
        <span>${esc(o.label)}</span>
      </label>`,
    )
    .join('')}</div>`;
}

export function questionnairePage({ branding, client, questionnaire }) {
  const sections = questionnaire.controls
    .map(
      (control) => `<section class="card control">
    <header class="control-head">
      <div>
        <span class="domain">${esc(control.domain)}</span>
        <h2>${esc(control.title)}</h2>
      </div>
      <span class="pill sev-${esc(control.severity)}">${esc(control.severity)}</span>
    </header>
    <p class="insurer-context">${esc(control.insurerContext)}</p>
    ${control.questions
      .map(
        (q) => `<div class="question">
        <p class="prompt">${esc(q.prompt)}</p>
        ${q.help ? `<p class="help">${esc(q.help)}</p>` : ''}
        ${questionField(q)}
      </div>`,
      )
      .join('')}
  </section>`,
    )
    .join('');

  const body = `
<header class="topbar">${brandMark(branding)}</header>
<main class="wrap">
  <p class="crumbs"><a href="/">All clients</a> / <a href="/clients/${esc(client.id)}">${esc(
    client.name,
  )}</a> / New assessment</p>
  <h1>${esc(questionnaire.name)}</h1>
  <p class="lede">Answering for <strong>${esc(client.name)}</strong>. ${esc(
    questionnaire.controls.reduce((n, c) => n + c.questions.length, 0),
  )} questions, version ${esc(
    questionnaire.version,
  )}. Leave anything the client genuinely does not know unanswered — the report flags it as a gap in its own right.</p>

  <form method="post" action="/clients/${esc(client.id)}/assessments">
    ${sections}
    <div class="submit-bar">
      <button type="submit">Generate gap report</button>
    </div>
  </form>
</main>`;

  return layout({
    title: `Assessment — ${client.name}`,
    branding,
    body,
    bodyClass: 'questionnaire',
  });
}

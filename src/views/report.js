import { layout, esc, brandMark } from './layout.js';
import { STATUS_LABEL } from '../evaluate.js';

const SEVERITY_NOTE = {
  critical: 'Carriers treat this as a precondition of cover.',
  high: 'Commonly asked and commonly priced.',
  moderate: 'Expected on most questionnaires.',
};

function statusPill(status) {
  return `<span class="pill st-${esc(status)}">${esc(STATUS_LABEL[status])}</span>`;
}

function findingBlock(f, index) {
  return `<article class="finding st-border-${esc(f.status)}">
    <header>
      <span class="finding-index">${index + 1}</span>
      <div>
        <h3>${esc(f.controlTitle)} — ${esc(f.prompt)}</h3>
        <p class="finding-meta">
          ${statusPill(f.status)}
          <span class="pill sev-${esc(f.severity)}">${esc(f.severity)}</span>
          <span class="answer">Your answer: ${esc(f.answerLabel ?? 'not answered')}</span>
        </p>
      </div>
    </header>
    <div class="finding-body">
      <div>
        <h4>Why this matters to you</h4>
        <p>${esc(f.gap)}</p>
      </div>
      <div>
        <h4>What to do</h4>
        <p>${esc(f.fix)}</p>
      </div>
    </div>
    ${f.note ? `<p class="observed"><span>Observed</span>${esc(f.note)}</p>` : ''}
  </article>`;
}

function coverBlock({ branding, client, context, generatedAt, band, score }) {
  const rows = [
    ['Client', client.name],
    ['Industry', client.industry],
    ['Employees', client.employees],
    ['Client contact', client.contact],
    ['Assessed on', context.assessedOn],
    ['Assessed by', context.assessedBy],
    ['Method', context.method],
    ['Policy renewal', context.policyRenewal],
    ['Broker', context.broker],
    ['Prepared', new Date(generatedAt).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');

  return `<section class="cover">
    <div class="cover-brand">${brandMark(branding)}</div>
    <div class="cover-title">
      <p class="cover-kicker">Cyber insurance evidence pack</p>
      <h1>${esc(client.name)}</h1>
      <p class="cover-verdict band-${esc(band.key)}">${esc(band.label)} · ${esc(
        score,
      )}/100</p>
    </div>
    <table class="cover-facts">
      <tbody>${rows
        .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
        .join('')}</tbody>
    </table>
  </section>`;
}

export function reportPage({
  branding,
  client,
  assessment,
  result,
  generatedAt,
  inlineCss = null,
  standalone = false,
  context = null,
  summary = null,
}) {
  const { score, band, controls, counts, findings, criticalFailures } = result;

  const criticalCallout = criticalFailures.length
    ? `<div class="callout danger">
        <h3>Blocking issues</h3>
        <p>${criticalFailures.length === 1 ? 'One control that' : `${criticalFailures.length} controls that`} carriers treat as a precondition of cover ${
          criticalFailures.length === 1 ? 'is' : 'are'
        } not currently met: <strong>${criticalFailures
          .map((c) => esc(c.title))
          .join('</strong>, <strong>')}</strong>. Until ${
          criticalFailures.length === 1 ? 'this is' : 'these are'
        } resolved, expect a decline or a policy that excludes the losses ${
          criticalFailures.length === 1 ? 'it prevents' : 'they prevent'
        }.</p>
      </div>`
    : `<div class="callout ok">
        <h3>No blocking issues</h3>
        <p>Every control carriers treat as a precondition of cover is in place. The items below are refinements rather than barriers to getting a quote.</p>
      </div>`;

  const summaryRows = controls
    .map(
      (c) => `<tr>
      <td>${esc(c.domain)}</td>
      <td>${esc(c.title)}</td>
      <td><span class="pill sev-${esc(c.severity)}">${esc(c.severity)}</span></td>
      <td>${statusPill(c.status)}</td>
    </tr>`,
    )
    .join('');

  const detail = controls
    .map(
      (c) => `<section class="control-detail">
      <header>
        <h3>${esc(c.title)} <span class="domain">${esc(c.domain)}</span></h3>
        ${statusPill(c.status)}
      </header>
      <p class="insurer-context">${esc(c.insurerContext)} <em>${esc(
        SEVERITY_NOTE[c.severity],
      )}</em></p>
      <table class="grid tight">
        <tbody>
          ${c.questions
            .map(
              (q) => `<tr>
              <td class="q">${esc(q.prompt)}${
                q.note ? `<span class="row-note">${esc(q.note)}</span>` : ''
              }</td>
              <td class="a">${esc(q.answerLabel ?? 'Not answered')}</td>
              <td class="s">${statusPill(q.status)}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </section>`,
    )
    .join('');

  const footer = branding.reportFooter.replaceAll('{companyName}', branding.companyName);

  const cover = context
    ? coverBlock({ branding, client, context, generatedAt, band, score })
    : '';

  const summaryBlock = summary
    ? `<div class="callout note">
        <h3>Assessor's summary</h3>
        ${summary
          .split(/\n{2,}/)
          .map((p) => `<p>${esc(p.trim())}</p>`)
          .join('')}
      </div>`
    : '';

  const body = `
<div class="report">
  ${cover}
  <header class="report-head">
    ${brandMark(branding)}
    <div class="report-meta">
      <div><span>Prepared for</span><strong>${esc(client.name)}</strong></div>
      <div class="nowrap"><span>Date</span><strong>${esc(
        new Date(generatedAt).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      )}</strong></div>
      <div class="nowrap"><span>Questionnaire</span><strong>v${esc(
        assessment.questionnaire_version,
      )}</strong></div>
    </div>
  </header>

  <h1>${context ? 'Readiness summary' : 'Cyber insurance gap report'}</h1>

  <section class="verdict band-${esc(band.key)}">
    <div class="score">
      <div class="score-number">${esc(score)}</div>
      <div class="score-denom">out of 100</div>
    </div>
    <div class="verdict-text">
      <h2>${esc(band.label)}</h2>
      <p>${esc(band.summary)}</p>
      <ul class="counts">
        <li><strong>${counts.pass}</strong> meeting expectations</li>
        <li><strong>${counts.partial}</strong> likely to be queried</li>
        <li><strong>${counts.fail}</strong> likely to fail</li>
        ${counts.unknown ? `<li><strong>${counts.unknown}</strong> unanswered</li>` : ''}
      </ul>
    </div>
  </section>

  ${criticalCallout}
  ${summaryBlock}

  <section class="page-block">
    <h2>Where you stand</h2>
    <table class="grid">
      <thead><tr><th>Area</th><th>Control</th><th>Insurer weighting</th><th>Assessment</th></tr></thead>
      <tbody>${summaryRows}</tbody>
    </table>
  </section>

  <section class="page-block">
    <h2>What to fix, in order</h2>
    ${
      findings.length
        ? `<p class="lede">Working down this list in order removes the objections a carrier is most likely to raise. The first few items usually account for most of the difference in premium.</p>
           ${findings.map(findingBlock).join('')}`
        : `<p class="lede">Nothing to fix — every control in this questionnaire meets expectations.</p>`
    }
  </section>

  <section class="page-block">
    <h2>Full response detail</h2>
    ${detail}
  </section>

  <footer class="report-foot">
    <p>${esc(footer)}</p>
    <p class="contact">${esc(branding.contact.email)} · ${esc(
      branding.contact.phone,
    )} · ${esc(branding.contact.website)}</p>
  </footer>
</div>
${
  standalone
    ? `<div class="print-bar no-print"><button onclick="window.print()">Print / save as PDF</button></div>`
    : `<div class="print-bar no-print">
  <a href="/clients/${esc(client.id)}">Back to client</a>
  <button onclick="window.print()">Print / save as PDF</button>
</div>`
}`;

  return layout({
    title: context
      ? `Evidence pack — ${client.name}`
      : `Gap report — ${client.name}`,
    branding,
    body,
    bodyClass: 'report-page',
    inlineCss,
  });
}

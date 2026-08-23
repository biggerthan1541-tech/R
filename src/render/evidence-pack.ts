import type { Assessment } from '../domain/readiness.ts';
import { formatDate, formatDateTime, html, raw } from './html.ts';

export type PackSnapshot = {
  packId: string;
  generatedAt: string;
  generatedBy: string;
  msp: { name: string };
  client: {
    id: string;
    name: string;
    industry: string | null;
    employeeCount: number | null;
    primaryContact: string | null;
  };
  assessment: Assessment;
};

const PACK_STYLES = `
:root {
  --ink: #14161a; --muted: #5f6672; --line: #dfe3e8; --accent: #1f4fd8;
  --pass: #12805c; --pass-bg: #e6f4ef; --partial: #a35d00; --partial-bg: #fdf1e0;
  --fail: #b3261e; --fail-bg: #fbeae9; --unknown: #5f6672; --unknown-bg: #eef0f3;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: #eef0f3; color: var(--ink);
  font: 14.5px/1.6 ui-serif, Georgia, "Times New Roman", serif;
}
.sheet { max-width: 820px; margin: 24px auto; background: #fff; padding: 48px 56px 56px; }
.brandbar { display: flex; align-items: baseline; gap: 12px; border-bottom: 3px solid var(--ink); padding-bottom: 10px; }
.brandbar .msp { font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif; font-weight: 700; font-size: 17px; letter-spacing: -0.01em; }
.brandbar .doctype { margin-left: auto; font-family: ui-sans-serif, -apple-system, sans-serif; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
h1 { font-size: 30px; letter-spacing: -0.02em; margin: 26px 0 4px; line-height: 1.2; }
.subtitle { color: var(--muted); margin: 0 0 26px; font-size: 15px; }
h2 { font-family: ui-sans-serif, -apple-system, sans-serif; font-size: 12px; letter-spacing: .1em;
     text-transform: uppercase; color: var(--muted); margin: 34px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
.verdict { display: flex; gap: 28px; align-items: flex-start; padding: 22px 24px; border: 1px solid var(--line); border-left: 5px solid var(--ink); }
.verdict.ready { border-left-color: var(--pass); }
.verdict.conditional { border-left-color: var(--partial); }
.verdict.not_ready { border-left-color: var(--fail); }
.score { text-align: center; flex: 0 0 108px; }
.score .n { font-family: ui-sans-serif, -apple-system, sans-serif; font-size: 46px; font-weight: 700; line-height: 1; letter-spacing: -0.03em; }
.score .of { color: var(--muted); font-size: 12px; }
.verdict .headline { font-family: ui-sans-serif, -apple-system, sans-serif; font-weight: 700; font-size: 18px; margin-bottom: 6px; }
.verdict.ready .headline { color: var(--pass); }
.verdict.conditional .headline { color: var(--partial); }
.verdict.not_ready .headline { color: var(--fail); }
.meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 14px 20px; margin: 18px 0 0; }
.meta div { font-size: 13px; }
.meta .k { font-family: ui-sans-serif, -apple-system, sans-serif; font-size: 10.5px; letter-spacing: .07em;
           text-transform: uppercase; color: var(--muted); display: block; }
.tally { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
.tally span { font-family: ui-sans-serif, -apple-system, sans-serif; font-size: 12.5px; font-weight: 600; padding: 4px 12px; border-radius: 3px; }
.gap { border: 1px solid var(--line); border-top: 3px solid var(--fail); padding: 18px 22px; margin-bottom: 14px; page-break-inside: avoid; }
.gap.partial { border-top-color: var(--partial); }
.gap-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; flex-wrap: wrap; }
.gap-head .rank { font-family: ui-sans-serif, sans-serif; font-weight: 700; color: var(--muted); font-size: 13px; }
.gap-head h3 { font-family: ui-sans-serif, -apple-system, sans-serif; font-size: 17px; margin: 0; letter-spacing: -0.01em; }
.pill { font-family: ui-sans-serif, -apple-system, sans-serif; font-size: 11px; font-weight: 700;
        padding: 2px 8px; border-radius: 3px; letter-spacing: .02em; white-space: nowrap; }
.pill.pass { color: var(--pass); background: var(--pass-bg); }
.pill.partial { color: var(--partial); background: var(--partial-bg); }
.pill.fail { color: var(--fail); background: var(--fail-bg); }
.pill.unknown { color: var(--unknown); background: var(--unknown-bg); }
.gap .current { font-size: 13px; color: var(--muted); margin: 0 0 12px; }
.gap p { margin: 0 0 10px; }
.gap .fix { background: #f6f7f9; border-left: 3px solid var(--accent); padding: 10px 14px; margin: 12px 0 0; }
.gap .fix strong { font-family: ui-sans-serif, -apple-system, sans-serif; font-size: 11px;
                   letter-spacing: .07em; text-transform: uppercase; color: var(--accent); display: block; margin-bottom: 3px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { font-family: ui-sans-serif, -apple-system, sans-serif; text-align: left; font-size: 10.5px;
     letter-spacing: .07em; text-transform: uppercase; color: var(--muted); padding: 0 10px 7px 0; border-bottom: 1px solid var(--line); }
td { padding: 9px 10px 9px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
.footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid var(--line);
          font-family: ui-sans-serif, -apple-system, sans-serif; font-size: 11.5px; color: var(--muted); }
.footer code { font-size: 11px; }
/* Utility classes exist so the markup needs no inline style attributes: a CSP
   nonce authorises a stylesheet element but NOT a style attribute, so an inline
   style here would be silently dropped by the browser. See test/csp.test.ts. */
.caption { color: var(--muted); font-size: 12px; }
.muted { color: var(--muted); }
.mb-lg { margin-bottom: 18px; }
.t-passing th:nth-child(1), .t-passing td:nth-child(1) { width: 38%; }
.t-passing th:nth-child(2), .t-passing td:nth-child(2) { width: 37%; }
.t-passing th:nth-child(3), .t-passing td:nth-child(3) { width: 25%; }
.t-register th:nth-child(1), .t-register td:nth-child(1) { width: 30%; }
.t-register th:nth-child(2), .t-register td:nth-child(2) { width: 12%; }
.t-register th:nth-child(3), .t-register td:nth-child(3) { width: 30%; }
.t-register th:nth-child(4), .t-register td:nth-child(4) { width: 28%; }
.noprint { text-align: center; margin: 16px auto; max-width: 820px; font-family: ui-sans-serif, sans-serif; font-size: 13px; }
.noprint button { font: inherit; font-weight: 600; padding: 8px 16px; border: 1px solid #1f4fd8;
                  background: #1f4fd8; color: #fff; border-radius: 6px; cursor: pointer; }
@media print {
  body { background: #fff; }
  .sheet { margin: 0; max-width: none; padding: 0; }
  .noprint { display: none; }
  h2 { page-break-after: avoid; }
}
`;

export function renderEvidencePack(snapshot: PackSnapshot, nonce: string): string {
  const { assessment: a, client, msp } = snapshot;
  const passing = a.controls.filter((c) => c.status === 'pass');

  const body = html`<div class="noprint">
  <button id="print" type="button">Save as PDF</button>
</div>
<div class="sheet">
  <div class="brandbar">
    <span class="msp">${msp.name}</span>
    <span class="doctype">Evidence Pack</span>
  </div>

  <h1>Cyber insurance &amp; compliance readiness</h1>
  <p class="subtitle">
    ${client.name} &middot; assessed against ${a.profile.name} &middot; ${formatDate(snapshot.generatedAt)}
  </p>

  <div class="verdict ${raw(a.state)}">
    <div class="score">
      <div class="n">${a.score}</div>
      <div class="of">out of 100</div>
    </div>
    <div>
      <div class="headline">${a.stateHeadline}</div>
      <div>${a.stateExplanation}</div>
    </div>
  </div>

  <div class="tally">
    <span class="pill pass">${a.counts.pass} in place</span>
    <span class="pill partial">${a.counts.partial} partial</span>
    <span class="pill fail">${a.counts.fail} not in place</span>
    ${a.counts.unknown > 0 ? html`<span class="pill unknown">${a.counts.unknown} not answered</span>` : ''}
  </div>

  <div class="meta">
    <div><span class="k">Prepared for</span>${client.name}</div>
    ${client.primaryContact ? html`<div><span class="k">Contact</span>${client.primaryContact}</div>` : ''}
    ${client.industry ? html`<div><span class="k">Industry</span>${client.industry}</div>` : ''}
    ${client.employeeCount ? html`<div><span class="k">Staff</span>${client.employeeCount}</div>` : ''}
    <div><span class="k">Standard</span>${a.profile.name}</div>
    <div><span class="k">Published by</span>${a.profile.publisher}</div>
  </div>

  ${a.gaps.length > 0
    ? html`
        <h2>What to fix first</h2>
        <p class="subtitle mb-lg">
          Ordered by how much each gap costs you against this standard. Requirements marked
          <span class="pill fail">Required</span> are the ones that can stop a policy or an audit outright.
        </p>
        ${a.gaps.map(
          (gap, index) => html`
            <div class="gap ${raw(gap.status === 'partial' ? 'partial' : '')}">
              <div class="gap-head">
                <span class="rank">${index + 1}</span>
                <h3>${gap.title}</h3>
                <span class="pill ${raw(gap.status)}"
                  >${gap.status === 'partial' ? 'Partly in place' : gap.status === 'unknown' ? 'Not answered' : 'Not in place'}</span
                >
                ${gap.requirement === 'mandatory' ? html`<span class="pill fail">Required</span>` : ''}
              </div>
              <p class="current">
                ${gap.answerLabel
                  ? html`Current position: ${gap.answerLabel} &middot; recorded ${formatDate(gap.recordedAt)}`
                  : 'No answer on record.'}
                ${gap.profileNote ? html` &middot; ${gap.profileNote}` : ''}
              </p>
              <p>${gap.gapExplanation}</p>
              <div class="fix"><strong>What to do</strong>${gap.remediation}</div>
            </div>
          `,
        )}
      `
    : html`<h2>What to fix first</h2>
        <p>Nothing outstanding. Every control in ${a.profile.name} is fully in place as of ${formatDate(snapshot.generatedAt)}.</p>`}

  ${passing.length > 0
    ? html`
        <h2>What you already have in place</h2>
        <table class="t-passing">
          <thead>
            <tr><th>Control</th><th>Position</th><th>Confirmed</th></tr>
          </thead>
          <tbody>
            ${passing.map(
              (control) => html`<tr>
                <td><strong>${control.title}</strong></td>
                <td>${control.answerLabel}</td>
                <td>${formatDate(control.recordedAt)} &middot; ${control.recordedBy}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      `
    : ''}

  <h2>Full control register</h2>
  <table class="t-register">
    <thead>
      <tr>
        <th>Control</th><th>Status</th>
        <th>Position on record</th><th>Evidence</th>
      </tr>
    </thead>
    <tbody>
      ${a.controls.map(
        (control) => html`<tr>
          <td>
            <strong>${control.title}</strong><br />
            <span class="caption">${control.category}</span>
          </td>
          <td><span class="pill ${raw(control.status)}">${statusWord(control.status)}</span></td>
          <td>
            ${control.answerLabel ?? html`<span class="muted">--</span>`}
            ${control.note ? html`<br /><span class="caption">${control.note}</span>` : ''}
          </td>
          <td class="caption">
            ${control.recordedAt
              ? html`${formatDate(control.recordedAt)}<br />${control.recordedBy} (${control.source})`
              : 'Not recorded'}
          </td>
        </tr>`,
      )}
    </tbody>
  </table>

  <div class="footer">
    <p>
      Prepared by ${msp.name} for ${client.name}. Every position in this pack is drawn from a dated
      evidence record; the full history of each control, including previous answers and who recorded them,
      is retained and available on request.
    </p>
    <p>
      Evidence pack <code>${snapshot.packId}</code> &middot; generated ${formatDateTime(snapshot.generatedAt)}
      by ${snapshot.generatedBy} &middot; ${a.profile.name} ${a.profile.version}
      &middot; ${a.coverage.answered} of ${a.coverage.total} controls answered.
    </p>
  </div>
</div>`;

  // The nonce is echoed into the CSP header for this response; inline style and
  // script are allowed only because they carry it.
  const safeNonce = nonce.replace(/[^\w-]/g, '');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Evidence Pack -- ${client.name.replace(/[<>&"]/g, '')}</title>
<style nonce="${safeNonce}">${PACK_STYLES}</style>
</head><body>${body}
<script nonce="${safeNonce}">document.getElementById('print').addEventListener('click',function(){window.print()});</script>
</body></html>`;
}

function statusWord(status: string): string {
  return { pass: 'In place', partial: 'Partial', fail: 'Not in place', unknown: 'Not answered' }[status] ?? status;
}

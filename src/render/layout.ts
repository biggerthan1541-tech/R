import { html, raw, type SafeHtml } from './html.ts';

/**
 * Everything a page needs from the request: the per-response CSP nonce, the
 * CSRF token every form must carry, and who is acting.
 */
export type ViewContext = {
  nonce: string;
  csrf: string;
  msp: { name: string };
  user?: { name: string; roleLabel: string } | null;
};

const STYLES = `
:root {
  --ink: #14161a; --muted: #5c6472; --line: #e3e6eb; --bg: #f7f8fa; --card: #ffffff;
  --pass: #12805c; --pass-bg: #e6f4ef; --partial: #a35d00; --partial-bg: #fdf1e0;
  --fail: #b3261e; --fail-bg: #fbeae9; --unknown: #5c6472; --unknown-bg: #eef0f3;
  --accent: #1f4fd8; --radius: 10px;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.55 ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
a { color: var(--accent); }
.wrap { max-width: 940px; margin: 0 auto; padding: 24px 20px 72px; }
header.top { background: var(--card); border-bottom: 1px solid var(--line); }
header.top .wrap { padding: 12px 20px; display: flex; align-items: center; gap: 16px; min-height: 46px; }
header.top strong { font-size: 15px; letter-spacing: -0.01em; }
header.top strong a { color: inherit; text-decoration: none; }
header.top .tenant { color: var(--muted); font-size: 13px; margin-left: auto;
                     display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
h1 { font-size: 26px; letter-spacing: -0.02em; margin: 20px 0 4px; }
h2 { font-size: 17px; letter-spacing: -0.01em; margin: 32px 0 10px; }
h3 { font-size: 15px; margin: 0 0 6px; }
p.lede { color: var(--muted); margin: 0 0 18px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px; margin-bottom: 14px; }
.card.tight { padding: 14px 16px; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); padding: 0 10px 8px 0; font-weight: 600; }
td { padding: 10px 10px 10px 0; border-top: 1px solid var(--line); vertical-align: top; }
.pill { display: inline-block; font-size: 12px; font-weight: 600; padding: 2px 9px; border-radius: 999px; white-space: nowrap; }
.pill.pass { color: var(--pass); background: var(--pass-bg); }
.pill.partial { color: var(--partial); background: var(--partial-bg); }
.pill.fail { color: var(--fail); background: var(--fail-bg); }
.pill.unknown { color: var(--unknown); background: var(--unknown-bg); }
.pill.mandatory { color: var(--fail); background: var(--fail-bg); }
.pill.recommended { color: var(--muted); background: var(--unknown-bg); }
.pill.optional { color: var(--muted); background: var(--unknown-bg); }
label { display: block; font-weight: 600; margin-bottom: 4px; font-size: 14px; }
.hint { color: var(--muted); font-size: 13px; margin: 2px 0 8px; }
input[type=text], input[type=number], select, textarea {
  width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px;
  font: inherit; background: #fff; color: var(--ink);
}
textarea { min-height: 56px; resize: vertical; }
button, .btn {
  display: inline-block; font: inherit; font-weight: 600; padding: 9px 16px; border-radius: 8px;
  border: 1px solid var(--accent); background: var(--accent); color: #fff; cursor: pointer; text-decoration: none;
}
.btn.secondary { background: #fff; color: var(--accent); }
.row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
.row > * { flex: 1 1 200px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.stat { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px; }
.stat .n { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
.stat .k { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.muted { color: var(--muted); }
.small { font-size: 13px; }
.err { background: var(--fail-bg); color: var(--fail); border: 1px solid #f3c9c6; padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; }
.ok { background: var(--pass-bg); color: var(--pass); border: 1px solid #bfe3d6; padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; }
.control { border-top: 1px solid var(--line); padding: 16px 0; }
.control:first-of-type { border-top: 0; padding-top: 4px; }
.control-head { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; flex-wrap: wrap; }
nav.crumbs { font-size: 13px; color: var(--muted); margin-bottom: 2px; }

/* Utility classes exist so the markup needs no inline style attributes: a CSP
   nonce authorises a stylesheet element but NOT a style attribute, so an inline
   style here would be silently dropped by the browser. See test/csp.test.ts. */
.m0 { margin: 0; }
.mt0 { margin-top: 0; }
.mt-xs { margin-top: 6px; }
.mt-sm { margin-top: 12px; }
.mt-md { margin-top: 14px; }
.mt-lg { margin-top: 16px; }
.mb-2 { margin-bottom: 2px; }
.mb-xs { margin-bottom: 6px; }
.mb-sm { margin-bottom: 10px; }
.mb-md { margin-bottom: 12px; }
.mb-lg { margin-bottom: 14px; }
.mb-xl { margin-bottom: 16px; }
.mb-2xl { margin-bottom: 18px; }
.block-gap { margin: 14px 0 0; }
.tight-gap { margin: 12px 0 0; }
.indent { margin-left: 22px; }
.push-right { margin-left: auto; }
.tiny { font-size: 11px; }
.semibold { font-weight: 600; }
.normal-weight { font-weight: 400; }
.checkbox-row { font-weight: 400; display: block; margin-bottom: 4px; }
.inline-note { display: inline-block; margin-left: 10px; }
.nowrap { white-space: nowrap; }
.break-word { word-break: break-word; }
.break-all { word-break: break-all; }
.field-narrow { flex: 0 0 240px; }
.field-mid { flex: 0 0 260px; }
.field-auto { flex: 0 0 auto; }
.signin { max-width: 420px; margin: 56px auto 0; }
.role-select { width: auto; padding: 4px 8px; }
.profile-stat { display: block; text-decoration: none; color: inherit; }
.profile-stat:hover { border-color: var(--accent); }
.profile-stat .n { font-size: 22px; }
.blocker { border-left: 4px solid var(--line); }
.blocker.blocking { border-left-color: var(--fail); }
.fixbox { background: #f6f7f9; border-left: 3px solid var(--accent); padding: 9px 13px; }
.fixbox strong { display: block; font-size: 11px; letter-spacing: .06em; text-transform: uppercase;
                 color: var(--accent); margin-bottom: 3px; }
.delta-score.up { color: var(--pass); }
.delta-score.down { color: var(--fail); }
.delta-score.flat { color: var(--muted); }

/* Table column proportions, set here so the markup needs no width attribute. */
.t-console th:nth-child(1) { width: 26%; } .t-console th:nth-child(2) { width: 9%; }
.t-console th:nth-child(3) { width: 16%; } .t-console th:nth-child(4) { width: 19%; }
.t-console th:nth-child(5) { width: 12%; }
.t-history th:nth-child(1) { width: 16%; } .t-history th:nth-child(2) { width: 22%; }
.t-history th:nth-child(3) { width: 10%; } .t-history th:nth-child(4) { width: 26%; }
.t-history th:nth-child(5) { width: 26%; }
.t-audit th:nth-child(1) { width: 15%; } .t-audit th:nth-child(2) { width: 22%; }
.t-audit th:nth-child(3) { width: 18%; }
.tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 16px 0 12px; }
.tab { font-size: 13px; font-weight: 600; padding: 6px 13px; border-radius: 999px; text-decoration: none;
       border: 1px solid var(--line); background: var(--card); color: var(--muted); }
.tab.active { border-color: var(--accent); background: var(--accent); color: #fff; }
.inline-form { display: inline; }
.linkish { background: none; border: 0; color: var(--accent); font: inherit; font-size: 13px;
           padding: 0 0 0 2px; cursor: pointer; text-decoration: underline; }
`;

export function page(title: string, ctx: ViewContext, body: SafeHtml): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/[<>&]/g, '')}</title>
<style nonce="${ctx.nonce.replace(/[^\w-]/g, '')}">${STYLES}</style>
</head><body>
${html`<header class="top"><div class="wrap">
  <strong><a href="/">Readiness</a></strong>
  <span class="tenant">
    ${ctx.msp.name}
    ${ctx.user
      ? html` &middot; ${ctx.user.name} <span class="pill recommended">${ctx.user.roleLabel}</span>
          <form method="post" action="/logout" class="inline-form">
            ${csrfField(ctx)}<button type="submit" class="linkish">Sign out</button>
          </form>`
      : ''}
  </span>
</div></header>
<div class="wrap">${body}</div>`}
</body></html>`;
}

/** Every state-changing form must include this. The CSRF hook rejects it otherwise. */
export function csrfField(ctx: ViewContext): SafeHtml {
  return html`<input type="hidden" name="_csrf" value="${ctx.csrf}">`;
}

export function statusPill(status: string): SafeHtml {
  const labels: Record<string, string> = {
    pass: 'In place',
    partial: 'Partial',
    fail: 'Not in place',
    unknown: 'Not answered',
  };
  return html`<span class="pill ${raw(status)}">${labels[status] ?? status}</span>`;
}

export function requirementPill(requirement: string): SafeHtml {
  const labels: Record<string, string> = {
    mandatory: 'Required',
    recommended: 'Expected',
    optional: 'Optional',
  };
  return html`<span class="pill ${raw(requirement)}">${labels[requirement] ?? requirement}</span>`;
}

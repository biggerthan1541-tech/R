import { html, raw, type SafeHtml } from './html.ts';

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
header.top .wrap { padding: 14px 20px; display: flex; align-items: baseline; gap: 16px; }
header.top strong { font-size: 15px; letter-spacing: -0.01em; }
header.top .tenant { color: var(--muted); font-size: 13px; margin-left: auto; }
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
.tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 16px 0 12px; }
.tab { font-size: 13px; font-weight: 600; padding: 6px 13px; border-radius: 999px; text-decoration: none;
       border: 1px solid var(--line); background: var(--card); color: var(--muted); }
.tab.active { border-color: var(--accent); background: var(--accent); color: #fff; }
`;

export function page(title: string, tenantName: string, body: SafeHtml): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/[<>&]/g, '')}</title>
<style>${STYLES}</style>
</head><body>
${html`<header class="top"><div class="wrap">
  <strong><a href="/" style="color:inherit;text-decoration:none">Readiness</a></strong>
  <span class="tenant">${tenantName}</span>
</div></header>
<div class="wrap">${body}</div>`}
</body></html>`;
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

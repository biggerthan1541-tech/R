export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function layout({ title, branding, body, bodyClass = '', inlineCss = null }) {
  const styles = inlineCss
    ? `<style>${inlineCss}</style>`
    : '<link rel="stylesheet" href="/styles.css">';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${styles}
<style>:root { --accent: ${esc(branding.accentColor)}; }</style>
</head>
<body class="${esc(bodyClass)}">
${body}
</body>
</html>`;
}

export function brandMark(branding) {
  const initials = branding.companyName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const mark = branding.logo
    ? `<img class="brand-logo" src="${esc(branding.logo)}" alt="${esc(branding.companyName)}">`
    : `<span class="brand-initials">${esc(initials)}</span>`;
  return `<div class="brand">${mark}<div class="brand-text">
    <strong>${esc(branding.companyName)}</strong>
    <span>${esc(branding.tagline)}</span>
  </div></div>`;
}

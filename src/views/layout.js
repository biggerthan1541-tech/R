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

/*
 * A supplied logo is treated as the wordmark and replaces the company name — repeating
 * the name beside it is the classic white-label tell. Without a logo we fall back to
 * initials plus the name set as type.
 */
export function brandMark(branding) {
  if (branding.logo) {
    return `<div class="brand has-logo">
      <img class="brand-logo" src="${esc(branding.logo)}" alt="${esc(branding.companyName)}">
      ${branding.tagline ? `<span class="brand-tagline">${esc(branding.tagline)}</span>` : ''}
    </div>`;
  }

  const initials = branding.companyName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return `<div class="brand"><span class="brand-initials">${esc(initials)}</span><div class="brand-text">
    <strong>${esc(branding.companyName)}</strong>
    <span>${esc(branding.tagline)}</span>
  </div></div>`;
}

/*
 * Renders a pack to a self-contained HTML file, then to PDF via headless Chrome if a
 * browser can be found. PDF is best-effort: no browser means you still get the HTML,
 * which prints to PDF from any browser in two clicks.
 */

import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

import { reportPage } from '../views/report.js';

const CSS = resolve(import.meta.dirname, '../../public/styles.css');

const CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

export function findChrome() {
  if (process.env.CHROME_PATH) {
    return existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null;
  }

  // Playwright's browser cache, which this dev container already has.
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (existsSync(pw)) {
    for (const entry of readdirSync(pw)) {
      if (!entry.startsWith('chromium-')) continue;
      for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const candidate = join(pw, entry, rel);
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  return CANDIDATES.find((p) => existsSync(p)) ?? null;
}

export function renderHtml({ brand, input, result, generatedAt, assessmentId }) {
  return reportPage({
    branding: brand,
    client: {
      id: assessmentId,
      name: input.client.name,
      industry: input.client.industry,
      employees: input.client.employees,
      contact: input.client.contact,
    },
    assessment: { questionnaire_version: result.questionnaireVersion },
    result,
    generatedAt,
    context: input.engagement,
    summary: input.summary,
    inlineCss: readFileSync(CSS, 'utf8'),
    standalone: true,
  });
}

export function writePdf(htmlPath, pdfPath) {
  const chrome = findChrome();
  if (!chrome) return { ok: false, reason: 'no Chrome or Chromium found' };

  try {
    execFileSync(
      chrome,
      [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--no-pdf-header-footer',
        `--print-to-pdf=${pdfPath}`,
        `file://${htmlPath}`,
      ],
      { stdio: 'pipe', timeout: 60_000 },
    );
  } catch (err) {
    return { ok: false, reason: err.message.split('\n')[0] };
  }

  return existsSync(pdfPath)
    ? { ok: true, chrome }
    : { ok: false, reason: 'Chrome exited without writing a PDF' };
}

export function writePack(dir, html) {
  const htmlPath = join(dir, 'pack.html');
  writeFileSync(htmlPath, html);
  const pdf = writePdf(htmlPath, join(dir, 'pack.pdf'));
  return { htmlPath, pdfPath: pdf.ok ? join(dir, 'pack.pdf') : null, pdf };
}

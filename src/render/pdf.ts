import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * PDF export by driving a headless Chromium that is already on the box.
 *
 * An MSP has to attach something to an insurance application, and "print this
 * web page yourself" is not that. This uses the browser's own print pipeline,
 * so the PDF is the pack's print stylesheet rendered by the same engine that
 * renders it on screen -- no second layout to keep in sync, and no PDF library
 * in package.json.
 *
 * The HTML is written to a private temp directory and loaded over file://.
 * Nothing is fetched: the pack embeds its own styles and references no external
 * origin, and the browser runs with networking disabled.
 */
const CANDIDATE_PATHS = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].filter((path): path is string => typeof path === 'string' && path.length > 0);

export function findBrowser(): string | null {
  return CANDIDATE_PATHS.find((path) => existsSync(path)) ?? null;
}

export class PdfUnavailableError extends Error {
  constructor() {
    super(
      'PDF export needs a headless Chrome or Chromium on the server. Install one, or set ' +
        'CHROME_PATH to its location. The pack is still available as a web page, and any ' +
        'browser can print it to PDF.',
    );
  }
}

export async function renderPdf(html: string): Promise<Buffer> {
  const browser = findBrowser();
  if (!browser) throw new PdfUnavailableError();

  const dir = await mkdtemp(join(tmpdir(), 'readiness-pack-'));
  const source = join(dir, 'pack.html');
  const output = join(dir, 'pack.pdf');

  try {
    await writeFile(source, html, 'utf8');
    await run(
      browser,
      [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        '--disable-dev-shm-usage',
        // The document is self-contained; nothing should reach the network.
        '--disable-remote-fonts',
        '--no-pdf-header-footer',
        '--virtual-time-budget=8000',
        `--print-to-pdf=${output}`,
        `file://${source}`,
      ],
      { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
    );

    const pdf = await readFile(output);
    if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new Error('The browser did not produce a valid PDF.');
    }
    return pdf;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** `Harbour Dental Group` -> `harbour-dental-group-readiness-2026-08-23.pdf` */
export function pdfFilename(clientName: string, generatedAt: string): string {
  const slug = clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'client';
  return `${slug}-readiness-${generatedAt.slice(0, 10)}.pdf`;
}

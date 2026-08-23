import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { findBrowser, pdfFilename } from '../src/render/pdf.ts';
import { postForm, signIn, twoTenantApp } from './helpers.ts';

const browser = findBrowser();

/**
 * Reads the text back out of a PDF.
 *
 * Chromium subsets its fonts, so the glyph codes in the content streams are not
 * ASCII; each font carries a ToUnicode map that turns them back into
 * characters. Decoding it is what makes the difference between asserting "a PDF
 * was produced" and "the right PDF was produced" -- an insurer receiving a
 * five-page document of blank boxes would satisfy the former.
 */
/** PDF ToUnicode values are UTF-16BE hex, which Buffer cannot decode directly. */
function utf16beToString(hex: string): string {
  let out = '';
  for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return out;
}

function pdfText(pdf: Buffer): string {
  const streams: Buffer[] = [];
  for (const match of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      streams.push(inflateSync(Buffer.from(match[1]!, 'latin1')));
    } catch {
      /* not deflate-compressed; skip */
    }
  }

  const toUnicode = new Map<number, string>();
  for (const stream of streams) {
    const text = stream.toString('latin1');
    for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const pair of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        toUnicode.set(parseInt(pair[1]!, 16), utf16beToString(pair[2]!));
      }
    }
    for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const range of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const base = parseInt(range[3]!, 16);
        const lo = parseInt(range[1]!, 16);
        const hi = parseInt(range[2]!, 16);
        for (let code = lo; code <= hi; code += 1) toUnicode.set(code, String.fromCharCode(base + code - lo));
      }
    }
  }

  const out: string[] = [];
  for (const stream of streams) {
    const text = stream.toString('latin1');
    if (!text.includes('Tj') && !text.includes('TJ')) continue;
    for (const hex of text.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const digits = hex[1]!;
      for (let i = 0; i + 4 <= digits.length; i += 4) {
        out.push(toUnicode.get(parseInt(digits.slice(i, i + 4), 16)) ?? '');
      }
    }
  }
  return out.join('');
}

async function packWithPortal() {
  const { app, alpha } = await twoTenantApp();
  const client = alpha.tenant.createClient({ name: 'Harbour Dental Group' });
  alpha.tenant.setClientProfiles(client.id, ['insurer_baseline_2026']);
  const cookie = await signIn(app, 'owner@alpha.example');

  await postForm(app, cookie, `/clients/${client.id}/evidence`,
    { answer__mfa_coverage: 'everywhere', answer__tested_backups: 'untested' }, `/clients/${client.id}`);
  const generated = await postForm(app, cookie, `/clients/${client.id}/packs`,
    { profileKey: 'insurer_baseline_2026' }, `/clients/${client.id}`);
  const packId = String(generated.headers.location).replace('/packs/', '');

  const shared = await postForm(app, cookie, `/clients/${client.id}/portal`, { packId }, `/clients/${client.id}`);
  const portalUrl = new URL(String(shared.headers.location), 'http://localhost').searchParams.get('portalUrl')!;

  return { app, alpha, cookie, clientId: client.id, packId, token: portalUrl.replace(/^.*\/portal\//, '') };
}

test('the pack page offers a PDF download', async () => {
  const { app, cookie, packId, token } = await packWithPortal();

  const operator = await app.inject({ method: 'GET', url: `/packs/${packId}`, headers: { cookie } });
  assert.match(operator.body, new RegExp(`href="/packs/${packId}.pdf"`));

  const client = await app.inject({ method: 'GET', url: `/portal/${token}` });
  assert.match(client.body, /href="\/portal\/[^"]+\/pdf"/);
});

test('the PDF download is tenant scoped', async () => {
  const { app, packId } = await packWithPortal();
  const rival = await signIn(app, 'owner@beta.example');

  const response = await app.inject({ method: 'GET', url: `/packs/${packId}.pdf`, headers: { cookie: rival } });
  assert.equal(response.statusCode, 404);
});

test('an anonymous request cannot download an operator PDF', async () => {
  const { app, packId } = await packWithPortal();
  const response = await app.inject({ method: 'GET', url: `/packs/${packId}.pdf` });
  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.location, '/login');
});

test('a revoked portal link cannot download the PDF either', async () => {
  const { app, alpha, cookie, clientId, token } = await packWithPortal();
  const link = alpha.tenant.listPortalLinks(clientId)[0]!;
  await postForm(app, cookie, `/clients/${clientId}/portal/${link.id}/revoke`, {}, `/clients/${clientId}`);

  const response = await app.inject({ method: 'GET', url: `/portal/${token}/pdf` });
  assert.equal(response.statusCode, 410);
});

test('the filename is derived from the client and the pack date', () => {
  assert.equal(
    pdfFilename('Harbour Dental Group', '2026-08-23T10:04:00.000Z'),
    'harbour-dental-group-readiness-2026-08-23.pdf',
  );
  assert.equal(pdfFilename('Calder & Finch LLP', '2026-01-02T00:00:00.000Z'), 'calder-finch-llp-readiness-2026-01-02.pdf');
  assert.equal(pdfFilename('!!!', '2026-01-02T00:00:00.000Z'), 'client-readiness-2026-01-02.pdf');
});

test('a real PDF is produced, with the pack content in it', { skip: browser ? false : 'no chromium on this host' }, async () => {
  const { app, cookie, packId } = await packWithPortal();

  const response = await app.inject({ method: 'GET', url: `/packs/${packId}.pdf`, headers: { cookie } });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'application/pdf');
  assert.match(String(response.headers['content-disposition']), /attachment; filename="harbour-dental-group-readiness-/);

  const body = response.rawPayload;
  assert.ok(body.subarray(0, 5).equals(Buffer.from('%PDF-')), 'not a PDF');
  assert.ok(body.length > 5000, `implausibly small PDF: ${body.length} bytes`);

  // The document must actually carry the pack, not merely be a valid PDF.
  const text = pdfText(body).replace(/\s+/g, '');
  for (const probe of ['HarbourDentalGroup', 'AlphaManagedIT', 'Cyberinsurance', 'WHATTOFIXFIRST', 'FULLCONTROLREGISTER']) {
    assert.ok(text.includes(probe), `PDF text is missing ${probe}`);
  }
});

test('the client can download the same PDF from the portal', { skip: browser ? false : 'no chromium on this host' }, async () => {
  const { app, token } = await packWithPortal();

  const response = await app.inject({ method: 'GET', url: `/portal/${token}/pdf` });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'application/pdf');
  assert.ok(response.rawPayload.subarray(0, 5).equals(Buffer.from('%PDF-')));
});

test('a missing browser degrades to a clear message, not a crash', async () => {
  const { app, cookie, packId } = await packWithPortal();
  const original = process.env.CHROME_PATH;
  const originalPath = process.env.PATH;

  // Point every candidate at nothing by making the known paths unreachable.
  process.env.CHROME_PATH = '/nonexistent/chrome';
  process.env.PATH = '';
  try {
    if (findBrowser()) return; // a system chrome exists; nothing to assert
    const response = await app.inject({ method: 'GET', url: `/packs/${packId}.pdf`, headers: { cookie } });
    assert.equal(response.statusCode, 503);
    assert.match(response.body, /headless Chrome or Chromium/);
  } finally {
    if (original === undefined) delete process.env.CHROME_PATH;
    else process.env.CHROME_PATH = original;
    process.env.PATH = originalPath ?? '';
  }
});

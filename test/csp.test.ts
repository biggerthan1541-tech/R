import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postForm, signIn, twoTenantApp } from './helpers.ts';
import type { FastifyInstance } from 'fastify';

/**
 * Guards the Content-Security-Policy against a silent rendering regression.
 *
 * A nonce authorises a <style> or <script> ELEMENT. It does not authorise
 * style="" attributes or on* handlers -- the browser drops those, and the page
 * still returns 200 and still looks broadly right, so a status-code check and
 * an eyeball both miss it. These tests assert the policy is present and that
 * the markup contains nothing the policy would refuse.
 */

const INLINE_STYLE_ATTR = /<[^>]+\sstyle\s*=/i;
const INLINE_EVENT_HANDLER = /<[^>]+\son(?:click|load|error|submit|change|focus|blur|mouseover|input|keydown)\s*=/i;

function nonceOf(csp: string): string {
  const match = /'nonce-([\w-]+)'/.exec(csp);
  assert.ok(match, `no nonce in CSP: ${csp}`);
  return match![1]!;
}

/** Every <style>/<script> element must carry the nonce from this response's CSP. */
function assertTagsCarryNonce(body: string, nonce: string, where: string): void {
  for (const match of body.matchAll(/<(style|script)\b([^>]*)>/gi)) {
    const [, tag, attrs] = match;
    assert.ok(
      new RegExp(`nonce="${nonce}"`).test(attrs!),
      `${where}: <${tag}> is missing the response nonce and will be blocked -- ${attrs!.trim()}`,
    );
  }
}

function assertNoBlockedInlines(body: string, where: string): void {
  const style = INLINE_STYLE_ATTR.exec(body);
  assert.equal(
    style,
    null,
    `${where}: inline style attribute would be dropped by the CSP (a nonce does not cover ` +
      `style attributes). Use a class in the stylesheet instead. Found: ${style?.[0]}`,
  );

  const handler = INLINE_EVENT_HANDLER.exec(body);
  assert.equal(handler, null, `${where}: inline event handler would be blocked. Found: ${handler?.[0]}`);

  assert.ok(!/javascript:/i.test(body), `${where}: javascript: URL would be blocked`);
}

async function packUrls(app: FastifyInstance, alpha: Awaited<ReturnType<typeof twoTenantApp>>['alpha']) {
  const client = alpha.tenant.createClient({ name: 'Acme Joinery', industry: 'Joinery' });
  alpha.tenant.setClientProfiles(client.id, ['insurer_baseline_2026']);
  const cookie = await signIn(app, 'owner@alpha.example');

  // Real evidence, including a free-text note, so the pack renders every branch
  // that carries a caption or a table cell.
  await postForm(app, cookie, `/clients/${client.id}/evidence`, {
    answer__mfa_coverage: 'admins_only',
    note__mfa_coverage: 'Rollout paused pending owner approval',
    answer__edr_deployment: '72',
    answer__tested_backups: 'untested',
    answer__encryption: 'full',
  }, `/clients/${client.id}`);

  const generated = await postForm(app, cookie, `/clients/${client.id}/packs`,
    { profileKey: 'insurer_baseline_2026' }, `/clients/${client.id}`);
  const packId = String(generated.headers.location).replace('/packs/', '');

  const shared = await postForm(app, cookie, `/clients/${client.id}/portal`,
    { packId }, `/clients/${client.id}`);
  const portalUrl = new URL(String(shared.headers.location), 'http://localhost').searchParams.get('portalUrl')!;

  return { cookie, clientId: client.id, packId, portalPath: `/portal/${portalUrl.replace(/^.*\/portal\//, '')}` };
}

test('the evidence pack is served with a CSP and no unsafe escapes', async () => {
  const { app, alpha } = await twoTenantApp();
  const { cookie, packId } = await packUrls(app, alpha);

  const response = await app.inject({ method: 'GET', url: `/packs/${packId}`, headers: { cookie } });
  const csp = String(response.headers['content-security-policy']);

  assert.equal(response.statusCode, 200);
  assert.ok(csp, 'pack responses must carry a CSP');
  assert.match(csp, /default-src 'none'/);
  // A permissive CSP would defeat the point; these must never appear.
  assert.ok(!csp.includes("'unsafe-inline'"), "CSP must not fall back to 'unsafe-inline'");
  assert.ok(!csp.includes("'unsafe-eval'"), "CSP must not allow 'unsafe-eval'");
  assert.ok(!csp.includes("'unsafe-hashes'"), "CSP must not allow 'unsafe-hashes'");
});

test('the evidence pack contains nothing its own CSP would block', async () => {
  const { app, alpha } = await twoTenantApp();
  const { cookie, packId } = await packUrls(app, alpha);

  const response = await app.inject({ method: 'GET', url: `/packs/${packId}`, headers: { cookie } });
  const nonce = nonceOf(String(response.headers['content-security-policy']));

  assertTagsCarryNonce(response.body, nonce, 'evidence pack');
  assertNoBlockedInlines(response.body, 'evidence pack');
});

test('the client portal copy of the pack is equally clean', async () => {
  const { app, alpha } = await twoTenantApp();
  const { portalPath } = await packUrls(app, alpha);

  // No session here -- this is what the end client actually receives.
  const response = await app.inject({ method: 'GET', url: portalPath });
  const nonce = nonceOf(String(response.headers['content-security-policy']));

  assert.equal(response.statusCode, 200);
  assertTagsCarryNonce(response.body, nonce, 'portal pack');
  assertNoBlockedInlines(response.body, 'portal pack');
});

test('the pack still carries the styling it needs, nonce-authorised', async () => {
  const { app, alpha } = await twoTenantApp();
  const { cookie, packId } = await packUrls(app, alpha);

  const response = await app.inject({ method: 'GET', url: `/packs/${packId}`, headers: { cookie } });
  const nonce = nonceOf(String(response.headers['content-security-policy']));

  // The stylesheet is present and allowed...
  assert.ok(response.body.includes(`<style nonce="${nonce}">`), 'pack must carry a nonce-allowed stylesheet');
  // ...and the styling that used to live in inline attributes survives as classes.
  for (const cls of ['class="caption"', 'class="t-register"', 'class="subtitle mb-lg"']) {
    assert.ok(response.body.includes(cls), `pack lost styling hook ${cls}`);
  }
});

test('every operator page is clean under the same policy', async () => {
  const { app, alpha } = await twoTenantApp();
  const { cookie, clientId } = await packUrls(app, alpha);

  for (const url of ['/', '/users', '/audit', `/clients/${clientId}`, `/clients/${clientId}/history`]) {
    const response = await app.inject({ method: 'GET', url, headers: { cookie } });
    assert.equal(response.statusCode, 200, url);
    const nonce = nonceOf(String(response.headers['content-security-policy']));
    assertTagsCarryNonce(response.body, nonce, url);
    assertNoBlockedInlines(response.body, url);
  }
});

test('the sign-in page is clean before any session exists', async () => {
  const { app } = await twoTenantApp();
  const response = await app.inject({ method: 'GET', url: '/login' });
  const nonce = nonceOf(String(response.headers['content-security-policy']));

  assertTagsCarryNonce(response.body, nonce, '/login');
  assertNoBlockedInlines(response.body, '/login');
});

test('the detector actually catches a blocked inline style', () => {
  // Proves the assertions above are not vacuous.
  assert.throws(
    () => assertNoBlockedInlines('<p style="color:red">x</p>', 'probe'),
    /inline style attribute would be dropped/,
  );
  assert.throws(
    () => assertNoBlockedInlines('<button onclick="go()">x</button>', 'probe'),
    /inline event handler would be blocked/,
  );
  assert.throws(
    () => assertTagsCarryNonce('<style>body{}</style>', 'abc', 'probe'),
    /missing the response nonce/,
  );
});

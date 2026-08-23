import assert from 'node:assert/strict';
import { test } from 'node:test';
import { issueToken } from '../src/auth/tokens.ts';
import { postForm, signIn, TEST_ENV, twoTenantApp } from './helpers.ts';
import type { FastifyInstance } from 'fastify';
import type { Tenant } from './helpers.ts';

/** Client with a profile, some evidence and a generated pack, plus a portal link. */
async function clientWithPack(app: FastifyInstance, alpha: Tenant) {
  const client = alpha.tenant.createClient({ name: 'Acme Joinery' });
  alpha.tenant.setClientProfiles(client.id, ['insurer_baseline_2026']);
  const cookie = await signIn(app, 'owner@alpha.example');

  await postForm(app, cookie, `/clients/${client.id}/evidence`,
    { answer__mfa_coverage: 'everywhere' }, `/clients/${client.id}`);

  const generated = await postForm(app, cookie, `/clients/${client.id}/packs`,
    { profileKey: 'insurer_baseline_2026' }, `/clients/${client.id}`);
  const packId = String(generated.headers.location).replace('/packs/', '');

  return { client, cookie, packId };
}

async function issuePortalLink(app: FastifyInstance, alpha: Tenant) {
  const { client, cookie, packId } = await clientWithPack(app, alpha);
  const response = await postForm(app, cookie, `/clients/${client.id}/portal`,
    { packId }, `/clients/${client.id}`);

  const location = new URL(String(response.headers.location), 'http://localhost');
  const url = location.searchParams.get('portalUrl')!;
  return { client, cookie, packId, token: url.replace(/^.*\/portal\//, '') };
}

test('a portal link shows the client their own pack without a login', async () => {
  const { app, alpha } = await twoTenantApp();
  const { token } = await issuePortalLink(app, alpha);

  const response = await app.inject({ method: 'GET', url: `/portal/${token}` });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Cyber insurance &amp; compliance readiness/);
  assert.match(response.body, /Acme Joinery/);
});

test('the portal is read-only: it exposes no operator surface', async () => {
  const { app, alpha } = await twoTenantApp();
  const { token, client } = await issuePortalLink(app, alpha);

  const pack = await app.inject({ method: 'GET', url: `/portal/${token}` });
  assert.ok(!pack.body.includes('Record where this client stands'));
  assert.ok(!pack.body.includes('Sign out'));

  // Holding a portal token grants nothing anywhere else.
  for (const url of ['/', '/users', '/audit', `/clients/${client.id}`]) {
    const response = await app.inject({
      method: 'GET', url,
      headers: { cookie: `rd_session=${encodeURIComponent(token)}` },
    });
    assert.equal(response.statusCode, 302, `${url} must not be reachable with a portal token`);
  }
});

test('a forged or unknown portal token is refused', async () => {
  const { app, alpha } = await twoTenantApp();
  await issuePortalLink(app, alpha);

  // Correctly signed but never issued: signature alone is not authority.
  const { token: unissued } = issueToken(alpha.mspId, TEST_ENV.sessionSecret);

  for (const token of [unissued, 'garbage', `${alpha.mspId}.made-up.signature`]) {
    const response = await app.inject({ method: 'GET', url: `/portal/${token}` });
    assert.equal(response.statusCode, 404, token);
  }
});

test('a portal token signed with a different key is refused', async () => {
  const { app, alpha } = await twoTenantApp();
  const { token: foreign } = issueToken(alpha.mspId, 'a-completely-different-signing-key-value');

  const response = await app.inject({ method: 'GET', url: `/portal/${foreign}` });
  assert.equal(response.statusCode, 404);
});

test('an expired portal link stops working', async () => {
  const { app, alpha } = await twoTenantApp();
  const { token, client, packId } = await issuePortalLink(app, alpha);

  assert.equal((await app.inject({ method: 'GET', url: `/portal/${token}` })).statusCode, 200);

  // Re-issue the same link in the past rather than waiting 30 days.
  const link = alpha.tenant.listPortalLinks(client.id)[0]!;
  alpha.tenant.createPortalLink({
    clientId: client.id,
    packId,
    tokenHash: link.token_hash + '-expired',
    label: null,
    expiresAt: new Date(Date.now() - 1000).toISOString(),
    createdBy: 'test',
  });
  const expired = alpha.tenant.listPortalLinks(client.id).find((row) => row.token_hash.endsWith('-expired'))!;
  assert.ok(new Date(expired.expires_at).getTime() < Date.now());

  // And the real one, once revoked, is gone too.
  alpha.tenant.revokePortalLink(link.id);
  const afterRevoke = await app.inject({ method: 'GET', url: `/portal/${token}` });
  assert.equal(afterRevoke.statusCode, 410);
});

test('a revoked portal link is refused with an explanation', async () => {
  const { app, alpha } = await twoTenantApp();
  const { token, client } = await issuePortalLink(app, alpha);
  const cookie = await signIn(app, 'owner@alpha.example');

  const link = alpha.tenant.listPortalLinks(client.id)[0]!;
  await postForm(app, cookie, `/clients/${client.id}/portal/${link.id}/revoke`, {}, `/clients/${client.id}`);

  const response = await app.inject({ method: 'GET', url: `/portal/${token}` });
  assert.equal(response.statusCode, 410);
  assert.match(response.body, /expired or been withdrawn/);
});

test('portal views are counted', async () => {
  const { app, alpha } = await twoTenantApp();
  const { token, client } = await issuePortalLink(app, alpha);

  await app.inject({ method: 'GET', url: `/portal/${token}` });
  await app.inject({ method: 'GET', url: `/portal/${token}` });

  const link = alpha.tenant.listPortalLinks(client.id)[0]!;
  assert.equal(link.view_count, 2);
  assert.ok(link.last_viewed_at);
});

test('a link cannot be issued for a pack belonging to another client', async () => {
  const { app, alpha } = await twoTenantApp();
  const { packId } = await clientWithPack(app, alpha);
  const other = alpha.tenant.createClient({ name: 'Other Client' });
  const cookie = await signIn(app, 'owner@alpha.example');

  const response = await postForm(app, cookie, `/clients/${other.id}/portal`, { packId }, `/clients/${other.id}`);

  assert.match(String(response.headers.location), /err=/);
  assert.equal(alpha.tenant.listPortalLinks(other.id).length, 0);
});

test('the stored token is a hash, so the table cannot be replayed', async () => {
  const { app, alpha } = await twoTenantApp();
  const { token, client } = await issuePortalLink(app, alpha);

  const link = alpha.tenant.listPortalLinks(client.id)[0]!;
  assert.notEqual(link.token_hash, token);
  assert.ok(!link.token_hash.includes(token));
  assert.match(link.token_hash, /^[0-9a-f]{64}$/);
});

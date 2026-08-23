import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.ts';
import { openDatabase } from '../src/db/connection.ts';
import { syncConfig } from '../src/domain/config-loader.ts';
import { lookupTenantForLogin } from '../src/db/tenant.ts';
import { cookieFrom, csrfFrom, TEST_ENV } from './helpers.ts';

/**
 * The whole path a real MSP technician walks, with nothing seeded: sign up,
 * add a client, record controls, read what is blocking readiness, generate a
 * pack, share it, and come back later to a record of what moved.
 *
 * Every step goes through HTTP exactly as the browser would, including CSRF,
 * so this fails if the console stops offering a step even when the underlying
 * route still works.
 */

/** A server on an empty database -- no CLI seeding, no fixtures. */
function freshApp(): FastifyInstance {
  const db = openDatabase(':memory:');
  syncConfig(db); // what the server itself does at startup
  return buildServer(db, TEST_ENV);
}

async function formToken(app: FastifyInstance, url: string, cookie?: string) {
  const page = await app.inject({ method: 'GET', url, ...(cookie ? { headers: { cookie } } : {}) });
  return { csrf: csrfFrom(page.body), cookie: cookie ?? `rd_csrf=${encodeURIComponent(cookieFrom(page.headers, 'rd_csrf')!)}`, body: page.body };
}

async function signUp(app: FastifyInstance) {
  const { csrf, cookie } = await formToken(app, '/signup');
  const response = await app.inject({
    method: 'POST', url: '/signup', headers: { cookie },
    payload: {
      mspName: 'Northwind IT Services', name: 'J. Bell',
      email: 'j.bell@northwind.example', password: 'a-long-enough-password', _csrf: csrf,
    },
  });
  const session = cookieFrom(response.headers, 'rd_session');
  assert.ok(session, `signup did not sign the user in: ${response.statusCode}`);
  return { cookie: `${cookie}; rd_session=${encodeURIComponent(session!)}`, response };
}

async function post(app: FastifyInstance, cookie: string, url: string, payload: Record<string, unknown>, formUrl: string) {
  const { csrf } = await formToken(app, formUrl, cookie);
  return app.inject({ method: 'POST', url, headers: { cookie }, payload: { ...payload, _csrf: csrf } });
}

const FIRST_PASS = {
  answer__mfa_coverage: 'admins_only',
  answer__edr_deployment: '72',
  answer__tested_backups: 'untested',
  answer__email_security: 'spf_only',
  answer__access_offboarding: 'informal',
  answer__patch_management: 'scheduled',
  answer__incident_response_plan: 'none',
  answer__security_awareness_training: 'onboarding_only',
  answer__encryption: 'laptops_only',
};

test('step 1: a tech signs up and reaches a working console with no seeding', async () => {
  const app = freshApp();
  const { cookie, response } = await signUp(app);

  assert.equal(response.statusCode, 302);
  const console_ = await app.inject({ method: 'GET', url: '/', headers: { cookie } });
  assert.equal(console_.statusCode, 200);
  assert.match(console_.body, /Northwind IT Services/);
  assert.match(console_.body, /Add a client/, 'the console must offer client creation');
});

test('step 1: the console creates a client and offers the control form', async () => {
  const app = freshApp();
  const { cookie } = await signUp(app);

  const created = await post(app, cookie, '/clients', {
    name: 'Harbour Dental Group',
    industry: 'Healthcare — dental practice',
    employeeCount: '34',
    profileKey: ['insurer_baseline_2026', 'hipaa_security_rule'],
  }, '/');
  assert.equal(created.statusCode, 302);

  const clientId = String(created.headers.location).replace('/clients/', '').replace(/\?.*/, '');
  const page = await app.inject({ method: 'GET', url: `/clients/${clientId}`, headers: { cookie } });

  assert.equal(page.statusCode, 200);
  // Every control is present as an input, so the tech never edits JSON.
  for (const key of ['mfa_coverage', 'tested_backups', 'encryption']) {
    assert.match(page.body, new RegExp(`name="answer__${key}"`), `no input for ${key}`);
  }
  assert.match(page.body, /Save evidence/);
});

test('step 2: readiness is scored against every assigned profile at once', async () => {
  const app = freshApp();
  const { cookie } = await signUp(app);
  const created = await post(app, cookie, '/clients', {
    name: 'Harbour Dental Group',
    profileKey: ['insurer_baseline_2026', 'hipaa_security_rule', 'cmmc_level_1', 'soc2_common_criteria'],
  }, '/');
  const clientId = String(created.headers.location).replace('/clients/', '').replace(/\?.*/, '');

  await post(app, cookie, `/clients/${clientId}/evidence`, FIRST_PASS, `/clients/${clientId}`);
  const page = await app.inject({ method: 'GET', url: `/clients/${clientId}`, headers: { cookie } });

  // All four standards scored on the one screen.
  for (const name of [
    'Cyber Insurance Baseline Questionnaire',
    'HIPAA Security Rule',
    'CMMC Level 1',
    'SOC 2 Common Criteria',
  ]) {
    assert.ok(page.body.includes(name), `${name} missing from the client screen`);
  }

  assert.match(page.body, /What is blocking &quot;ready&quot;|What is blocking "ready"/);
});

test('step 2: blockers say what it costs and what to do, in plain language', async () => {
  const app = freshApp();
  const { cookie } = await signUp(app);
  const created = await post(app, cookie, '/clients', {
    name: 'Harbour Dental Group',
    profileKey: ['insurer_baseline_2026', 'hipaa_security_rule'],
  }, '/');
  const clientId = String(created.headers.location).replace('/clients/', '').replace(/\?.*/, '');

  await post(app, cookie, `/clients/${clientId}/evidence`, FIRST_PASS, `/clients/${clientId}`);
  const page = await app.inject({ method: 'GET', url: `/clients/${clientId}`, headers: { cookie } });

  // Business consequence, not technical mechanism. MFA is partial here, so this
  // is the partial copy rather than the absent-entirely copy.
  assert.match(page.body, /the ones you have not are the way in/);
  assert.match(page.body, /Extend multi-factor authentication/);
  assert.match(page.body, /What to do/);
  // A control two standards both demand is shown once, tagged with both.
  assert.match(page.body, /Required by [^<]*(Cyber Insurance Baseline Questionnaire|HIPAA)/);
});

test('step 3: the tech generates a pack and can share it from the console', async () => {
  const app = freshApp();
  const { cookie } = await signUp(app);
  const created = await post(app, cookie, '/clients', {
    name: 'Harbour Dental Group', profileKey: 'insurer_baseline_2026',
  }, '/');
  const clientId = String(created.headers.location).replace('/clients/', '').replace(/\?.*/, '');
  await post(app, cookie, `/clients/${clientId}/evidence`, FIRST_PASS, `/clients/${clientId}`);

  const generated = await post(app, cookie, `/clients/${clientId}/packs`,
    { profileKey: 'insurer_baseline_2026' }, `/clients/${clientId}`);
  const packId = String(generated.headers.location).replace('/packs/', '');

  // The console must offer the share control -- not merely accept the POST.
  const page = await app.inject({ method: 'GET', url: `/clients/${clientId}`, headers: { cookie } });
  assert.match(page.body, new RegExp(`action="/clients/${clientId}/portal"`), 'no share form on the client page');
  assert.match(page.body, new RegExp(`value="${packId}"`), 'the new pack is not selectable for sharing');

  const shared = await post(app, cookie, `/clients/${clientId}/portal`,
    { packId, label: 'For the Hiscox application' }, `/clients/${clientId}`);
  const portalUrl = new URL(String(shared.headers.location), 'http://localhost').searchParams.get('portalUrl')!;
  assert.ok(portalUrl.includes('/portal/'));

  // The end client opens it with no account at all.
  const clientView = await app.inject({ method: 'GET', url: `/portal/${portalUrl.replace(/^.*\/portal\//, '')}` });
  assert.equal(clientView.statusCode, 200);
  assert.match(clientView.body, /Harbour Dental Group/);
  assert.match(clientView.body, /Northwind IT Services/);
  assert.ok(!clientView.body.includes('Save evidence'), 'the portal must expose no operator controls');
});

test('step 4: a second pack reports what moved since the first', async () => {
  const app = freshApp();
  const { cookie } = await signUp(app);
  const created = await post(app, cookie, '/clients', {
    name: 'Harbour Dental Group', profileKey: 'insurer_baseline_2026',
  }, '/');
  const clientId = String(created.headers.location).replace('/clients/', '').replace(/\?.*/, '');

  await post(app, cookie, `/clients/${clientId}/evidence`, FIRST_PASS, `/clients/${clientId}`);
  const first = await post(app, cookie, `/clients/${clientId}/packs`,
    { profileKey: 'insurer_baseline_2026' }, `/clients/${clientId}`);
  const firstId = String(first.headers.location).replace('/packs/', '');
  const firstPack = await app.inject({ method: 'GET', url: `/packs/${firstId}`, headers: { cookie } });
  assert.ok(!firstPack.body.includes('What has changed since'), 'a first pack has nothing to compare against');

  // The client fixes MFA and backups, but lets encryption lapse.
  await post(app, cookie, `/clients/${clientId}/evidence`, {
    answer__mfa_coverage: 'everywhere',
    answer__tested_backups: 'tested_offline',
    answer__encryption: 'none',
  }, `/clients/${clientId}`);

  const second = await post(app, cookie, `/clients/${clientId}/packs`,
    { profileKey: 'insurer_baseline_2026' }, `/clients/${clientId}`);
  const secondPack = await app.inject({
    method: 'GET', url: `/packs/${String(second.headers.location).replace('/packs/', '')}`, headers: { cookie },
  });

  assert.match(secondPack.body, /What has changed since/);
  assert.match(secondPack.body, /Improved/);
  assert.match(secondPack.body, /Multi-factor authentication/);
  assert.match(secondPack.body, /Slipped/, 'a control that went backwards must be reported, not hidden');

  // And the console surfaces the movement without opening a pack.
  const page = await app.inject({ method: 'GET', url: `/clients/${clientId}`, headers: { cookie } });
  assert.match(page.body, /since the last pack/);
});

test('the earlier pack still shows the old position after the client improves', async () => {
  const app = freshApp();
  const { cookie } = await signUp(app);
  const created = await post(app, cookie, '/clients', {
    name: 'Harbour Dental Group', profileKey: 'insurer_baseline_2026',
  }, '/');
  const clientId = String(created.headers.location).replace('/clients/', '').replace(/\?.*/, '');

  await post(app, cookie, `/clients/${clientId}/evidence`, { answer__mfa_coverage: 'none' }, `/clients/${clientId}`);
  const first = await post(app, cookie, `/clients/${clientId}/packs`,
    { profileKey: 'insurer_baseline_2026' }, `/clients/${clientId}`);
  const firstId = String(first.headers.location).replace('/packs/', '');

  await post(app, cookie, `/clients/${clientId}/evidence`, { answer__mfa_coverage: 'everywhere' }, `/clients/${clientId}`);

  const reopened = await app.inject({ method: 'GET', url: `/packs/${firstId}`, headers: { cookie } });
  assert.match(reopened.body, /Nowhere/, 'a generated pack is an artifact, not a live view');
});

test('signing up a second practice sees none of the first', async () => {
  const app = freshApp();
  const { cookie: first } = await signUp(app);
  await post(app, first, '/clients', { name: 'Harbour Dental Group', profileKey: 'insurer_baseline_2026' }, '/');

  const { csrf, cookie } = await formToken(app, '/signup');
  const second = await app.inject({
    method: 'POST', url: '/signup', headers: { cookie },
    payload: {
      mspName: 'Rival Managed Services', name: 'R. Patel',
      email: 'r.patel@rival.example', password: 'another-long-password', _csrf: csrf,
    },
  });
  const rival = `${cookie}; rd_session=${encodeURIComponent(cookieFrom(second.headers, 'rd_session')!)}`;

  const rivalConsole = await app.inject({ method: 'GET', url: '/', headers: { cookie: rival } });
  assert.equal(rivalConsole.statusCode, 200);
  assert.match(rivalConsole.body, /Rival Managed Services/);
  assert.ok(!rivalConsole.body.includes('Harbour Dental Group'), 'cross-tenant leak on the console');
});

test('signup refuses a duplicate email and a weak password', async () => {
  const app = freshApp();
  await signUp(app);

  const { csrf, cookie } = await formToken(app, '/signup');
  const duplicate = await app.inject({
    method: 'POST', url: '/signup', headers: { cookie },
    payload: { mspName: 'Other', name: 'X', email: 'j.bell@northwind.example', password: 'a-long-enough-password', _csrf: csrf },
  });
  assert.equal(duplicate.statusCode, 400);
  assert.match(duplicate.body, /already in use/);

  const weak = await app.inject({
    method: 'POST', url: '/signup', headers: { cookie },
    payload: { mspName: 'Other', name: 'X', email: 'x@other.example', password: 'short', _csrf: csrf },
  });
  assert.equal(weak.statusCode, 400);
  assert.match(weak.body, /at least 12 characters/);
});

test('two practices may share a name without colliding', async () => {
  const app = freshApp();
  const db = openDatabase(':memory:');
  void db;
  await signUp(app);

  const { csrf, cookie } = await formToken(app, '/signup');
  const twin = await app.inject({
    method: 'POST', url: '/signup', headers: { cookie },
    payload: {
      mspName: 'Northwind IT Services', name: 'Someone Else',
      email: 'someone@elsewhere.example', password: 'a-long-enough-password', _csrf: csrf,
    },
  });
  assert.equal(twin.statusCode, 302, 'a duplicate company name must not block signup');
  assert.ok(cookieFrom(twin.headers, 'rd_session'));
});

test('signup is closed when an invite code is configured', async () => {
  const db = openDatabase(':memory:');
  syncConfig(db);
  const app = buildServer(db, { ...TEST_ENV, signupInviteCode: 'let-me-in' });

  const { csrf, cookie } = await formToken(app, '/signup');
  const payload = {
    mspName: 'Northwind', name: 'J. Bell',
    email: 'j.bell@northwind.example', password: 'a-long-enough-password', _csrf: csrf,
  };

  const refused = await app.inject({ method: 'POST', url: '/signup', headers: { cookie }, payload });
  assert.equal(refused.statusCode, 400);
  assert.equal(lookupTenantForLogin(db, 'j.bell@northwind.example'), null, 'no tenant may be created');

  const allowed = await app.inject({
    method: 'POST', url: '/signup', headers: { cookie }, payload: { ...payload, invite: 'let-me-in' },
  });
  assert.equal(allowed.statusCode, 302);
});

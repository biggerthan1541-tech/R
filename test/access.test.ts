import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, needsRehash, verifyPassword } from '../src/auth/passwords.ts';
import { readToken } from '../src/auth/tokens.ts';
import { can } from '../src/domain/roles.ts';
import { cookieFrom, PASSWORD, postForm, signIn, TEST_ENV, twoTenantApp } from './helpers.ts';

// --------------------------------------------------------------------------
// Authentication
// --------------------------------------------------------------------------

test('protected pages redirect to sign-in when anonymous', async () => {
  const { app } = await twoTenantApp();
  for (const url of ['/', '/users', '/audit']) {
    const response = await app.inject({ method: 'GET', url });
    assert.equal(response.statusCode, 302, url);
    assert.equal(response.headers.location, '/login');
  }
});

test('a wrong password is refused, and reports nothing about the account', async () => {
  const { app } = await twoTenantApp();
  const form = await app.inject({ method: 'GET', url: '/login' });
  const cookie = cookieFrom(form.headers, 'rd_csrf')!;
  const csrf = /name="_csrf" value="([^"]+)"/.exec(form.body)![1]!;

  const wrongPassword = await app.inject({
    method: 'POST', url: '/login',
    headers: { cookie: `rd_csrf=${encodeURIComponent(cookie)}` },
    payload: { email: 'owner@alpha.example', password: 'not-the-password', _csrf: csrf },
  });
  const unknownUser = await app.inject({
    method: 'POST', url: '/login',
    headers: { cookie: `rd_csrf=${encodeURIComponent(cookie)}` },
    payload: { email: 'nobody@nowhere.example', password: 'not-the-password', _csrf: csrf },
  });

  assert.equal(wrongPassword.statusCode, 401);
  assert.equal(unknownUser.statusCode, 401);
  assert.equal(cookieFrom(wrongPassword.headers, 'rd_session'), undefined);
  // Identical wording: the response must not reveal whether the address exists.
  const message = /class="err">([^<]+)</;
  assert.equal(message.exec(wrongPassword.body)?.[1], message.exec(unknownUser.body)?.[1]);
});

test('a session cookie cannot be forged without the signing key', async () => {
  const { app, alpha } = await twoTenantApp();

  for (const forged of [
    `${alpha.mspId}.madeuptoken`,
    `${alpha.mspId}.madeuptoken.badsignature`,
    'not-even-close',
  ]) {
    const response = await app.inject({
      method: 'GET', url: '/',
      headers: { cookie: `rd_session=${encodeURIComponent(forged)}` },
    });
    assert.equal(response.statusCode, 302, forged);
    assert.equal(response.headers.location, '/login');
  }
});

test('a session token planted before login is never honoured (no fixation)', async () => {
  const { app } = await twoTenantApp();

  // Attacker plants a value, then the victim signs in with that cookie present.
  const planted = 'msp_planted00000000.attackerchosen';
  const form = await app.inject({
    method: 'GET', url: '/login',
    headers: { cookie: `rd_session=${encodeURIComponent(planted)}` },
  });
  const csrfCookie = cookieFrom(form.headers, 'rd_csrf')!;
  const csrf = /name="_csrf" value="([^"]+)"/.exec(form.body)![1]!;

  const login = await app.inject({
    method: 'POST', url: '/login',
    headers: { cookie: `rd_csrf=${encodeURIComponent(csrfCookie)}; rd_session=${encodeURIComponent(planted)}` },
    payload: { email: 'owner@alpha.example', password: PASSWORD, _csrf: csrf },
  });

  const issued = cookieFrom(login.headers, 'rd_session')!;
  assert.notEqual(issued, planted, 'login must mint a new token, not adopt the presented one');

  // And the planted value is still worthless afterwards.
  const replay = await app.inject({
    method: 'GET', url: '/',
    headers: { cookie: `rd_session=${encodeURIComponent(planted)}` },
  });
  assert.equal(replay.statusCode, 302);
});

test('signing out revokes the session server-side, not just in the browser', async () => {
  const { app } = await twoTenantApp();
  const cookie = await signIn(app, 'owner@alpha.example');

  assert.equal((await app.inject({ method: 'GET', url: '/', headers: { cookie } })).statusCode, 200);
  await postForm(app, cookie, '/logout', {});

  // Same cookie replayed after logout must no longer work.
  const replay = await app.inject({ method: 'GET', url: '/', headers: { cookie } });
  assert.equal(replay.statusCode, 302);
  assert.equal(replay.headers.location, '/login');
});

test('disabling a user kills their live sessions immediately', async () => {
  const { app, alpha } = await twoTenantApp();
  const techCookie = await signIn(app, 'tech@alpha.example');
  const ownerCookie = await signIn(app, 'owner@alpha.example');

  assert.equal((await app.inject({ method: 'GET', url: '/', headers: { cookie: techCookie } })).statusCode, 200);

  const tech = alpha.tenant.listUsers().find((user) => user.email === 'tech@alpha.example')!;
  await postForm(app, ownerCookie, `/users/${tech.id}/status`, { status: 'disabled' }, '/users');

  const after = await app.inject({ method: 'GET', url: '/', headers: { cookie: techCookie } });
  assert.equal(after.statusCode, 302, 'a disabled user must lose access at once');
});

// --------------------------------------------------------------------------
// Cross-tenant isolation over HTTP
// --------------------------------------------------------------------------

test('one MSP cannot see or reach another MSP\'s clients', async () => {
  const { app, alpha, beta } = await twoTenantApp();
  const client = alpha.tenant.createClient({ name: 'Acme Joinery' });
  const betaCookie = await signIn(app, 'owner@beta.example');

  const console_ = await app.inject({ method: 'GET', url: '/', headers: { cookie: betaCookie } });
  assert.ok(!console_.body.includes('Acme Joinery'));

  for (const url of [`/clients/${client.id}`, `/clients/${client.id}/history`]) {
    const response = await app.inject({ method: 'GET', url, headers: { cookie: betaCookie } });
    assert.equal(response.statusCode, 404, url);
  }
  void beta;
});

test('one MSP cannot write evidence against another MSP\'s client', async () => {
  const { app, alpha } = await twoTenantApp();
  const client = alpha.tenant.createClient({ name: 'Acme Joinery' });
  alpha.tenant.setClientProfiles(client.id, ['insurer_baseline_2026']);
  const betaCookie = await signIn(app, 'owner@beta.example');

  const response = await postForm(app, betaCookie, `/clients/${client.id}/evidence`, {
    answer__mfa_coverage: 'none',
  });

  assert.equal(response.statusCode, 404);
  assert.equal(alpha.tenant.evidenceHistory(client.id).length, 0);
});

test('one MSP cannot read another MSP\'s evidence pack', async () => {
  const { app, alpha } = await twoTenantApp();
  const client = alpha.tenant.createClient({ name: 'Acme Joinery' });
  alpha.tenant.setClientProfiles(client.id, ['insurer_baseline_2026']);
  const alphaCookie = await signIn(app, 'owner@alpha.example');

  const generated = await postForm(
    app, alphaCookie, `/clients/${client.id}/packs`,
    { profileKey: 'insurer_baseline_2026' }, `/clients/${client.id}`,
  );
  const packId = String(generated.headers.location).replace('/packs/', '');

  const betaCookie = await signIn(app, 'owner@beta.example');
  const response = await app.inject({ method: 'GET', url: `/packs/${packId}`, headers: { cookie: betaCookie } });
  assert.equal(response.statusCode, 404);
});

test('users and audit entries are invisible across tenants', async () => {
  const { app, alpha } = await twoTenantApp();
  const betaCookie = await signIn(app, 'owner@beta.example');

  const users = await app.inject({ method: 'GET', url: '/users', headers: { cookie: betaCookie } });
  assert.ok(!users.body.includes('owner@alpha.example'));
  assert.ok(users.body.includes('owner@beta.example'));

  const audit = await app.inject({ method: 'GET', url: '/audit', headers: { cookie: betaCookie } });
  assert.ok(!audit.body.includes('owner@alpha.example'));
  void alpha;
});

test('an owner cannot change a user belonging to another MSP', async () => {
  const { app, alpha } = await twoTenantApp();
  const alphaTech = alpha.tenant.listUsers().find((user) => user.email === 'tech@alpha.example')!;
  const betaCookie = await signIn(app, 'owner@beta.example');

  const response = await postForm(app, betaCookie, `/users/${alphaTech.id}/role`, { role: 'owner' }, '/users');

  assert.equal(response.statusCode, 404);
  assert.equal(alpha.tenant.getUser(alphaTech.id)!.role, 'operator', 'role must be unchanged');
});

// --------------------------------------------------------------------------
// Roles and privilege escalation
// --------------------------------------------------------------------------

test('the read-only role cannot mutate anything', async () => {
  const { app, alpha } = await twoTenantApp();
  const client = alpha.tenant.createClient({ name: 'Acme Joinery' });
  alpha.tenant.setClientProfiles(client.id, ['insurer_baseline_2026']);
  const cookie = await signIn(app, 'view@alpha.example');

  const attempts: [string, Record<string, unknown>][] = [
    ['/clients', { name: 'Sneaky Ltd' }],
    [`/clients/${client.id}/evidence`, { answer__mfa_coverage: 'none' }],
    [`/clients/${client.id}/profiles`, { profileKey: 'cmmc_level_1' }],
    [`/clients/${client.id}/packs`, { profileKey: 'insurer_baseline_2026' }],
    [`/clients/${client.id}/portal`, { packId: 'pack_aaaaaaaaaa' }],
    ['/users', { name: 'X', email: 'x@alpha.example', role: 'owner', password: 'aaaaaaaaaaaa' }],
  ];

  for (const [url, payload] of attempts) {
    const response = await postForm(app, cookie, url, payload, `/clients/${client.id}`);
    assert.equal(response.statusCode, 403, `${url} must be forbidden for read-only`);
  }

  assert.equal(alpha.tenant.listClients().length, 1, 'no client was created');
  assert.equal(alpha.tenant.evidenceHistory(client.id).length, 0, 'no evidence was written');
  assert.equal(alpha.tenant.listUsers().length, 3, 'no user was created');
});

test('an operator cannot grant itself owner or manage people', async () => {
  const { app, alpha } = await twoTenantApp();
  const tech = alpha.tenant.listUsers().find((user) => user.email === 'tech@alpha.example')!;
  const cookie = await signIn(app, 'tech@alpha.example');

  const escalate = await postForm(app, cookie, `/users/${tech.id}/role`, { role: 'owner' }, '/users');
  assert.equal(escalate.statusCode, 403);
  assert.equal(alpha.tenant.getUser(tech.id)!.role, 'operator');

  const invite = await postForm(
    app, cookie, '/users',
    { name: 'Mole', email: 'mole@alpha.example', role: 'owner', password: 'aaaaaaaaaaaa' }, '/users',
  );
  assert.equal(invite.statusCode, 403);
});

test('an owner cannot lock themselves out', async () => {
  const { app, alpha } = await twoTenantApp();
  const owner = alpha.tenant.listUsers().find((user) => user.email === 'owner@alpha.example')!;
  const cookie = await signIn(app, 'owner@alpha.example');

  await postForm(app, cookie, `/users/${owner.id}/status`, { status: 'disabled' }, '/users');
  assert.equal(alpha.tenant.getUser(owner.id)!.status, 'active');

  await postForm(app, cookie, `/users/${owner.id}/role`, { role: 'read_only' }, '/users');
  assert.equal(alpha.tenant.getUser(owner.id)!.role, 'owner');
});

test('an unknown role grants nothing', () => {
  assert.equal(can('superuser', 'client:read'), false);
  assert.equal(can('', 'client:read'), false);
});

// --------------------------------------------------------------------------
// Passwords
// --------------------------------------------------------------------------

test('passwords verify only against themselves', async () => {
  const hash = await hashPassword('correct-horse-battery-staple');
  assert.ok(await verifyPassword('correct-horse-battery-staple', hash));
  assert.ok(!(await verifyPassword('Correct-horse-battery-staple', hash)));
  assert.ok(!(await verifyPassword('', hash)));
});

test('the same password hashes differently every time', async () => {
  const a = await hashPassword('correct-horse-battery-staple');
  const b = await hashPassword('correct-horse-battery-staple');
  assert.notEqual(a, b, 'salts must differ');
  assert.ok(a.startsWith('scrypt$'));
});

test('short passwords are refused and malformed hashes never verify', async () => {
  await assert.rejects(() => hashPassword('short'), /at least 12 characters/);
  assert.ok(!(await verifyPassword('anything', 'not-a-hash')));
  assert.ok(!(await verifyPassword('anything', 'scrypt$1$1$1$aaaa')));
  assert.ok(needsRehash('bcrypt$whatever'));
});

test('a stored hash reveals nothing about the password', async () => {
  const hash = await hashPassword('correct-horse-battery-staple');
  assert.ok(!hash.includes('correct'));
});

test('tokens only parse with a valid signature', () => {
  assert.equal(readToken('msp_abcdefgh.token.forged', TEST_ENV.sessionSecret), null);
  assert.equal(readToken(undefined, TEST_ENV.sessionSecret), null);
  assert.equal(readToken('', TEST_ENV.sessionSecret), null);
});

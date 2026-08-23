import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildServer } from '../src/server.ts';
import { projectRoot } from '../src/db/connection.ts';
import { readEnv } from '../src/config/env.ts';
import { postForm, TEST_ENV, testDb } from './helpers.ts';
import { ensureMsp } from '../src/db/msps.ts';

const PROD = {
  NODE_ENV: 'production',
  SESSION_SECRET: 'a-secret-that-is-certainly-long-enough-for-production',
  PUBLIC_URL: 'https://readiness.example.com',
  PORT: '8080',
} satisfies NodeJS.ProcessEnv;

// -- health check -----------------------------------------------------------

test('the health check answers without a session and leaks no tenant data', async () => {
  const db = testDb();
  ensureMsp(db, 'alpha', 'Alpha Managed IT');
  const app = buildServer(db, TEST_ENV);

  const response = await app.inject({ method: 'GET', url: '/health' });
  const body = JSON.parse(response.body) as Record<string, unknown>;

  assert.equal(response.statusCode, 200);
  assert.equal(body.status, 'ok');
  assert.ok(typeof body.schema === 'number' && body.schema >= 2, 'must report the applied schema version');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.ok(!response.body.includes('Alpha'), 'the health check must not name tenants');
});

test('the health check reports unavailable when the database cannot answer', async () => {
  const db = testDb();
  const app = buildServer(db, TEST_ENV);
  db.close();

  const response = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(response.statusCode, 503);
  assert.match(response.body, /unavailable/);
});

// -- HTTPS ------------------------------------------------------------------

test('plain http is redirected to the canonical https origin in production', async () => {
  const db = testDb();
  const app = buildServer(db, { ...TEST_ENV, requireHttps: true, publicUrl: 'https://readiness.example.com' });

  const response = await app.inject({ method: 'GET', url: '/login', headers: { 'x-forwarded-proto': 'http' } });

  assert.equal(response.statusCode, 308, 'a permanent redirect preserves the method');
  assert.equal(response.headers.location, 'https://readiness.example.com/login');
});

test('an https request passes through untouched', async () => {
  const db = testDb();
  const app = buildServer(db, { ...TEST_ENV, requireHttps: true, publicUrl: 'https://readiness.example.com' });

  const response = await app.inject({ method: 'GET', url: '/login', headers: { 'x-forwarded-proto': 'https' } });
  assert.equal(response.statusCode, 200);
});

test('the health check stays reachable over plain http for the load balancer', async () => {
  const db = testDb();
  const app = buildServer(db, { ...TEST_ENV, requireHttps: true, publicUrl: 'https://readiness.example.com' });

  const response = await app.inject({ method: 'GET', url: '/health', headers: { 'x-forwarded-proto': 'http' } });
  assert.equal(response.statusCode, 200, 'redirecting the health check would fail every probe');
});

// -- portal links behind a proxy -------------------------------------------

/** Signs up a practice and returns a cookie plus a client with a generated pack. */
async function practiceWithPack(app: ReturnType<typeof buildServer>) {
  const form = await app.inject({ method: 'GET', url: '/signup' });
  const csrfCookie = /rd_csrf=([^;]+)/.exec(String(form.headers['set-cookie']))![1]!;
  const csrf = /name="_csrf" value="([^"]+)"/.exec(form.body)![1]!;
  const signup = await app.inject({
    method: 'POST', url: '/signup', headers: { cookie: `rd_csrf=${csrfCookie}` },
    payload: {
      mspName: 'Northwind IT', name: 'J. Bell', email: 'j.bell@northwind.example',
      password: 'a-long-enough-password', _csrf: csrf,
    },
  });
  const session = /rd_session=([^;]+)/.exec(String(signup.headers['set-cookie']))![1]!;
  const cookie = `rd_csrf=${csrfCookie}; rd_session=${session}`;

  const created = await postForm(app, cookie, '/clients',
    { name: 'Harbour Dental Group', profileKey: 'insurer_baseline_2026' }, '/');
  const clientId = String(created.headers.location).replace('/clients/', '').replace(/\?.*/, '');

  const pack = await postForm(app, cookie, `/clients/${clientId}/packs`,
    { profileKey: 'insurer_baseline_2026' }, `/clients/${clientId}`);
  const packId = String(pack.headers.location).replace('/packs/', '');

  return { cookie, clientId, packId };
}

/** Issues a portal link and returns the absolute URL handed to the operator. */
async function issueLink(
  app: ReturnType<typeof buildServer>,
  ctx: { cookie: string; clientId: string; packId: string },
  headers: Record<string, string> = {},
) {
  const page = await app.inject({ method: 'GET', url: `/clients/${ctx.clientId}`, headers: { cookie: ctx.cookie } });
  const token = /name="_csrf" value="([^"]+)"/.exec(page.body)![1]!;
  const shared = await app.inject({
    method: 'POST', url: `/clients/${ctx.clientId}/portal`,
    headers: { cookie: ctx.cookie, ...headers },
    payload: { packId: ctx.packId, _csrf: token },
  });
  return new URL(String(shared.headers.location), 'http://localhost').searchParams.get('portalUrl')!;
}

test('a client link is https when the proxy says the request was https', async () => {
  // The trustProxy bug in full: behind Caddy the connection to this process is
  // plain http, and the client's real scheme arrives only in x-forwarded-proto.
  // Without trustProxy, Fastify reports "http" and every link handed to a client
  // is insecure. PUBLIC_URL is deliberately unset here so nothing masks it.
  const db = testDb();
  const app = buildServer(db, { ...TEST_ENV, publicUrl: null });
  const ctx = await practiceWithPack(app);

  const url = await issueLink(app, ctx, {
    'x-forwarded-proto': 'https',
    host: 'readiness.example.com',
  });

  assert.ok(
    url.startsWith('https://readiness.example.com/portal/'),
    `link must be https behind a TLS-terminating proxy, got ${url}`,
  );
});

test('the same request without the proxy header stays http, proving the header is what decides', async () => {
  // Guards against the test above passing for the wrong reason.
  const db = testDb();
  const app = buildServer(db, { ...TEST_ENV, publicUrl: null });
  const ctx = await practiceWithPack(app);

  const url = await issueLink(app, ctx, { host: 'readiness.example.com' });

  assert.ok(url.startsWith('http://'), `expected plain http without the proxy header, got ${url}`);
});

test('a poisoned Host header cannot redirect a client portal link', async () => {
  const db = testDb();
  const mspId = ensureMsp(db, 'alpha', 'Alpha Managed IT');
  void mspId;
  const app = buildServer(db, { ...TEST_ENV, publicUrl: 'https://readiness.example.com' });

  // Sign-up is the shortest route to an authenticated session here.
  const form = await app.inject({ method: 'GET', url: '/signup' });
  const csrfCookie = /rd_csrf=([^;]+)/.exec(String(form.headers['set-cookie']))![1]!;
  const csrf = /name="_csrf" value="([^"]+)"/.exec(form.body)![1]!;
  const signup = await app.inject({
    method: 'POST', url: '/signup', headers: { cookie: `rd_csrf=${csrfCookie}` },
    payload: {
      mspName: 'Northwind IT', name: 'J. Bell', email: 'j.bell@northwind.example',
      password: 'a-long-enough-password', _csrf: csrf,
    },
  });
  const session = /rd_session=([^;]+)/.exec(String(signup.headers['set-cookie']))![1]!;
  const cookie = `rd_csrf=${csrfCookie}; rd_session=${session}`;

  const created = await postForm(app, cookie, '/clients',
    { name: 'Harbour Dental Group', profileKey: 'insurer_baseline_2026' }, '/');
  const clientId = String(created.headers.location).replace('/clients/', '').replace(/\?.*/, '');

  const pack = await postForm(app, cookie, `/clients/${clientId}/packs`,
    { profileKey: 'insurer_baseline_2026' }, `/clients/${clientId}`);
  const packId = String(pack.headers.location).replace('/packs/', '');

  // The attacker controls the Host header on the request that mints the link.
  const page = await app.inject({ method: 'GET', url: `/clients/${clientId}`, headers: { cookie } });
  const token = /name="_csrf" value="([^"]+)"/.exec(page.body)![1]!;
  const shared = await app.inject({
    method: 'POST', url: `/clients/${clientId}/portal`,
    headers: { cookie, host: 'attacker.example.net' },
    payload: { packId, _csrf: token },
  });

  const url = new URL(String(shared.headers.location), 'http://localhost').searchParams.get('portalUrl')!;
  assert.ok(url.startsWith('https://readiness.example.com/portal/'), `link points at ${url}`);
  assert.ok(!url.includes('attacker.example.net'), 'the Host header must not decide where a shared link points');
});

// -- configuration ----------------------------------------------------------

test('production refuses to start without a public URL', () => {
  assert.throws(
    () => readEnv({ ...PROD, PUBLIC_URL: undefined }),
    /PUBLIC_URL is required in production/,
  );
});

test('a malformed public URL is rejected at startup, not at link time', () => {
  assert.throws(() => readEnv({ ...PROD, PUBLIC_URL: 'readiness.example.com' }), /bare origin/);
  assert.throws(() => readEnv({ ...PROD, PUBLIC_URL: 'https://host/path' }), /bare origin/);
});

test('production turns on secure cookies and https by default', () => {
  const env = readEnv(PROD);
  assert.equal(env.secureCookies, true);
  assert.equal(env.requireHttps, true);
  assert.equal(env.publicUrl, 'https://readiness.example.com');
  assert.equal(env.port, 8080);
});

test('a trailing slash on the public URL does not produce a double slash', () => {
  const env = readEnv({ ...PROD, PUBLIC_URL: 'https://readiness.example.com/' });
  assert.equal(env.publicUrl, 'https://readiness.example.com');
});

test('startup still refuses a missing or weak session secret', () => {
  assert.throws(() => readEnv({ ...PROD, SESSION_SECRET: undefined }), /SESSION_SECRET/);
  assert.throws(() => readEnv({ ...PROD, SESSION_SECRET: 'too-short' }), /at least 32 characters/);
});

// -- the deployment files themselves ---------------------------------------

test('.env.example documents every variable the app reads', () => {
  const example = readFileSync(join(projectRoot, '.env.example'), 'utf8');
  for (const key of [
    'SESSION_SECRET', 'PUBLIC_URL', 'PORT', 'NODE_ENV',
    'DATABASE_FILE', 'BACKUP_DIR', 'SIGNUP_INVITE_CODE', 'CHROME_PATH',
  ]) {
    assert.ok(new RegExp(`^${key}=`, 'm').test(example), `.env.example is missing ${key}`);
  }
  // It is committed, so it must never contain a real secret.
  assert.ok(!/SESSION_SECRET=[a-f0-9]{32,}/.test(example), '.env.example must not contain a real secret');
});

test('no secret is committed to the repository', () => {
  const gitignore = readFileSync(join(projectRoot, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\.env$/m, '.env must be ignored');
  assert.match(gitignore, /^backups\/$/m, 'backups may contain client data and must be ignored');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildServer } from '../src/server.ts';
import { ensureMsp } from '../src/db/msps.ts';
import { BODY_LIMIT } from '../src/http/security.ts';
import { cookieFrom, csrfFrom, TEST_ENV, testDb } from './helpers.ts';

function app() {
  const db = testDb();
  ensureMsp(db, 'alpha', 'Alpha Managed IT');
  return buildServer(db, TEST_ENV);
}

test('every response carries the security headers', async () => {
  const response = await app().inject({ method: 'GET', url: '/' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.match(String(response.headers['content-security-policy']), /default-src 'none'/);
  assert.match(String(response.headers['content-security-policy']), /frame-ancestors 'none'/);
});

test('the CSP nonce is per-response and matches the inline style tag', async () => {
  const server = app();
  const first = await server.inject({ method: 'GET', url: '/' });
  const second = await server.inject({ method: 'GET', url: '/' });

  const nonceOf = (csp: string) => /'nonce-([\w-]+)'/.exec(csp)![1];
  const a = nonceOf(String(first.headers['content-security-policy']));
  const b = nonceOf(String(second.headers['content-security-policy']));

  assert.notEqual(a, b, 'nonce must not be reused across responses');
  assert.ok(first.body.includes(`<style nonce="${a}">`), 'style tag must carry the response nonce');
});

test('a state-changing request without a CSRF token is rejected', async () => {
  const response = await app().inject({
    method: 'POST',
    url: '/clients',
    payload: { name: 'Injected Ltd' },
  });

  assert.equal(response.statusCode, 403);
  assert.match(response.body, /CSRF/i);
});

test('a forged CSRF token is rejected', async () => {
  const server = app();
  const form = await server.inject({ method: 'GET', url: '/' });
  const cookie = cookieFrom(form.headers, 'rd_csrf')!;

  const response = await server.inject({
    method: 'POST',
    url: '/clients',
    headers: { cookie: `rd_csrf=${encodeURIComponent(cookie)}` },
    payload: { name: 'Injected Ltd', _csrf: 'not-the-real-token' },
  });

  assert.equal(response.statusCode, 403);
});

test('a token without its matching cookie is rejected', async () => {
  const server = app();
  const form = await server.inject({ method: 'GET', url: '/' });

  // Attacker knows the token value but cannot set the HttpOnly cookie.
  const response = await server.inject({
    method: 'POST',
    url: '/clients',
    payload: { name: 'Injected Ltd', _csrf: csrfFrom(form.body) },
  });

  assert.equal(response.statusCode, 403);
});

test('a matching token and cookie is accepted', async () => {
  const server = app();
  const form = await server.inject({ method: 'GET', url: '/' });
  const cookie = cookieFrom(form.headers, 'rd_csrf')!;

  const response = await server.inject({
    method: 'POST',
    url: '/clients',
    headers: { cookie: `rd_csrf=${encodeURIComponent(cookie)}` },
    payload: { name: 'Ridgeline Logistics', _csrf: csrfFrom(form.body) },
  });

  assert.equal(response.statusCode, 302);
  assert.match(String(response.headers.location), /^\/clients\/cli_/);
});

test('an oversized body is refused', async () => {
  const server = app();
  const form = await server.inject({ method: 'GET', url: '/' });
  const cookie = cookieFrom(form.headers, 'rd_csrf')!;

  const response = await server.inject({
    method: 'POST',
    url: '/clients',
    headers: { cookie: `rd_csrf=${encodeURIComponent(cookie)}`, 'content-type': 'application/x-www-form-urlencoded' },
    payload: `_csrf=${encodeURIComponent(csrfFrom(form.body))}&name=${'x'.repeat(BODY_LIMIT + 1000)}`,
  });

  assert.equal(response.statusCode, 413);
});

test('malformed ids are rejected without touching the database', async () => {
  const server = app();
  for (const url of ['/clients/not-an-id', '/clients/../../etc/passwd', '/packs/cli_wrongprefix']) {
    const response = await server.inject({ method: 'GET', url });
    assert.ok(response.statusCode === 404 || response.statusCode === 400, `${url} -> ${response.statusCode}`);
  }
});

test('over-long and missing field values are rejected at the boundary', async () => {
  const server = app();
  const form = await server.inject({ method: 'GET', url: '/' });
  const cookie = cookieFrom(form.headers, 'rd_csrf')!;
  const csrf = csrfFrom(form.body);
  const headers = { cookie: `rd_csrf=${encodeURIComponent(cookie)}` };

  const blank = await server.inject({ method: 'POST', url: '/clients', headers, payload: { name: '  ', _csrf: csrf } });
  assert.equal(blank.statusCode, 400);

  const long = await server.inject({
    method: 'POST', url: '/clients', headers,
    payload: { name: 'x'.repeat(300), _csrf: csrf },
  });
  assert.equal(long.statusCode, 400);
});

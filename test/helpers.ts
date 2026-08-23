import { openDatabase, type Db } from '../src/db/connection.ts';
import { forTenant, type TenantDb } from '../src/db/tenant.ts';
import { syncConfig } from '../src/domain/config-loader.ts';
import { ensureMsp } from '../src/db/msps.ts';
import type { Env } from '../src/config/env.ts';

export const TEST_ENV: Env = {
  sessionSecret: 'test-secret-that-is-long-enough-to-pass-validation',
  port: 0,
  databaseFile: ':memory:',
  secureCookies: false,
  nodeEnv: 'test',
  signupInviteCode: null,
};

export function testDb(): Db {
  const db = openDatabase(':memory:');
  syncConfig(db);
  return db;
}

export function tenantFor(db: Db, slug: string, name: string): TenantDb {
  return forTenant(db, ensureMsp(db, slug, name));
}

/** Extracts a cookie value from one or more set-cookie headers. */
export function cookieFrom(headers: Record<string, unknown>, name: string): string | undefined {
  const raw = headers['set-cookie'];
  const all = Array.isArray(raw) ? raw : raw === undefined ? [] : [String(raw)];
  for (const line of all) {
    const match = new RegExp(`^${name}=([^;]*)`).exec(String(line));
    if (match) return decodeURIComponent(match[1]!);
  }
  return undefined;
}

/** Pulls the hidden CSRF field out of a server-rendered form. */
export function csrfFrom(html: string): string {
  const match = /name="_csrf" value="([^"]+)"/.exec(html);
  if (!match) throw new Error('no CSRF field in response');
  return match[1]!.replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

import type { FastifyInstance } from 'fastify';
import { hashPassword } from '../src/auth/passwords.ts';
import { buildServer } from '../src/server.ts';

export const PASSWORD = 'correct-horse-battery-staple';

export type Tenant = { mspId: string; tenant: TenantDb };

export async function seedTenant(
  db: Db,
  slug: string,
  name: string,
  users: { email: string; name: string; role: string }[],
): Promise<Tenant> {
  const mspId = ensureMsp(db, slug, name);
  const tenant = forTenant(db, mspId);
  const passwordHash = await hashPassword(PASSWORD);
  for (const user of users) {
    tenant.createUser({ ...user, passwordHash, createdBy: null });
  }
  return { mspId, tenant };
}

/** A server plus two fully separate tenants, for isolation testing. */
export async function twoTenantApp(): Promise<{
  db: Db;
  app: FastifyInstance;
  alpha: Tenant;
  beta: Tenant;
}> {
  const db = testDb();
  const alpha = await seedTenant(db, 'alpha', 'Alpha Managed IT', [
    { email: 'owner@alpha.example', name: 'Alpha Owner', role: 'owner' },
    { email: 'tech@alpha.example', name: 'Alpha Tech', role: 'operator' },
    { email: 'view@alpha.example', name: 'Alpha Viewer', role: 'read_only' },
  ]);
  const beta = await seedTenant(db, 'beta', 'Beta Technology Partners', [
    { email: 'owner@beta.example', name: 'Beta Owner', role: 'owner' },
  ]);
  return { db, app: buildServer(db, TEST_ENV), alpha, beta };
}

/** Signs in and returns a cookie header carrying both session and CSRF cookies. */
export async function signIn(app: FastifyInstance, email: string, password = PASSWORD): Promise<string> {
  const form = await app.inject({ method: 'GET', url: '/login' });
  const csrfCookie = cookieFrom(form.headers, 'rd_csrf')!;

  const response = await app.inject({
    method: 'POST',
    url: '/login',
    headers: { cookie: `rd_csrf=${encodeURIComponent(csrfCookie)}` },
    payload: { email, password, _csrf: csrfFrom(form.body) },
  });

  const session = cookieFrom(response.headers, 'rd_session');
  if (!session) throw new Error(`sign-in failed for ${email}: ${response.statusCode}`);
  return `rd_csrf=${encodeURIComponent(csrfCookie)}; rd_session=${encodeURIComponent(session)}`;
}

/** Posts a form with the CSRF token lifted from a page the session can see. */
export async function postForm(
  app: FastifyInstance,
  cookie: string,
  url: string,
  payload: Record<string, unknown>,
  formUrl = '/',
) {
  const page = await app.inject({ method: 'GET', url: formUrl, headers: { cookie } });
  const csrf = /name="_csrf" value="([^"]+)"/.exec(page.body)?.[1] ?? tokenFromCookie(cookie);
  return app.inject({ method: 'POST', url, headers: { cookie }, payload: { ...payload, _csrf: csrf } });
}

function tokenFromCookie(cookie: string): string {
  const raw = /rd_csrf=([^;]+)/.exec(cookie)?.[1] ?? '';
  const decoded = decodeURIComponent(raw);
  return decoded.slice(0, decoded.lastIndexOf('.'));
}

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

import { openDatabase, type Db } from '../src/db/connection.ts';
import { forTenant, type TenantDb } from '../src/db/tenant.ts';
import { syncConfig } from '../src/domain/config-loader.ts';
import { ensureMsp } from '../src/db/msps.ts';

export function testDb(): Db {
  const db = openDatabase(':memory:');
  syncConfig(db);
  return db;
}

export function tenantFor(db: Db, slug: string, name: string): TenantDb {
  return forTenant(db, ensureMsp(db, slug, name));
}

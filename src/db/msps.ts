import { id, nowIso, type Db } from './connection.ts';

export type Msp = { id: string; slug: string; name: string };

/** Tenant provisioning. The only place an msp row is created. */
export function ensureMsp(db: Db, slug: string, name: string): string {
  const existing = db.prepare(`SELECT id FROM msps WHERE slug = ?`).get(slug) as { id: string } | undefined;
  if (existing) return existing.id;
  const mspId = id('msp');
  db.prepare(`INSERT INTO msps (id, slug, name, created_at) VALUES (?, ?, ?, ?)`).run(
    mspId,
    slug,
    name,
    nowIso(),
  );
  return mspId;
}

export function getMspBySlug(db: Db, slug: string): Msp | undefined {
  return db.prepare(`SELECT id, slug, name FROM msps WHERE slug = ?`).get(slug) as Msp | undefined;
}

export function firstMsp(db: Db): Msp | undefined {
  return db.prepare(`SELECT id, slug, name FROM msps ORDER BY created_at LIMIT 1`).get() as Msp | undefined;
}

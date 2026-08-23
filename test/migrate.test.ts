import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { openDatabase } from '../src/db/connection.ts';
import { currentVersion, loadMigrations, migrate } from '../src/db/migrate.ts';

test('migrations are numbered uniquely and named consistently', () => {
  const migrations = loadMigrations();
  assert.ok(migrations.length > 0);

  const versions = migrations.map((m) => m.version);
  assert.deepEqual(versions, [...new Set(versions)], 'duplicate migration version');
  assert.deepEqual(versions, [...versions].sort((a, b) => a - b), 'migrations out of order');
});

test('a fresh database is brought to the latest version', () => {
  const db = openDatabase(':memory:');
  assert.equal(currentVersion(db), loadMigrations().at(-1)!.version);

  const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[])
    .map((row) => row.name);
  for (const expected of ['msps', 'clients', 'evidence_records', 'evidence_packs', 'schema_migrations']) {
    assert.ok(tables.includes(expected), `missing table ${expected}`);
  }
});

test('running migrations twice applies nothing the second time', () => {
  const db = openDatabase(':memory:');
  const second = migrate(db);
  assert.deepEqual(second.applied, [], 'a second run must be a no-op');
});

test('an already-provisioned database is adopted without data loss', () => {
  // Simulates a Phase 1 database created before schema_migrations existed: the
  // tables are already there, so the migration must be additive, not a rewrite.
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const [initial] = loadMigrations();
  db.exec(initial!.sql);
  db.prepare(`INSERT INTO msps (id, slug, name, created_at) VALUES (?, ?, ?, ?)`).run(
    'msp_1', 'existing', 'Existing MSP', new Date().toISOString(),
  );

  migrate(db);

  const rows = db.prepare(`SELECT slug FROM msps`).all() as { slug: string }[];
  assert.deepEqual(rows.map((r) => r.slug), ['existing'], 'pre-existing rows must survive');
  assert.equal(currentVersion(db), loadMigrations().at(-1)!.version);
});

test('editing a shipped migration is rejected', () => {
  const db = openDatabase(':memory:');
  db.prepare(`UPDATE schema_migrations SET checksum = 'tampered' WHERE version = 1`).run();
  assert.throws(() => migrate(db), /has changed since it was applied/);
});

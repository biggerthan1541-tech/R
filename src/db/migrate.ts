import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './connection.ts';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export type Migration = { version: number; name: string; file: string; sql: string };

/**
 * Migrations are plain .sql files named `NNN_description.sql`. They are applied
 * in numeric order, once each, and recorded in schema_migrations.
 *
 * Rules for adding one:
 *  - Never edit a migration that has shipped. Add a new file.
 *  - Additive only: new tables, new columns, new indexes. A destructive change
 *    needs an explicit data-preserving path written into the migration itself.
 *  - The checksum below catches a shipped migration being edited after the fact,
 *    which would leave databases silently diverged.
 */
export function loadMigrations(): Migration[] {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  return files.map((file) => {
    const match = /^(\d+)_(.+)\.sql$/.exec(file);
    if (!match) {
      throw new Error(`Migration "${file}" must be named NNN_description.sql`);
    }
    return {
      version: Number(match[1]),
      name: match[2]!,
      file,
      sql: readFileSync(join(migrationsDir, file), 'utf8'),
    };
  });
}

function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex').slice(0, 16);
}

export function migrate(db: Db): { applied: number[]; alreadyAt: number } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      checksum   TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const migrations = loadMigrations();
  const seen = new Set<number>();
  for (const migration of migrations) {
    if (seen.has(migration.version)) {
      throw new Error(`Duplicate migration version ${migration.version}.`);
    }
    seen.add(migration.version);
  }

  const recorded = new Map(
    (db.prepare(`SELECT version, checksum FROM schema_migrations`).all() as {
      version: number;
      checksum: string;
    }[]).map((row) => [row.version, row.checksum]),
  );

  const applied: number[] = [];
  for (const migration of migrations) {
    const existing = recorded.get(migration.version);
    if (existing !== undefined) {
      if (existing !== checksum(migration.sql)) {
        throw new Error(
          `Migration ${migration.file} has changed since it was applied. ` +
            `Shipped migrations are immutable -- add a new one instead.`,
        );
      }
      continue;
    }

    const run = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare(
        `INSERT INTO schema_migrations (version, name, checksum, applied_at)
         VALUES (?, ?, ?, ?)`,
      ).run(migration.version, migration.name, checksum(migration.sql), new Date().toISOString());
    });
    run();
    applied.push(migration.version);
  }

  return { applied, alreadyAt: migrations.at(-1)?.version ?? 0 };
}

export function currentVersion(db: Db): number {
  const row = db
    .prepare(`SELECT MAX(version) AS version FROM schema_migrations`)
    .get() as { version: number | null } | undefined;
  return row?.version ?? 0;
}

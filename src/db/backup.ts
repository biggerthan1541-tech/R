import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase, projectRoot, type Db } from './connection.ts';
import { currentVersion } from './migrate.ts';

/**
 * Backup and restore for the SQLite file.
 *
 * SQLite is one file, but copying it with `cp` while the server is writing can
 * capture a torn database. SQLite's own online backup API takes a consistent
 * snapshot of a live database without stopping the app, which is what this uses.
 *
 * A backup nobody has restored is not a backup. `npm run restore` is the tested
 * counterpart, and test/backup.test.ts restores one and reads the data back.
 */
export function backupPath(dir: string, at = new Date()): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return join(dir, `readiness-${stamp}.db`);
}

export type BackupResult = { file: string; bytes: number; schema: number; integrity: string };

export async function backupTo(destination: string, sourceFile?: string): Promise<BackupResult> {
  const source = openDatabase(sourceFile);
  mkdirSync(dirname(destination), { recursive: true });

  // Consistent snapshot of a live database -- safe while the server is serving.
  await source.backup(destination);

  const copy = new Database(destination, { readonly: true });
  try {
    const integrity = (copy.pragma('integrity_check', { simple: true }) as string) ?? 'unknown';
    if (integrity !== 'ok') {
      throw new Error(`Backup failed its integrity check: ${integrity}`);
    }
    return {
      file: destination,
      bytes: statSync(destination).size,
      schema: currentVersion(copy as unknown as Db),
      integrity,
    };
  } finally {
    copy.close();
    if (!sourceFile) source.close();
    // Opening the copy to verify it creates WAL sidecars. The backup itself is
    // a complete database without them, and leaving them behind means whoever
    // follows the runbook has to guess which of three files to copy.
    for (const suffix of ['-wal', '-shm']) rmSync(`${destination}${suffix}`, { force: true });
  }
}

/**
 * Replaces the live database with a backup.
 *
 * The current file is moved aside first rather than deleted, so a restore that
 * turns out to be the wrong file is itself reversible. Stop the app first: this
 * swaps the file out from under any open connection.
 */
export function restoreFrom(backupFile: string, targetFile?: string): { restored: string; movedAside: string } {
  if (!existsSync(backupFile)) throw new Error(`No such backup: ${backupFile}`);

  const target = targetFile ?? process.env.DATABASE_FILE ?? join(projectRoot, 'data', 'readiness.db');

  const candidate = new Database(backupFile, { readonly: true });
  try {
    const integrity = candidate.pragma('integrity_check', { simple: true }) as string;
    if (integrity !== 'ok') throw new Error(`Refusing to restore a corrupt backup: ${integrity}`);
    const tables = candidate
      .prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`)
      .get() as { n: number };
    if (tables.n === 0) throw new Error('That file is not a Readiness database.');
  } finally {
    candidate.close();
  }

  mkdirSync(dirname(target), { recursive: true });
  const movedAside = `${target}.replaced-${Date.now()}`;
  if (existsSync(target)) renameSync(target, movedAside);
  // WAL sidecars belong to the old file; leaving them would corrupt the new one.
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(`${target}${suffix}`)) renameSync(`${target}${suffix}`, `${movedAside}${suffix}`);
  }

  copyFileSync(backupFile, target);
  return { restored: target, movedAside: existsSync(movedAside) ? movedAside : '' };
}

export function describeBackup(result: BackupResult): string {
  const mb = (result.bytes / 1024 / 1024).toFixed(2);
  return `${basename(result.file)}  ${mb} MB  schema v${result.schema}  integrity ${result.integrity}`;
}

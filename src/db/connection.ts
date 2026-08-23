import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const projectRoot = join(here, '..', '..');

export type Db = Database.Database;

export function openDatabase(file?: string): Db {
  const path = file ?? process.env.DATABASE_FILE ?? join(projectRoot, 'data', 'readiness.db');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  return db;
}

let shared: Db | null = null;

export function db(): Db {
  if (!shared) shared = openDatabase();
  return shared;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

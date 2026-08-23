import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { projectRoot } from '../src/db/connection.ts';

const SRC = join(projectRoot, 'src');
const DB_DIR = join(SRC, 'db');

/**
 * Locks in the Phase 1 isolation guarantee.
 *
 * Tenant isolation rests on every query going through the scoped repository in
 * src/db/tenant.ts. That holds only while SQL cannot be written anywhere else,
 * so this test enforces the structural rule directly: all database access lives
 * under src/db/. New code that reaches for a raw handle fails here rather than
 * quietly opening a cross-tenant hole.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

const DB_CALL = /\.\s*(prepare|exec|pragma)\s*\(/;

/**
 * SQL is detected by keyword PAIRS in upper case -- the convention every query
 * in src/db/ follows. Requiring a pair keeps `<select>` markup and `.update()`
 * calls from tripping the scan, and requiring upper case keeps prose out of it.
 */
const SQL_PATTERNS: RegExp[] = [
  /\bSELECT\b[\s\S]{0,600}?\bFROM\b/,
  /\bINSERT\s+INTO\b/,
  /\bUPDATE\b[\s\S]{0,300}?\bSET\b/,
  /\bDELETE\s+FROM\b/,
  /\b(CREATE|DROP|ALTER)\s+(TABLE|VIEW|INDEX|TRIGGER)\b/,
];

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function sqlHits(source: string): number[] {
  const lines = new Set<number>();
  for (const pattern of SQL_PATTERNS) {
    const global = new RegExp(pattern.source, 'g');
    for (const match of source.matchAll(global)) {
      lines.add(lineOf(source, match.index));
    }
  }
  return [...lines].sort((a, b) => a - b);
}

test('no database access outside src/db/', () => {
  const offenders: string[] = [];

  for (const file of sourceFiles(SRC)) {
    if (file.startsWith(DB_DIR)) continue;
    const source = readFileSync(file, 'utf8');
    const where = relative(projectRoot, file);

    source.split('\n').forEach((line, index) => {
      if (DB_CALL.test(line.replace(/\/\/.*$/, ''))) {
        offenders.push(`${where}:${index + 1} calls .prepare/.exec/.pragma directly`);
      }
    });
    for (const line of sqlHits(source)) offenders.push(`${where}:${line} contains SQL`);
  }

  assert.deepEqual(
    offenders,
    [],
    `Database access must go through the scoped repository in src/db/.\n${offenders.join('\n')}`,
  );
});

test('only the scoped repository queries tenant-scoped tables', () => {
  // Guards against a sibling module under src/db/ growing unscoped queries
  // against customer data. Schema lives in migrations; scoped access lives in
  // tenant.ts. Nothing else in src/db/ may name these tables.
  const TENANT_TABLES = ['clients', 'client_profiles', 'evidence_records', 'evidence_packs', 'current_evidence'];
  const ALLOWED = new Set(['tenant.ts']);
  const offenders: string[] = [];

  for (const file of sourceFiles(DB_DIR)) {
    const name = relative(DB_DIR, file);
    if (ALLOWED.has(name)) continue;
    const source = readFileSync(file, 'utf8');
    const lines = source.split('\n');

    for (const line of sqlHits(source)) {
      for (const table of TENANT_TABLES) {
        if (new RegExp(`\\b${table}\\b`).test(lines[line - 1] ?? '')) {
          offenders.push(`src/db/${name}:${line} queries "${table}" outside tenant.ts`);
        }
      }
    }
  }

  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('the evidence log has no update or delete path', () => {
  // The append-only guarantee is structural, not conventional.
  const offenders: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    const where = relative(projectRoot, file);
    source.split('\n').forEach((line, index) => {
      if (/\b(UPDATE|DELETE\s+FROM)\b/i.test(line) && /\bevidence_records\b/.test(line)) {
        offenders.push(`${where}:${index + 1}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `evidence_records must never be updated or deleted:\n${offenders.join('\n')}`);
});

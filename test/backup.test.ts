import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase } from '../src/db/connection.ts';
import { backupPath, backupTo, restoreFrom } from '../src/db/backup.ts';
import { ensureMsp } from '../src/db/msps.ts';
import { forTenant } from '../src/db/tenant.ts';
import { syncConfig } from '../src/domain/config-loader.ts';

/**
 * A backup that has never been restored is a guess. These tests take a real
 * database with client evidence in it, back it up, destroy the data, restore,
 * and read the evidence back.
 */
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'readiness-backup-'));
  const dbFile = join(dir, 'readiness.db');
  return { dir, dbFile, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function seedClient(dbFile: string, clientName: string) {
  const db = openDatabase(dbFile);
  syncConfig(db);
  const mspId = ensureMsp(db, 'northwind', 'Northwind IT Services');
  const tenant = forTenant(db, mspId);
  const client = tenant.createClient({ name: clientName });
  tenant.setClientProfiles(client.id, ['insurer_baseline_2026']);
  tenant.appendEvidence({
    clientId: client.id, controlKey: 'mfa_coverage', controlVersion: 'v1',
    answerValue: 'everywhere', answerLabel: 'All staff, on every business system',
    status: 'pass', gapExplanation: null, remediation: null,
    note: 'Rolled out before the audit', source: 'manual', recordedBy: 'J. Bell',
  });
  db.close();
  return { mspId, clientId: client.id };
}

test('a backup of a live database is consistent and self-describing', async () => {
  const ws = workspace();
  try {
    seedClient(ws.dbFile, 'Harbour Dental Group');

    // Taken while a connection is open, as it would be on a running server.
    const live = openDatabase(ws.dbFile);
    const result = await backupTo(backupPath(ws.dir), ws.dbFile);
    live.close();

    assert.equal(result.integrity, 'ok');
    assert.ok(result.bytes > 0);
    assert.ok(result.schema >= 2, `expected a migrated schema, got v${result.schema}`);
  } finally {
    ws.cleanup();
  }
});

test('restoring brings back data that was destroyed after the backup', async () => {
  const ws = workspace();
  try {
    const { mspId, clientId } = seedClient(ws.dbFile, 'Harbour Dental Group');
    const backup = await backupTo(backupPath(ws.dir), ws.dbFile);

    // The disaster: the client and every trace of their evidence is deleted.
    const live = openDatabase(ws.dbFile);
    forTenant(live, mspId);
    live.prepare(`DELETE FROM clients WHERE id = ?`).run(clientId);
    assert.equal(forTenant(live, mspId).listClients().length, 0, 'setup: the client should be gone');
    live.close();

    restoreFrom(backup.file, ws.dbFile);

    const recovered = openDatabase(ws.dbFile);
    const tenant = forTenant(recovered, mspId);
    const clients = tenant.listClients();
    assert.equal(clients.length, 1);
    assert.equal(clients[0]!.name, 'Harbour Dental Group');

    // And the append-only evidence came back with it, intact.
    const evidence = tenant.evidenceHistory(clientId);
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0]!.answer_label, 'All staff, on every business system');
    assert.equal(evidence[0]!.note, 'Rolled out before the audit');
    recovered.close();
  } finally {
    ws.cleanup();
  }
});

test('restoring keeps the replaced database rather than deleting it', async () => {
  const ws = workspace();
  try {
    seedClient(ws.dbFile, 'Harbour Dental Group');
    const backup = await backupTo(backupPath(ws.dir), ws.dbFile);

    const { movedAside } = restoreFrom(backup.file, ws.dbFile);

    assert.ok(movedAside, 'the previous database must be kept');
    assert.ok(existsSync(movedAside), 'a restore with the wrong file must itself be reversible');
  } finally {
    ws.cleanup();
  }
});

test('a corrupt or foreign file is refused before anything is replaced', async () => {
  const ws = workspace();
  try {
    seedClient(ws.dbFile, 'Harbour Dental Group');

    const junk = join(ws.dir, 'not-a-database.db');
    writeFileSync(junk, 'this is not a sqlite file');
    assert.throws(() => restoreFrom(junk, ws.dbFile), /not a Readiness database|Refusing|file is not a database/i);

    // An unrelated but perfectly valid SQLite file is refused too: "it opens"
    // is not the same as "it is ours".
    const foreign = join(ws.dir, 'foreign.db');
    const other = new Database(foreign);
    other.exec('CREATE TABLE unrelated (x)');
    other.close();
    assert.throws(() => restoreFrom(foreign, ws.dbFile), /not a Readiness database/);

    // The live database is untouched by either attempt.
    const db = openDatabase(ws.dbFile);
    const mspId = ensureMsp(db, 'northwind', 'Northwind IT Services');
    assert.equal(forTenant(db, mspId).listClients().length, 1);
    db.close();
  } finally {
    ws.cleanup();
  }
});

test('a missing backup file fails loudly', () => {
  assert.throws(() => restoreFrom('/nonexistent/backup.db'), /No such backup/);
});

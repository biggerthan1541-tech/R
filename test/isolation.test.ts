import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertScoped, TenantDb } from '../src/db/tenant.ts';
import { testDb, tenantFor } from './helpers.ts';

function twoTenants() {
  const db = testDb();
  const alpha = tenantFor(db, 'alpha', 'Alpha Managed IT');
  const beta = tenantFor(db, 'beta', 'Beta Technology Partners');
  return { db, alpha, beta };
}

test('a client created by one MSP is invisible to another', () => {
  const { alpha, beta } = twoTenants();
  alpha.createClient({ name: 'Acme Joinery' });

  assert.equal(alpha.listClients().length, 1);
  assert.deepEqual(beta.listClients(), []);
});

test('an MSP cannot fetch another MSP\'s client by guessing its id', () => {
  const { alpha, beta } = twoTenants();
  const client = alpha.createClient({ name: 'Acme Joinery' });

  assert.equal(alpha.getClient(client.id)?.name, 'Acme Joinery');
  assert.equal(beta.getClient(client.id), undefined);
});

test('evidence written by one MSP is not readable or listable by another', () => {
  const { alpha, beta } = twoTenants();
  const client = alpha.createClient({ name: 'Acme Joinery' });
  alpha.appendEvidence({
    clientId: client.id,
    controlKey: 'mfa_coverage',
    controlVersion: 'v1',
    answerValue: 'everywhere',
    answerLabel: 'All staff',
    status: 'pass',
    gapExplanation: null,
    remediation: null,
    note: null,
    source: 'manual',
    recordedBy: 'tester',
  });

  assert.equal(alpha.evidenceHistory(client.id).length, 1);
  assert.equal(alpha.currentEvidence(client.id).size, 1);
  assert.equal(beta.evidenceHistory(client.id).length, 0);
  assert.equal(beta.currentEvidence(client.id).size, 0);
});

test('the database rejects evidence attached to another tenant\'s client', () => {
  const { alpha, beta } = twoTenants();
  const client = alpha.createClient({ name: 'Acme Joinery' });

  // Beta knows Alpha's client id and writes directly. The composite foreign key
  // (msp_id, client_id) -> clients(msp_id, id) has no matching parent row, so
  // SQLite refuses the insert. Isolation does not rely on the query being right.
  assert.throws(
    () =>
      beta.appendEvidence({
        clientId: client.id,
        controlKey: 'mfa_coverage',
        controlVersion: 'v1',
        answerValue: 'none',
        answerLabel: 'Nowhere',
        status: 'fail',
        gapExplanation: 'x',
        remediation: 'y',
        note: null,
        source: 'manual',
        recordedBy: 'attacker',
      }),
    /FOREIGN KEY constraint failed/,
  );
});

test('packs are scoped to the MSP that generated them', () => {
  const { alpha, beta } = twoTenants();
  const client = alpha.createClient({ name: 'Acme Joinery' });
  const packId = alpha.newPackId();
  alpha.savePack({
    packId,
    clientId: client.id,
    profileKey: 'insurer_baseline_2026',
    score: 50,
    state: 'not_ready',
    snapshot: { hello: 'world' },
    generatedBy: 'tester',
  });

  assert.equal(alpha.getPack(packId)?.score, 50);
  assert.equal(beta.getPack(packId), undefined);
});

test('the guard refuses SQL that touches tenant data without an msp_id filter', () => {
  // The failure mode this exists to catch: a scoped-table query written without
  // a tenant predicate. It throws at call time rather than returning rows.
  assert.throws(() => assertScoped('SELECT * FROM clients'), /without an "msp_id = @msp_id" filter/);
  assert.throws(
    () => assertScoped('SELECT * FROM evidence_records WHERE client_id = @client_id'),
    /without an "msp_id = @msp_id" filter/,
  );
  assert.throws(() => assertScoped('DELETE FROM evidence_packs'), /without an "msp_id = @msp_id" filter/);

  // A correctly scoped query passes, and reference data is unaffected.
  assertScoped('SELECT * FROM clients WHERE msp_id = @msp_id');
  assertScoped('SELECT * FROM controls ORDER BY sort_order');
});

test('the guard refuses an insert that does not write the bound msp_id', () => {
  assert.throws(
    () => assertScoped('INSERT INTO clients (id, name) VALUES (@id, @name)'),
    /without writing the bound @msp_id/,
  );
  assertScoped('INSERT INTO clients (id, msp_id, name) VALUES (@id, @msp_id, @name)');
});

test('the guard is not fooled by an msp_id mention inside a comment', () => {
  assert.throws(
    () => assertScoped('SELECT * FROM clients -- msp_id = @msp_id\n'),
    /without an "msp_id = @msp_id" filter/,
  );
});

test('TenantDb refuses to construct without a tenant id', () => {
  const { db } = twoTenants();
  assert.throws(() => new TenantDb(db, ''), /requires an msp id/);
});

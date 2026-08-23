import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postForm, signIn, twoTenantApp } from './helpers.ts';

test('operator actions are recorded with who, what and when', async () => {
  const { app, alpha } = await twoTenantApp();
  const cookie = await signIn(app, 'owner@alpha.example');

  await postForm(app, cookie, '/clients', { name: 'Acme Joinery', profileKey: 'insurer_baseline_2026' });

  const actions = alpha.tenant.auditTrail().map((entry) => entry.action);
  assert.ok(actions.includes('auth.login'));
  assert.ok(actions.includes('client.create'));

  const created = alpha.tenant.auditTrail().find((entry) => entry.action === 'client.create')!;
  assert.equal(created.actor_label, 'owner@alpha.example');
  assert.equal(created.subject_type, 'client');
  assert.match(created.detail, /Acme Joinery/);
  assert.ok(!Number.isNaN(Date.parse(created.occurred_at)));
});

test('failed sign-ins are recorded', async () => {
  const { app, alpha } = await twoTenantApp();
  const form = await app.inject({ method: 'GET', url: '/login' });
  const cookie = /rd_csrf=([^;]+)/.exec(String(form.headers['set-cookie']))![1]!;
  const csrf = /name="_csrf" value="([^"]+)"/.exec(form.body)![1]!;

  await app.inject({
    method: 'POST', url: '/login',
    headers: { cookie: `rd_csrf=${cookie}` },
    payload: { email: 'owner@alpha.example', password: 'wrong', _csrf: csrf },
  });

  const entry = alpha.tenant.auditTrail().find((row) => row.action === 'auth.login.failed');
  assert.ok(entry, 'a failed sign-in must be recorded');
  assert.match(entry!.detail, /bad_password/);
});

test('the audit chain verifies for an untouched log', async () => {
  const { app, alpha } = await twoTenantApp();
  const cookie = await signIn(app, 'owner@alpha.example');
  await postForm(app, cookie, '/clients', { name: 'Acme Joinery' });
  await postForm(app, cookie, '/clients', { name: 'Second Client' });

  assert.deepEqual(alpha.tenant.verifyAuditChain(), { ok: true });
});

test('editing an audit entry breaks the chain', async () => {
  const { app, alpha, db } = await twoTenantApp();
  const cookie = await signIn(app, 'owner@alpha.example');
  await postForm(app, cookie, '/clients', { name: 'Acme Joinery' });
  await postForm(app, cookie, '/clients', { name: 'Second Client' });

  const target = alpha.tenant.auditTrail().find((entry) => entry.action === 'client.create')!;
  // Tamper directly in the database, the way someone covering their tracks would.
  db.prepare(`UPDATE audit_log SET actor_label = 'someone.else@example' WHERE id = ?`).run(target.id);

  const result = alpha.tenant.verifyAuditChain();
  assert.equal(result.ok, false);
  assert.equal((result as { brokenAt: number }).brokenAt, target.seq);
});

test('deleting an audit entry breaks the chain', async () => {
  const { app, alpha, db } = await twoTenantApp();
  const cookie = await signIn(app, 'owner@alpha.example');
  await postForm(app, cookie, '/clients', { name: 'Acme Joinery' });
  await postForm(app, cookie, '/clients', { name: 'Second Client' });

  const entries = alpha.tenant.auditTrail();
  db.prepare(`DELETE FROM audit_log WHERE id = ?`).run(entries[1]!.id);

  assert.equal(alpha.tenant.verifyAuditChain().ok, false);
});

test('each tenant has its own independent chain', async () => {
  const { app, alpha, beta } = await twoTenantApp();
  const alphaCookie = await signIn(app, 'owner@alpha.example');
  const betaCookie = await signIn(app, 'owner@beta.example');

  await postForm(app, alphaCookie, '/clients', { name: 'Acme Joinery' });
  await postForm(app, betaCookie, '/clients', { name: 'Beta Client' });

  assert.equal(alpha.tenant.verifyAuditChain().ok, true);
  assert.equal(beta.tenant.verifyAuditChain().ok, true);
  assert.ok(alpha.tenant.auditTrail().every((entry) => entry.msp_id === alpha.mspId));
  assert.ok(beta.tenant.auditTrail().every((entry) => entry.msp_id === beta.mspId));
});

test('the audit page reports whether the chain verifies', async () => {
  const { app, alpha, db } = await twoTenantApp();
  const cookie = await signIn(app, 'owner@alpha.example');
  await postForm(app, cookie, '/clients', { name: 'Acme Joinery' });

  const healthy = await app.inject({ method: 'GET', url: '/audit', headers: { cookie } });
  assert.match(healthy.body, /Hash chain verified/);

  const target = alpha.tenant.auditTrail()[0]!;
  db.prepare(`UPDATE audit_log SET action = 'nothing.happened' WHERE id = ?`).run(target.id);

  const tampered = await app.inject({ method: 'GET', url: '/audit', headers: { cookie } });
  assert.match(tampered.body, /verification FAILED/);
});

test('evidence and audit logs stay separate', async () => {
  const { app, alpha } = await twoTenantApp();
  const cookie = await signIn(app, 'owner@alpha.example');
  const created = await postForm(app, cookie, '/clients', {
    name: 'Acme Joinery',
    profileKey: 'insurer_baseline_2026',
  });
  const clientId = String(created.headers.location).replace('/clients/', '').replace(/\?.*/, '');

  await postForm(app, cookie, `/clients/${clientId}/evidence`,
    { answer__mfa_coverage: 'everywhere' }, `/clients/${clientId}`);

  // The evidence log holds the control's state; the audit log holds the act of recording it.
  const evidence = alpha.tenant.evidenceHistory(clientId);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0]!.status, 'pass');

  const audited = alpha.tenant.auditTrail().find((entry) => entry.action === 'evidence.record')!;
  assert.equal(audited.subject_id, clientId);
  assert.match(audited.detail, /mfa_coverage/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listControls } from '../src/domain/config-loader.ts';
import { evaluateControl } from '../src/domain/evaluate.ts';
import { assessClient } from '../src/domain/readiness.ts';
import { generatePack } from '../src/server.ts';
import { renderEvidencePack, type PackSnapshot } from '../src/render/evidence-pack.ts';
import type { Db } from '../src/db/connection.ts';
import type { TenantDb } from '../src/db/tenant.ts';
import { testDb, tenantFor } from './helpers.ts';

function record(db: Db, tenant: TenantDb, clientId: string, answers: Record<string, unknown>): void {
  for (const control of listControls(db)) {
    const raw = answers[control.key];
    if (raw === undefined) continue;
    const evaluated = evaluateControl(control, raw);
    tenant.appendEvidence({
      clientId,
      controlKey: control.key,
      controlVersion: control.version,
      answerValue: evaluated.answerValue,
      answerLabel: evaluated.answerLabel,
      status: evaluated.status,
      gapExplanation: evaluated.gap?.consequence ?? null,
      remediation: evaluated.gap?.fix ?? null,
      note: null,
      source: 'manual',
      recordedBy: 'tester',
    });
  }
}

const PERFECT = {
  mfa_coverage: 'everywhere',
  edr_deployment: 100,
  tested_backups: 'tested_offline',
  email_security: 'reject',
  access_offboarding: 'checklist_reviewed',
  patch_management: 'scheduled_reported',
  incident_response_plan: 'documented_tested',
  security_awareness_training: 'annual_simulated',
  encryption: 'full',
};

function setup() {
  const db = testDb();
  const tenant = tenantFor(db, 'alpha', 'Alpha Managed IT');
  const client = tenant.createClient({ name: 'Acme Joinery' });
  tenant.setClientProfiles(client.id, ['insurer_baseline_2026']);
  return { db, tenant, clientId: client.id };
}

test('a client with no evidence scores zero and is not ready', () => {
  const { db, tenant, clientId } = setup();
  const assessment = assessClient(db, tenant, clientId, 'insurer_baseline_2026');

  assert.equal(assessment.score, 0);
  assert.equal(assessment.state, 'not_ready');
  assert.equal(assessment.counts.unknown, assessment.controls.length);
  assert.equal(assessment.coverage.answered, 0);
});

test('unanswered controls still produce plain-language copy for the pack', () => {
  const { db, tenant, clientId } = setup();
  const assessment = assessClient(db, tenant, clientId, 'insurer_baseline_2026');
  for (const gap of assessment.gaps) {
    assert.ok(gap.gapExplanation && gap.gapExplanation.length > 40, gap.controlKey);
    assert.ok(gap.remediation, gap.controlKey);
  }
});

test('a fully compliant client scores 100 and reads as ready', () => {
  const { db, tenant, clientId } = setup();
  record(db, tenant, clientId, PERFECT);
  const assessment = assessClient(db, tenant, clientId, 'insurer_baseline_2026');

  assert.equal(assessment.score, 100);
  assert.equal(assessment.state, 'ready');
  assert.equal(assessment.gaps.length, 0);
});

test('a failing mandatory control blocks readiness regardless of a high score', () => {
  const { db, tenant, clientId } = setup();

  // A recommended control failing costs points but does not block: this is an
  // insurer's view, where some answers are disqualifying and others are pricing.
  record(db, tenant, clientId, { ...PERFECT, email_security: 'none' });
  const priced = assessClient(db, tenant, clientId, 'insurer_baseline_2026');
  assert.equal(priced.state, 'ready');
  assert.ok(priced.score < 100 && priced.score > 85);
  assert.equal(priced.gaps[0]!.controlKey, 'email_security');

  // A mandatory control failing is disqualifying whatever the score says.
  record(db, tenant, clientId, { mfa_coverage: 'none' });
  const blocked = assessClient(db, tenant, clientId, 'insurer_baseline_2026');
  assert.equal(blocked.state, 'not_ready');
  assert.match(blocked.stateExplanation, /multi-factor authentication/i);
});

test('a mandatory control only partly in place reads as ready with conditions', () => {
  const { db, tenant, clientId } = setup();
  record(db, tenant, clientId, { ...PERFECT, mfa_coverage: 'admins_only' });
  const assessment = assessClient(db, tenant, clientId, 'insurer_baseline_2026');

  assert.equal(assessment.state, 'conditional');
  assert.match(assessment.stateExplanation, /only\s+partly in place/i);
});

test('meeting every mandatory requirement but little else reads as conditional', () => {
  const { db, tenant, clientId } = setup();
  record(db, tenant, clientId, {
    mfa_coverage: 'everywhere',
    tested_backups: 'tested_offline',
    edr_deployment: 100,
  });
  const assessment = assessClient(db, tenant, clientId, 'insurer_baseline_2026');

  assert.equal(assessment.counts.unknown, 6);
  assert.ok(assessment.score < 85);
  assert.equal(assessment.state, 'conditional');
});

test('gaps are ordered with mandatory requirements first, then by impact', () => {
  const { db, tenant, clientId } = setup();
  record(db, tenant, clientId, {
    ...PERFECT,
    mfa_coverage: 'none',
    tested_backups: 'none',
    encryption: 'none',
  });
  const assessment = assessClient(db, tenant, clientId, 'insurer_baseline_2026');
  const order = assessment.gaps.map((gap) => gap.controlKey);

  assert.deepEqual(order.slice(0, 2), ['mfa_coverage', 'tested_backups']);
  assert.equal(order.at(-1), 'encryption');
  assert.ok(assessment.gaps[0]!.impact > assessment.gaps.at(-1)!.impact);
});

test('the same evidence scores differently against different profiles', () => {
  const { db, tenant, clientId } = setup();
  tenant.setClientProfiles(clientId, ['insurer_baseline_2026', 'hipaa_security_rule']);
  record(db, tenant, clientId, { ...PERFECT, encryption: 'none', tested_backups: 'tested_online' });

  const insurer = assessClient(db, tenant, clientId, 'insurer_baseline_2026');
  const hipaa = assessClient(db, tenant, clientId, 'hipaa_security_rule');

  // HIPAA weights encryption far more heavily and treats it as mandatory.
  assert.ok(hipaa.score < insurer.score);
  assert.equal(hipaa.state, 'not_ready');
  assert.equal(insurer.state, 'conditional');
});

test('history is preserved and only the newest record drives the score', () => {
  const { db, tenant, clientId } = setup();
  record(db, tenant, clientId, { mfa_coverage: 'none' });
  record(db, tenant, clientId, { mfa_coverage: 'admins_only' });
  record(db, tenant, clientId, { mfa_coverage: 'everywhere' });

  const history = tenant.evidenceHistory(clientId, 'mfa_coverage');
  assert.equal(history.length, 3);
  assert.deepEqual(
    history.map((row) => row.status),
    ['pass', 'partial', 'fail'],
  );

  const current = tenant.currentEvidence(clientId).get('mfa_coverage')!;
  assert.equal(current.status, 'pass');
  assert.equal(current.answer_label, 'All staff, on every business system');
});

test('a generated pack freezes the assessment as it was on the day', () => {
  const { db, tenant, clientId } = setup();
  record(db, tenant, clientId, { ...PERFECT, mfa_coverage: 'none' });
  const packId = generatePack(db, tenant, 'Alpha Managed IT', clientId, 'insurer_baseline_2026', 'tester');
  const before = tenant.getPack(packId)!;

  record(db, tenant, clientId, { mfa_coverage: 'everywhere' });
  const live = assessClient(db, tenant, clientId, 'insurer_baseline_2026');

  assert.equal(live.score, 100);
  assert.ok(before.score < 100, 'the stored pack must not move when new evidence lands');
  assert.equal(tenant.getPack(packId)!.score, before.score);
});

test('the rendered pack escapes client-supplied text', () => {
  const { db, tenant } = setup();
  const client = tenant.createClient({ name: '<script>alert(1)</script> Ltd' });
  tenant.setClientProfiles(client.id, ['insurer_baseline_2026']);
  const packId = generatePack(db, tenant, 'Alpha Managed IT', client.id, 'insurer_baseline_2026', 'tester');
  const snapshot = JSON.parse(tenant.getPack(packId)!.snapshot) as PackSnapshot;
  const html = renderEvidencePack(snapshot, 'test-nonce');

  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('the pack renders every control and every gap', () => {
  const { db, tenant, clientId } = setup();
  record(db, tenant, clientId, { ...PERFECT, mfa_coverage: 'admins_only', tested_backups: 'none' });
  const packId = generatePack(db, tenant, 'Alpha Managed IT', clientId, 'insurer_baseline_2026', 'tester');
  const snapshot = JSON.parse(tenant.getPack(packId)!.snapshot) as PackSnapshot;
  const html = renderEvidencePack(snapshot, 'test-nonce');

  for (const control of snapshot.assessment.controls) {
    assert.ok(html.includes(control.title), `pack is missing ${control.title}`);
  }
  assert.ok(html.includes('Alpha Managed IT'));
  assert.ok(html.includes(packId));
});

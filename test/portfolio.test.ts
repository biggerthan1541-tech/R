import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listControls } from '../src/domain/config-loader.ts';
import { evaluateControl } from '../src/domain/evaluate.ts';
import { assessAcrossProfiles, assessClient, diffAssessments } from '../src/domain/readiness.ts';
import type { Db } from '../src/db/connection.ts';
import type { TenantDb } from '../src/db/tenant.ts';
import { testDb, tenantFor } from './helpers.ts';

const ALL = ['insurer_baseline_2026', 'hipaa_security_rule', 'cmmc_level_1', 'soc2_common_criteria'];

function record(db: Db, tenant: TenantDb, clientId: string, answers: Record<string, unknown>) {
  for (const control of listControls(db)) {
    const raw = answers[control.key];
    if (raw === undefined) continue;
    const evaluated = evaluateControl(control, raw);
    tenant.appendEvidence({
      clientId, controlKey: control.key, controlVersion: control.version,
      answerValue: evaluated.answerValue, answerLabel: evaluated.answerLabel, status: evaluated.status,
      gapExplanation: evaluated.gap?.consequence ?? null, remediation: evaluated.gap?.fix ?? null,
      note: null, source: 'manual', recordedBy: 'tester',
    });
  }
}

function setup() {
  const db = testDb();
  const tenant = tenantFor(db, 'alpha', 'Alpha Managed IT');
  const client = tenant.createClient({ name: 'Harbour Dental Group' });
  tenant.setClientProfiles(client.id, ALL);
  return { db, tenant, clientId: client.id };
}

const PERFECT = {
  mfa_coverage: 'everywhere', edr_deployment: 100, tested_backups: 'tested_offline',
  email_security: 'reject', access_offboarding: 'checklist_reviewed',
  patch_management: 'scheduled_reported', incident_response_plan: 'documented_tested',
  security_awareness_training: 'annual_simulated', encryption: 'full',
};

test('every assigned profile is scored, not just the first', () => {
  const { db, tenant, clientId } = setup();
  record(db, tenant, clientId, PERFECT);

  const portfolio = assessAcrossProfiles(db, tenant, clientId, ALL);

  assert.equal(portfolio.profiles.length, 4);
  assert.deepEqual(portfolio.profiles.map((p) => p.score), [100, 100, 100, 100]);
  assert.equal(portfolio.readyEverywhere, true);
  assert.deepEqual(portfolio.blockers, []);
});

test('a gap several standards demand is one job, tagged with all of them', () => {
  const { db, tenant, clientId } = setup();
  record(db, tenant, clientId, { ...PERFECT, mfa_coverage: 'none' });

  const portfolio = assessAcrossProfiles(db, tenant, clientId, ALL);
  const mfa = portfolio.blockers.find((blocker) => blocker.controlKey === 'mfa_coverage');

  assert.ok(mfa, 'MFA must appear as a blocker');
  assert.equal(portfolio.blockers.filter((b) => b.controlKey === 'mfa_coverage').length, 1, 'listed once, not per profile');
  // All four treat MFA as mandatory.
  assert.equal(mfa!.requiredBy.length, 4);
  assert.ok(mfa!.consequence.length > 40);
  assert.ok(mfa!.fix.length > 20);
  assert.equal(portfolio.readyEverywhere, false);
});

test('blockers are ordered by how many standards demand them', () => {
  const { db, tenant, clientId } = setup();
  // MFA is mandatory in all four; email_security is recommended-only everywhere.
  record(db, tenant, clientId, { ...PERFECT, mfa_coverage: 'none', email_security: 'none' });

  const portfolio = assessAcrossProfiles(db, tenant, clientId, ALL);

  assert.equal(portfolio.blockers[0]!.controlKey, 'mfa_coverage');
  assert.ok(
    portfolio.improvements.some((item) => item.controlKey === 'email_security'),
    'a recommended-only gap belongs under improvements, not blockers',
  );
  assert.ok(!portfolio.blockers.some((item) => item.controlKey === 'email_security'));
});

test('a control mandatory in one standard and merely expected in another says so', () => {
  const { db, tenant, clientId } = setup();
  // encryption: mandatory for HIPAA, recommended for the insurer profile.
  record(db, tenant, clientId, { ...PERFECT, encryption: 'none' });

  const portfolio = assessAcrossProfiles(db, tenant, clientId, ['hipaa_security_rule', 'insurer_baseline_2026']);
  const encryption = portfolio.blockers.find((blocker) => blocker.controlKey === 'encryption')!;

  assert.deepEqual(encryption.requiredBy, ['HIPAA Security Rule']);
  assert.deepEqual(encryption.expectedBy, ['Cyber Insurance Baseline Questionnaire']);
});

test('an unanswered control blocks readiness rather than being ignored', () => {
  const { db, tenant, clientId } = setup();
  const portfolio = assessAcrossProfiles(db, tenant, clientId, ALL);

  assert.ok(portfolio.blockers.length > 0);
  assert.equal(portfolio.readyEverywhere, false);
  for (const blocker of portfolio.blockers) {
    assert.equal(blocker.status, 'unknown');
    assert.ok(blocker.fix, 'an unanswered control still needs a next step');
  }
});

test('with no profiles assigned there is nothing to report', () => {
  const { db, tenant, clientId } = setup();
  const portfolio = assessAcrossProfiles(db, tenant, clientId, []);

  assert.deepEqual(portfolio.profiles, []);
  assert.deepEqual(portfolio.blockers, []);
  assert.equal(portfolio.readyEverywhere, false, 'no profiles is not the same as ready');
});

// --------------------------------------------------------------------------
// What changed since last time
// --------------------------------------------------------------------------

test('an improvement, a regression and a first answer are told apart', () => {
  const { db, tenant, clientId } = setup();
  record(db, tenant, clientId, { mfa_coverage: 'admins_only', encryption: 'full' });
  const before = assessClient(db, tenant, clientId, 'insurer_baseline_2026');

  record(db, tenant, clientId, {
    mfa_coverage: 'everywhere',   // partial -> pass
    encryption: 'none',           // pass -> fail
    tested_backups: 'untested',   // unanswered -> fail
  });
  const after = assessClient(db, tenant, clientId, 'insurer_baseline_2026');

  const delta = diffAssessments(before, after, '2026-08-01T00:00:00.000Z');
  const byKey = new Map(delta.changes.map((change) => [change.controlKey, change]));

  assert.equal(byKey.get('mfa_coverage')!.direction, 'improved');
  assert.equal(byKey.get('encryption')!.direction, 'regressed');
  assert.equal(byKey.get('tested_backups')!.direction, 'answered');
  // Regressions surface first: they are the reason to read the section.
  assert.equal(delta.changes[0]!.direction, 'regressed');
});

test('a changed answer at the same status is reported as an update', () => {
  const { db, tenant, clientId } = setup();
  record(db, tenant, clientId, { patch_management: 'scheduled' });
  const before = assessClient(db, tenant, clientId, 'insurer_baseline_2026');

  record(db, tenant, clientId, { patch_management: 'manual' }); // partial -> partial
  const after = assessClient(db, tenant, clientId, 'insurer_baseline_2026');

  const delta = diffAssessments(before, after, '2026-08-01T00:00:00.000Z');
  const change = delta.changes.find((item) => item.controlKey === 'patch_management')!;

  assert.equal(change.direction, 'updated');
  assert.equal(change.fromLabel, 'Automated on a schedule, no reporting');
  assert.equal(change.toLabel, 'Done manually, no schedule');
});

test('nothing changing produces an empty, honest delta', () => {
  const { db, tenant, clientId } = setup();
  record(db, tenant, clientId, PERFECT);
  const assessment = assessClient(db, tenant, clientId, 'insurer_baseline_2026');

  const delta = diffAssessments(assessment, assessment, '2026-08-01T00:00:00.000Z');

  assert.deepEqual(delta.changes, []);
  assert.equal(delta.scoreDelta, 0);
});

test('the score movement is reported alongside the changes', () => {
  const { db, tenant, clientId } = setup();
  record(db, tenant, clientId, { mfa_coverage: 'none' });
  const before = assessClient(db, tenant, clientId, 'insurer_baseline_2026');

  record(db, tenant, clientId, PERFECT);
  const after = assessClient(db, tenant, clientId, 'insurer_baseline_2026');

  const delta = diffAssessments(before, after, '2026-08-01T00:00:00.000Z');

  assert.equal(delta.previousScore, before.score);
  assert.equal(delta.scoreDelta, after.score - before.score);
  assert.ok(delta.scoreDelta > 0);
});

import { randomBytes } from 'node:crypto';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { db as sharedDb, projectRoot, type Db } from './db/connection.ts';
import { ensureMsp } from './db/msps.ts';
import { forTenant, lookupTenantForLogin, type TenantDb } from './db/tenant.ts';
import { backupPath, backupTo, describeBackup, restoreFrom } from './db/backup.ts';
import { hashPassword } from './auth/passwords.ts';
import { loadRoles } from './domain/roles.ts';
import { getControl, listControls, syncConfig } from './domain/config-loader.ts';
import { evaluateControl } from './domain/evaluate.ts';
import { assessClient } from './domain/readiness.ts';
import { generatePack } from './server.ts';

/** Creates the user if the address is free, and reports the password to use. */
async function ensureUser(
  tenant: TenantDb,
  db: Db,
  input: { email: string; name: string; role: string; password?: string },
): Promise<{ email: string; password: string | null }> {
  if (lookupTenantForLogin(db, input.email)) return { email: input.email, password: null };

  const password = input.password ?? randomBytes(12).toString('base64url');
  const user = await tenant.createUser({
    email: input.email,
    name: input.name,
    role: input.role,
    passwordHash: await hashPassword(password),
    createdBy: null,
  });
  void user;
  return { email: input.email, password };
}

async function seed(db: Db): Promise<void> {
  const { controls, profiles } = syncConfig(db);
  const roleCatalogue = loadRoles();
  console.log(
    `Synced ${controls} control definitions, ${profiles} requirement profiles ` +
      `and ${roleCatalogue.roles.length} roles from config/.`,
  );

  const mspId = ensureMsp(db, 'northwind-it', 'Northwind IT Services');
  const tenant = forTenant(db, mspId);
  console.log(`Tenant ready: Northwind IT Services (${mspId})`);

  const accounts = await Promise.all([
    ensureUser(tenant, db, { email: 'owner@northwind.example', name: 'A. Okafor', role: 'owner' }),
    ensureUser(tenant, db, { email: 'tech@northwind.example', name: 'J. Bell', role: 'operator' }),
    ensureUser(tenant, db, { email: 'auditor@northwind.example', name: 'M. Sandhu', role: 'read_only' }),
  ]);

  const created = accounts.filter((account) => account.password !== null);
  if (created.length > 0) {
    console.log('\nSign in with:');
    for (const account of created) console.log(`  ${account.email.padEnd(30)} ${account.password}`);
    console.log('\nThese are shown once. Re-run `npm run reset && npm run seed` to start over.');
  } else {
    console.log('Users already exist — passwords unchanged.');
  }
}

/**
 * Builds a worked example: one client, a dated history showing a control being
 * remediated over time, and a generated pack.
 */
async function demo(db: Db): Promise<void> {
  await seed(db);
  const mspId = ensureMsp(db, 'northwind-it', 'Northwind IT Services');
  const tenant = forTenant(db, mspId);

  const existing = tenant.listClients().find((c) => c.name === 'Harbour Dental Group');
  const client = existing ?? tenant.createClient({
    name: 'Harbour Dental Group',
    industry: 'Healthcare — dental practice',
    employeeCount: 34,
    primaryContact: 'Priya Raman, Practice Manager',
  });

  tenant.setClientProfiles(client.id, ['insurer_baseline_2026', 'hipaa_security_rule']);

  const answers: Record<string, unknown> = {
    mfa_coverage: 'admins_only',
    edr_deployment: 72,
    tested_backups: 'untested',
    email_security: 'spf_only',
    access_offboarding: 'informal',
    patch_management: 'scheduled',
    incident_response_plan: 'none',
    security_awareness_training: 'onboarding_only',
    encryption: 'laptops_only',
  };

  const notes: Record<string, string> = {
    mfa_coverage: 'Owner pushed back on rollout to clinical staff',
    tested_backups: 'Veeam job green nightly, never restored from',
    edr_deployment: '18 of 25 workstations; 7 legacy machines pending replacement',
  };

  for (const control of listControls(db)) {
    const raw = answers[control.key];
    if (raw === undefined) continue;
    const evaluated = evaluateControl(control, raw);
    tenant.appendEvidence({
      clientId: client.id,
      controlKey: control.key,
      controlVersion: control.version,
      answerValue: evaluated.answerValue,
      answerLabel: evaluated.answerLabel,
      status: evaluated.status,
      gapExplanation: evaluated.gap?.consequence ?? null,
      remediation: evaluated.gap?.fix ?? null,
      note: notes[control.key] ?? null,
      source: 'manual',
      recordedBy: 'A. Okafor (Northwind IT)',
    });
  }

  // A second, later record for one control -- this is what makes the evidence
  // store an audit trail rather than a form.
  const mfa = getControl(db, 'mfa_coverage')!;
  const improved = evaluateControl(mfa, 'email_and_remote');
  tenant.appendEvidence({
    clientId: client.id,
    controlKey: mfa.key,
    controlVersion: mfa.version,
    answerValue: improved.answerValue,
    answerLabel: improved.answerLabel,
    status: improved.status,
    gapExplanation: improved.gap?.consequence ?? null,
    remediation: improved.gap?.fix ?? null,
    note: 'Rollout completed across all clinical and admin staff',
    source: 'manual',
    recordedBy: 'A. Okafor (Northwind IT)',
  });

  const assessment = assessClient(db, tenant, client.id, 'insurer_baseline_2026');
  const packId = generatePack(
    db,
    tenant,
    'Northwind IT Services',
    client.id,
    'insurer_baseline_2026',
    'A. Okafor (Northwind IT)',
  );

  console.log(`\nDemo client: ${client.name} (${client.id})`);
  console.log(`Readiness: ${assessment.score}/100 — ${assessment.stateHeadline}`);
  console.log(`Top gaps: ${assessment.gaps.slice(0, 3).map((g) => g.title).join(', ')}`);
  console.log(`Evidence records: ${tenant.evidenceHistory(client.id).length}`);
  console.log(`\nStart the server and open:  http://localhost:3000/packs/${packId}`);
}

/** Writes a .env with a generated signing key so a fresh clone can boot. */
function setup(): void {
  const path = join(projectRoot, '.env');
  if (existsSync(path)) {
    console.log('.env already exists — leaving it alone.');
    return;
  }
  writeFileSync(
    path,
    [
      '# Generated by `npm run setup`. Never commit this file.',
      `SESSION_SECRET=${randomBytes(32).toString('hex')}`,
      'PORT=3000',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  console.log('Wrote .env with a freshly generated SESSION_SECRET.');
}

async function backup(): Promise<void> {
  const dir = process.env.BACKUP_DIR ?? join(projectRoot, 'backups');
  const result = await backupTo(backupPath(dir));
  console.log(`Backed up to ${result.file}`);
  console.log(`  ${describeBackup(result)}`);
  console.log('\nCopy it somewhere else — a backup on the same disk as the database');
  console.log('does not survive losing that disk.');
}

function restore(file: string | undefined): void {
  if (!file) {
    console.error('Usage: npm run restore -- <path-to-backup.db>');
    process.exit(1);
  }
  const { restored, movedAside } = restoreFrom(file);
  console.log(`Restored ${file}`);
  console.log(`  -> ${restored}`);
  if (movedAside) console.log(`  previous database kept at ${movedAside}`);
  console.log('\nStart the app again to pick it up.');
}

function reset(): void {
  for (const suffix of ['', '-shm', '-wal']) {
    rmSync(join(projectRoot, 'data', `readiness.db${suffix}`), { force: true });
  }
  console.log('Database removed. Run `npm run seed` to rebuild it.');
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  await (async () => {
    switch (process.argv[2]) {
      case 'setup':
        setup();
        break;
      case 'seed':
        await seed(sharedDb());
        break;
      case 'demo':
        await demo(sharedDb());
        break;
      case 'backup':
        await backup();
        break;
      case 'restore':
        restore(process.argv[3]);
        break;
      case 'reset':
        reset();
        break;
      default:
        console.error('Usage: tsx src/cli.ts <setup|seed|demo|backup|restore <file>|reset>');
        process.exit(1);
    }
  })();
}

import { createHash } from 'node:crypto';
import type { Db } from './connection.ts';
import { id, nowIso } from './connection.ts';

/** Anchor for each tenant's audit chain. */
const GENESIS_HASH = '0'.repeat(64);

function auditHash(
  prevHash: string,
  entry: {
    id: string;
    mspId: string;
    actorUserId: string | null;
    actorLabel: string;
    action: string;
    subjectType: string | null;
    subjectId: string | null;
    detail: string;
    occurredAt: string;
  },
): string {
  // Field order is fixed and every value is length-prefixed, so no combination
  // of field contents can produce the same digest as a different entry.
  const parts = [
    prevHash,
    entry.id,
    entry.mspId,
    entry.actorUserId ?? '',
    entry.actorLabel,
    entry.action,
    entry.subjectType ?? '',
    entry.subjectId ?? '',
    entry.detail,
    entry.occurredAt,
  ];
  return createHash('sha256').update(parts.map((part) => `${part.length}:${part}`).join('|')).digest('hex');
}

/**
 * Tables that hold customer data and must never be read or written without an
 * msp_id filter. Adding a tenant-scoped table? Add it here too.
 */
const TENANT_SCOPED_TABLES = [
  'clients',
  'client_profiles',
  'evidence_records',
  'evidence_packs',
  'current_evidence',
  'users',
  'sessions',
  'portal_links',
  'audit_log',
] as const;

const SCOPE_FILTER = /msp_id\s*=\s*@msp_id/i;
const INSERT_COLUMN = /\bmsp_id\b/i;
const INSERT_BINDING = /@msp_id\b/i;

/**
 * Second line of defence behind the composite foreign keys in schema.sql.
 *
 * Every statement issued through a TenantDb is checked against the bound
 * @msp_id parameter: reads and mutations must filter on it, inserts must write
 * it. A query that forgets throws at call time instead of quietly returning or
 * creating another MSP's rows. The isolation tests exercise this directly.
 */
export function assertScoped(sql: string): void {
  const stripped = sql.replace(/--[^\n]*/g, '');
  const touchesTenantData = TENANT_SCOPED_TABLES.some((table) =>
    new RegExp(`\\b${table}\\b`, 'i').test(stripped),
  );
  if (!touchesTenantData) return;

  const isInsert = /^\s*INSERT\b/i.test(stripped);
  const scoped = isInsert
    ? INSERT_COLUMN.test(stripped) && INSERT_BINDING.test(stripped)
    : SCOPE_FILTER.test(stripped);

  if (!scoped) {
    throw new Error(
      isInsert
        ? `Refusing to insert into tenant-scoped data without writing the bound @msp_id:\n${sql.trim()}`
        : `Refusing to run a query against tenant-scoped data without an "msp_id = @msp_id" filter:\n${sql.trim()}`,
    );
  }
}

export type ClientRow = {
  id: string;
  msp_id: string;
  name: string;
  industry: string | null;
  employee_count: number | null;
  primary_contact: string | null;
  created_at: string;
  archived_at: string | null;
};

export type EvidenceRow = {
  seq: number;
  id: string;
  msp_id: string;
  client_id: string;
  control_key: string;
  control_version: string;
  answer_value: string;
  answer_label: string;
  status: 'pass' | 'partial' | 'fail';
  gap_explanation: string | null;
  remediation: string | null;
  note: string | null;
  source: string;
  recorded_by: string;
  recorded_at: string;
};

export type PackRow = {
  id: string;
  msp_id: string;
  client_id: string;
  profile_key: string;
  score: number;
  state: string;
  snapshot: string;
  generated_by: string;
  generated_at: string;
};

export type UserRow = {
  id: string;
  msp_id: string;
  email: string;
  name: string;
  role: string;
  password_hash: string;
  status: 'active' | 'disabled';
  created_at: string;
  created_by: string | null;
  last_login_at: string | null;
};

export type SessionRow = {
  token_hash: string;
  id: string;
  msp_id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

export type PortalLinkRow = {
  token_hash: string;
  id: string;
  msp_id: string;
  client_id: string;
  pack_id: string;
  label: string | null;
  created_by: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
};

export type AuditRow = {
  seq: number;
  id: string;
  msp_id: string;
  actor_user_id: string | null;
  actor_label: string;
  action: string;
  subject_type: string | null;
  subject_id: string | null;
  detail: string;
  occurred_at: string;
  prev_hash: string;
  entry_hash: string;
};

export type NewEvidence = {
  clientId: string;
  controlKey: string;
  controlVersion: string;
  answerValue: unknown;
  answerLabel: string;
  status: 'pass' | 'partial' | 'fail';
  gapExplanation: string | null;
  remediation: string | null;
  note: string | null;
  source: string;
  recordedBy: string;
};

/**
 * A handle onto exactly one MSP's data. Callers never supply msp_id -- it is
 * injected from this closure -- so there is no parameter to get wrong.
 */
export class TenantDb {
  readonly mspId: string;
  readonly #db: Db;

  constructor(db: Db, mspId: string) {
    if (!mspId) throw new Error('TenantDb requires an msp id');
    this.#db = db;
    this.mspId = mspId;
  }

  #all<T>(sql: string, params: Record<string, unknown> = {}): T[] {
    assertScoped(sql);
    return this.#db.prepare(sql).all({ ...params, msp_id: this.mspId }) as T[];
  }

  #get<T>(sql: string, params: Record<string, unknown> = {}): T | undefined {
    assertScoped(sql);
    return this.#db.prepare(sql).get({ ...params, msp_id: this.mspId }) as T | undefined;
  }

  #run(sql: string, params: Record<string, unknown> = {}): void {
    assertScoped(sql);
    this.#db.prepare(sql).run({ ...params, msp_id: this.mspId });
  }

  // -- clients --------------------------------------------------------------

  listClients(): ClientRow[] {
    return this.#all<ClientRow>(
      `SELECT * FROM clients WHERE msp_id = @msp_id AND archived_at IS NULL ORDER BY name`,
    );
  }

  getClient(clientId: string): ClientRow | undefined {
    return this.#get<ClientRow>(
      `SELECT * FROM clients WHERE msp_id = @msp_id AND id = @client_id`,
      { client_id: clientId },
    );
  }

  createClient(input: {
    name: string;
    industry?: string | null;
    employeeCount?: number | null;
    primaryContact?: string | null;
  }): ClientRow {
    const clientId = id('cli');
    this.#run(
      `INSERT INTO clients (id, msp_id, name, industry, employee_count, primary_contact, created_at)
       VALUES (@client_id, @msp_id, @name, @industry, @employee_count, @primary_contact, @created_at)`,
      {
        client_id: clientId,
        name: input.name,
        industry: input.industry ?? null,
        employee_count: input.employeeCount ?? null,
        primary_contact: input.primaryContact ?? null,
        created_at: nowIso(),
      },
    );
    return this.getClient(clientId)!;
  }

  // -- requirement profile assignment ---------------------------------------

  listClientProfiles(clientId: string): string[] {
    return this.#all<{ profile_key: string }>(
      `SELECT profile_key FROM client_profiles
        WHERE msp_id = @msp_id AND client_id = @client_id
        ORDER BY position`,
      { client_id: clientId },
    ).map((r) => r.profile_key);
  }

  setClientProfiles(clientId: string, profileKeys: string[]): void {
    const tx = this.#db.transaction(() => {
      this.#run(
        `DELETE FROM client_profiles WHERE msp_id = @msp_id AND client_id = @client_id`,
        { client_id: clientId },
      );
      profileKeys.forEach((key, position) => {
        this.#run(
          `INSERT INTO client_profiles (msp_id, client_id, profile_key, position, assigned_at)
           VALUES (@msp_id, @client_id, @profile_key, @position, @assigned_at)`,
          { client_id: clientId, profile_key: key, position, assigned_at: nowIso() },
        );
      });
    });
    tx();
  }

  // -- evidence (append only) -----------------------------------------------

  /**
   * Appends a new evidence record. There is deliberately no update or delete
   * counterpart: history is the product.
   */
  appendEvidence(input: NewEvidence): string {
    const recordId = id('ev');
    this.#run(
      `INSERT INTO evidence_records
         (id, msp_id, client_id, control_key, control_version, answer_value, answer_label,
          status, gap_explanation, remediation, note, source, recorded_by, recorded_at)
       VALUES
         (@id, @msp_id, @client_id, @control_key, @control_version, @answer_value, @answer_label,
          @status, @gap_explanation, @remediation, @note, @source, @recorded_by, @recorded_at)`,
      {
        id: recordId,
        client_id: input.clientId,
        control_key: input.controlKey,
        control_version: input.controlVersion,
        answer_value: JSON.stringify(input.answerValue ?? null),
        answer_label: input.answerLabel,
        status: input.status,
        gap_explanation: input.gapExplanation,
        remediation: input.remediation,
        note: input.note,
        source: input.source,
        recorded_by: input.recordedBy,
        recorded_at: nowIso(),
      },
    );
    return recordId;
  }

  appendEvidenceBatch(records: NewEvidence[]): number {
    const tx = this.#db.transaction((batch: NewEvidence[]) => {
      for (const record of batch) this.appendEvidence(record);
    });
    tx(records);
    return records.length;
  }

  /** Current state of every control for a client, keyed by control_key. */
  currentEvidence(clientId: string): Map<string, EvidenceRow> {
    const rows = this.#all<EvidenceRow>(
      `SELECT * FROM current_evidence WHERE msp_id = @msp_id AND client_id = @client_id`,
      { client_id: clientId },
    );
    return new Map(rows.map((row) => [row.control_key, row]));
  }

  /** Full dated history for a client, newest first. */
  evidenceHistory(clientId: string, controlKey?: string): EvidenceRow[] {
    if (controlKey) {
      return this.#all<EvidenceRow>(
        `SELECT * FROM evidence_records
          WHERE msp_id = @msp_id AND client_id = @client_id AND control_key = @control_key
          ORDER BY seq DESC`,
        { client_id: clientId, control_key: controlKey },
      );
    }
    return this.#all<EvidenceRow>(
      `SELECT * FROM evidence_records
        WHERE msp_id = @msp_id AND client_id = @client_id
        ORDER BY seq DESC`,
      { client_id: clientId },
    );
  }

  // -- packs ----------------------------------------------------------------

  /** Allocates a pack id up front so the snapshot can embed its own identifier. */
  newPackId(): string {
    return id('pack');
  }

  savePack(input: {
    packId: string;
    clientId: string;
    profileKey: string;
    score: number;
    state: string;
    snapshot: unknown;
    generatedBy: string;
  }): string {
    const packId = input.packId;
    this.#run(
      `INSERT INTO evidence_packs
         (id, msp_id, client_id, profile_key, score, state, snapshot, generated_by, generated_at)
       VALUES
         (@id, @msp_id, @client_id, @profile_key, @score, @state, @snapshot, @generated_by, @generated_at)`,
      {
        id: packId,
        client_id: input.clientId,
        profile_key: input.profileKey,
        score: input.score,
        state: input.state,
        snapshot: JSON.stringify(input.snapshot),
        generated_by: input.generatedBy,
        generated_at: nowIso(),
      },
    );
    return packId;
  }

  getPack(packId: string): PackRow | undefined {
    return this.#get<PackRow>(
      `SELECT * FROM evidence_packs WHERE msp_id = @msp_id AND id = @pack_id`,
      { pack_id: packId },
    );
  }

  listPacks(clientId: string): PackRow[] {
    return this.#all<PackRow>(
      `SELECT id, msp_id, client_id, profile_key, score, state, generated_by, generated_at, '' AS snapshot
         FROM evidence_packs
        WHERE msp_id = @msp_id AND client_id = @client_id
        ORDER BY generated_at DESC`,
      { client_id: clientId },
    );
  }

  // -- users ----------------------------------------------------------------

  listUsers(): UserRow[] {
    return this.#all<UserRow>(
      `SELECT * FROM users WHERE msp_id = @msp_id ORDER BY name`,
    );
  }

  getUser(userId: string): UserRow | undefined {
    return this.#get<UserRow>(`SELECT * FROM users WHERE msp_id = @msp_id AND id = @user_id`, {
      user_id: userId,
    });
  }

  getUserByEmail(email: string): UserRow | undefined {
    return this.#get<UserRow>(
      `SELECT * FROM users WHERE msp_id = @msp_id AND email = @email`,
      { email: email.toLowerCase() },
    );
  }

  createUser(input: {
    email: string;
    name: string;
    role: string;
    passwordHash: string;
    createdBy: string | null;
  }): UserRow {
    const userId = id('usr');
    this.#run(
      `INSERT INTO users (id, msp_id, email, name, role, password_hash, status, created_at, created_by)
       VALUES (@id, @msp_id, @email, @name, @role, @password_hash, 'active', @created_at, @created_by)`,
      {
        id: userId,
        email: input.email.toLowerCase(),
        name: input.name,
        role: input.role,
        password_hash: input.passwordHash,
        created_at: nowIso(),
        created_by: input.createdBy,
      },
    );
    return this.getUser(userId)!;
  }

  setUserRole(userId: string, role: string): void {
    this.#run(`UPDATE users SET role = @role WHERE msp_id = @msp_id AND id = @user_id`, {
      user_id: userId,
      role,
    });
  }

  setUserStatus(userId: string, status: 'active' | 'disabled'): void {
    this.#run(`UPDATE users SET status = @status WHERE msp_id = @msp_id AND id = @user_id`, {
      user_id: userId,
      status,
    });
    if (status === 'disabled') this.revokeUserSessions(userId);
  }

  recordLogin(userId: string): void {
    this.#run(`UPDATE users SET last_login_at = @at WHERE msp_id = @msp_id AND id = @user_id`, {
      user_id: userId,
      at: nowIso(),
    });
  }

  // -- sessions -------------------------------------------------------------

  createSession(input: { userId: string; tokenHash: string; expiresAt: string }): string {
    const sessionId = id('ses');
    const at = nowIso();
    this.#run(
      `INSERT INTO sessions (token_hash, id, msp_id, user_id, created_at, expires_at, last_seen_at)
       VALUES (@token_hash, @id, @msp_id, @user_id, @created_at, @expires_at, @created_at)`,
      {
        token_hash: input.tokenHash,
        id: sessionId,
        user_id: input.userId,
        created_at: at,
        expires_at: input.expiresAt,
      },
    );
    return sessionId;
  }

  /**
   * Sessions and portal links are looked up by the hash of the token in the
   * cookie or URL. The tenant is known before the query because the signed
   * token carries the msp id -- see src/auth/tokens.ts. That keeps every read
   * of these tables scoped, with no unscoped "find by token" anywhere.
   */
  getSessionByHash(tokenHash: string): SessionRow | undefined {
    return this.#get<SessionRow>(
      `SELECT * FROM sessions WHERE msp_id = @msp_id AND token_hash = @token_hash`,
      { token_hash: tokenHash },
    );
  }

  touchSession(tokenHash: string): void {
    this.#run(
      `UPDATE sessions SET last_seen_at = @at WHERE msp_id = @msp_id AND token_hash = @token_hash`,
      { token_hash: tokenHash, at: nowIso() },
    );
  }

  revokeSession(tokenHash: string): void {
    this.#run(
      `UPDATE sessions SET revoked_at = @at
        WHERE msp_id = @msp_id AND token_hash = @token_hash AND revoked_at IS NULL`,
      { token_hash: tokenHash, at: nowIso() },
    );
  }

  revokeUserSessions(userId: string): void {
    this.#run(
      `UPDATE sessions SET revoked_at = @at
        WHERE msp_id = @msp_id AND user_id = @user_id AND revoked_at IS NULL`,
      { user_id: userId, at: nowIso() },
    );
  }

  // -- client portal links --------------------------------------------------

  createPortalLink(input: {
    clientId: string;
    packId: string;
    tokenHash: string;
    label: string | null;
    expiresAt: string;
    createdBy: string;
  }): string {
    const linkId = id('plk');
    this.#run(
      `INSERT INTO portal_links
         (token_hash, id, msp_id, client_id, pack_id, label, created_by, created_at, expires_at)
       VALUES
         (@token_hash, @id, @msp_id, @client_id, @pack_id, @label, @created_by, @created_at, @expires_at)`,
      {
        token_hash: input.tokenHash,
        id: linkId,
        client_id: input.clientId,
        pack_id: input.packId,
        label: input.label,
        created_by: input.createdBy,
        created_at: nowIso(),
        expires_at: input.expiresAt,
      },
    );
    return linkId;
  }

  listPortalLinks(clientId: string): PortalLinkRow[] {
    return this.#all<PortalLinkRow>(
      `SELECT * FROM portal_links
        WHERE msp_id = @msp_id AND client_id = @client_id
        ORDER BY created_at DESC`,
      { client_id: clientId },
    );
  }

  getPortalLinkByHash(tokenHash: string): PortalLinkRow | undefined {
    return this.#get<PortalLinkRow>(
      `SELECT * FROM portal_links WHERE msp_id = @msp_id AND token_hash = @token_hash`,
      { token_hash: tokenHash },
    );
  }

  recordPortalView(tokenHash: string): void {
    this.#run(
      `UPDATE portal_links SET view_count = view_count + 1, last_viewed_at = @at
        WHERE msp_id = @msp_id AND token_hash = @token_hash`,
      { token_hash: tokenHash, at: nowIso() },
    );
  }

  revokePortalLink(linkId: string): void {
    this.#run(
      `UPDATE portal_links SET revoked_at = @at
        WHERE msp_id = @msp_id AND id = @link_id AND revoked_at IS NULL`,
      { link_id: linkId, at: nowIso() },
    );
  }

  // -- audit log (append only, hash chained) --------------------------------

  lastAuditHash(): string {
    const row = this.#get<{ entry_hash: string }>(
      `SELECT entry_hash FROM audit_log WHERE msp_id = @msp_id ORDER BY seq DESC LIMIT 1`,
    );
    return row?.entry_hash ?? GENESIS_HASH;
  }

  appendAudit(input: {
    actorUserId: string | null;
    actorLabel: string;
    action: string;
    subjectType: string | null;
    subjectId: string | null;
    detail: Record<string, unknown>;
  }): string {
    const entryId = id('aud');
    const occurredAt = nowIso();
    const prevHash = this.lastAuditHash();
    const detail = JSON.stringify(input.detail ?? {});
    const entryHash = auditHash(prevHash, {
      id: entryId,
      mspId: this.mspId,
      actorUserId: input.actorUserId,
      actorLabel: input.actorLabel,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      detail,
      occurredAt,
    });

    this.#run(
      `INSERT INTO audit_log
         (id, msp_id, actor_user_id, actor_label, action, subject_type, subject_id,
          detail, occurred_at, prev_hash, entry_hash)
       VALUES
         (@id, @msp_id, @actor_user_id, @actor_label, @action, @subject_type, @subject_id,
          @detail, @occurred_at, @prev_hash, @entry_hash)`,
      {
        id: entryId,
        actor_user_id: input.actorUserId,
        actor_label: input.actorLabel,
        action: input.action,
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        detail,
        occurred_at: occurredAt,
        prev_hash: prevHash,
        entry_hash: entryHash,
      },
    );
    return entryId;
  }

  auditTrail(limit = 200): AuditRow[] {
    return this.#all<AuditRow>(
      `SELECT * FROM audit_log WHERE msp_id = @msp_id ORDER BY seq DESC LIMIT @limit`,
      { limit },
    );
  }

  /**
   * Recomputes the chain. Any edited, removed or reordered entry breaks
   * verification from that point on, which is what makes the log tamper
   * evident rather than merely append only.
   */
  verifyAuditChain(): { ok: true } | { ok: false; brokenAt: number } {
    const rows = this.#all<AuditRow>(
      `SELECT * FROM audit_log WHERE msp_id = @msp_id ORDER BY seq`,
    );
    let previous = GENESIS_HASH;
    for (const row of rows) {
      const expected = auditHash(previous, {
        id: row.id,
        mspId: row.msp_id,
        actorUserId: row.actor_user_id,
        actorLabel: row.actor_label,
        action: row.action,
        subjectType: row.subject_type,
        subjectId: row.subject_id,
        detail: row.detail,
        occurredAt: row.occurred_at,
      });
      if (row.prev_hash !== previous || row.entry_hash !== expected) {
        return { ok: false, brokenAt: row.seq };
      }
      previous = row.entry_hash;
    }
    return { ok: true };
  }
}

/**
 * The one pre-authentication lookup in the codebase.
 *
 * Login is by email alone, so the tenant is unknown until the address is
 * resolved -- there is no msp_id to scope by yet. This is therefore the single
 * deliberate exception to the scoping rule, and it is kept as narrow as
 * possible: it returns an msp id and nothing else. No user row, no password
 * hash, no name. The caller then opens a normal scoped TenantDb and fetches the
 * user through it, so every subsequent read is scoped as usual.
 *
 * It answers exactly one question -- "which tenant owns this address?" -- which
 * the login form already implies by accepting the address at all.
 */
export function lookupTenantForLogin(db: Db, email: string): string | null {
  const row = db
    .prepare(`SELECT msp_id FROM users WHERE email = @email`)
    .get({ email: email.toLowerCase() }) as { msp_id: string } | undefined;
  return row?.msp_id ?? null;
}

/** The only supported way to reach customer data. */
export function forTenant(db: Db, mspId: string): TenantDb {
  return new TenantDb(db, mspId);
}

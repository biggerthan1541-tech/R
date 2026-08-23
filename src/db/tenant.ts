import type { Db } from './connection.ts';
import { id, nowIso } from './connection.ts';

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
}

/** The only supported way to reach customer data. */
export function forTenant(db: Db, mspId: string): TenantDb {
  return new TenantDb(db, mspId);
}

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const DB_PATH = process.env.DB_PATH ?? resolve(process.cwd(), 'data/gap-analysis.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS clients (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  industry       TEXT,
  employee_count INTEGER,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assessments (
  id                    TEXT PRIMARY KEY,
  client_id             TEXT NOT NULL REFERENCES clients(id),
  questionnaire_id      TEXT NOT NULL,
  questionnaire_version TEXT NOT NULL,
  status                TEXT NOT NULL,
  created_by            TEXT NOT NULL,
  started_at            TEXT NOT NULL,
  completed_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_assessments_client ON assessments(client_id, started_at DESC);

-- One row per question answered, per assessment. This is the evidence ledger the
-- later multi-tenant console reads from: every row carries client_id so a
-- cross-client query ("show me every client failing MFA") is a single WHERE.
CREATE TABLE IF NOT EXISTS evidence_records (
  id              TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL REFERENCES clients(id),
  assessment_id   TEXT NOT NULL REFERENCES assessments(id),
  control_id      TEXT NOT NULL,
  control_title   TEXT NOT NULL,
  domain          TEXT NOT NULL,
  severity        TEXT NOT NULL,
  question_id     TEXT NOT NULL,
  question_prompt TEXT NOT NULL,
  answer_value    TEXT,
  answer_label    TEXT,
  status          TEXT NOT NULL,
  gap_text        TEXT,
  fix_text        TEXT,
  note            TEXT,
  source          TEXT NOT NULL,
  recorded_by     TEXT NOT NULL,
  recorded_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_client        ON evidence_records(client_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_assessment    ON evidence_records(assessment_id);
CREATE INDEX IF NOT EXISTS idx_evidence_client_control ON evidence_records(client_id, control_id, recorded_at DESC);

-- Frozen result of an assessment. Kept separately from the live control config so a
-- report issued last quarter still renders as it did when it was issued.
CREATE TABLE IF NOT EXISTS assessment_results (
  assessment_id    TEXT PRIMARY KEY REFERENCES assessments(id),
  client_id        TEXT NOT NULL REFERENCES clients(id),
  readiness_score  INTEGER NOT NULL,
  band             TEXT NOT NULL,
  critical_failures INTEGER NOT NULL,
  snapshot_json    TEXT NOT NULL,
  computed_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_results_client ON assessment_results(client_id);
`);

// Databases created before evidence packs existed predate evidence_records.note.
if (!db.prepare('PRAGMA table_info(evidence_records)').all().some((c) => c.name === 'note')) {
  db.exec('ALTER TABLE evidence_records ADD COLUMN note TEXT');
}

const now = () => new Date().toISOString();

function requireTenant(clientId) {
  if (!clientId || typeof clientId !== 'string') {
    throw new Error('client_id is required — every read and write is tenant-scoped');
  }
  return clientId;
}

// -- clients ---------------------------------------------------------------

export function createClient({ name, industry = null, employeeCount = null }) {
  const id = randomUUID();
  db.prepare(
    'INSERT INTO clients (id, name, industry, employee_count, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, name, industry, employeeCount, now());
  return getClient(id);
}

export function getClient(clientId) {
  return db
    .prepare('SELECT * FROM clients WHERE id = ?')
    .get(requireTenant(clientId));
}

export function listClients() {
  return db
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM assessments a WHERE a.client_id = c.id) AS assessment_count,
              (SELECT r.readiness_score FROM assessment_results r
                 JOIN assessments a2 ON a2.id = r.assessment_id
                WHERE r.client_id = c.id
                ORDER BY a2.started_at DESC LIMIT 1) AS latest_score
         FROM clients c
        ORDER BY c.created_at DESC`,
    )
    .all();
}

// -- assessments -----------------------------------------------------------

export function createAssessment(clientId, { questionnaireId, questionnaireVersion, createdBy }) {
  requireTenant(clientId);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO assessments
       (id, client_id, questionnaire_id, questionnaire_version, status, created_by, started_at)
     VALUES (?, ?, ?, ?, 'in_progress', ?, ?)`,
  ).run(id, clientId, questionnaireId, questionnaireVersion, createdBy, now());
  return id;
}

export function completeAssessment(clientId, assessmentId) {
  db.prepare(
    "UPDATE assessments SET status = 'complete', completed_at = ? WHERE id = ? AND client_id = ?",
  ).run(now(), assessmentId, requireTenant(clientId));
}

export function getAssessment(clientId, assessmentId) {
  return db
    .prepare('SELECT * FROM assessments WHERE id = ? AND client_id = ?')
    .get(assessmentId, requireTenant(clientId));
}

export function listAssessments(clientId) {
  return db
    .prepare(
      `SELECT a.*, r.readiness_score, r.band
         FROM assessments a
         LEFT JOIN assessment_results r ON r.assessment_id = a.id
        WHERE a.client_id = ?
        ORDER BY a.started_at DESC`,
    )
    .all(requireTenant(clientId));
}

// -- evidence --------------------------------------------------------------

export function insertEvidenceRecords(clientId, assessmentId, records, { recordedBy, source }) {
  requireTenant(clientId);
  const stmt = db.prepare(
    `INSERT INTO evidence_records
       (id, client_id, assessment_id, control_id, control_title, domain, severity,
        question_id, question_prompt, answer_value, answer_label, status,
        gap_text, fix_text, note, source, recorded_by, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const at = now();
  db.exec('BEGIN');
  try {
    for (const r of records) {
      stmt.run(
        randomUUID(),
        clientId,
        assessmentId,
        r.controlId,
        r.controlTitle,
        r.domain,
        r.severity,
        r.questionId,
        r.questionPrompt,
        r.answerValue === null || r.answerValue === undefined ? null : String(r.answerValue),
        r.answerLabel ?? null,
        r.status,
        r.gap ?? null,
        r.fix ?? null,
        r.note ?? null,
        source,
        recordedBy,
        at,
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function listEvidence(clientId, assessmentId) {
  return db
    .prepare(
      'SELECT * FROM evidence_records WHERE client_id = ? AND assessment_id = ? ORDER BY rowid',
    )
    .all(requireTenant(clientId), assessmentId);
}

/** Cross-assessment view of one control for one client — the history the console will show. */
export function controlHistory(clientId, controlId) {
  return db
    .prepare(
      `SELECT question_id, status, answer_label, recorded_at, assessment_id
         FROM evidence_records
        WHERE client_id = ? AND control_id = ?
        ORDER BY recorded_at DESC`,
    )
    .all(requireTenant(clientId), controlId);
}

// -- results ---------------------------------------------------------------

export function saveResult(clientId, assessmentId, result) {
  requireTenant(clientId);
  db.prepare(
    `INSERT INTO assessment_results
       (assessment_id, client_id, readiness_score, band, critical_failures, snapshot_json, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(assessment_id) DO UPDATE SET
       readiness_score = excluded.readiness_score,
       band = excluded.band,
       critical_failures = excluded.critical_failures,
       snapshot_json = excluded.snapshot_json,
       computed_at = excluded.computed_at`,
  ).run(
    assessmentId,
    clientId,
    result.score,
    result.band.key,
    result.criticalFailures.length,
    JSON.stringify(result),
    now(),
  );
}

export function getResult(clientId, assessmentId) {
  const row = db
    .prepare('SELECT * FROM assessment_results WHERE assessment_id = ? AND client_id = ?')
    .get(assessmentId, requireTenant(clientId));
  return row ? { ...row, snapshot: JSON.parse(row.snapshot_json) } : null;
}

-- Readiness platform schema.
--
-- Tenant isolation strategy (read this before adding a table):
--
--  1. Every tenant-scoped table carries msp_id NOT NULL.
--  2. Every tenant-scoped table declares UNIQUE (msp_id, id) so that child
--     tables can point at a COMPOSITE key.
--  3. Child tables use composite foreign keys, e.g.
--       FOREIGN KEY (msp_id, client_id) REFERENCES clients (msp_id, id)
--     This makes a cross-tenant row physically unrepresentable: you cannot
--     attach evidence for MSP A's client to MSP B, because no such parent row
--     exists. Isolation therefore does not depend on every query being written
--     correctly -- the database rejects the write.
--  4. Reads go through the scoped repository in src/db/tenant.ts, which also
--     refuses to run SQL that touches a scoped table without an msp_id filter.

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS msps (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id            TEXT NOT NULL,
  msp_id        TEXT NOT NULL,
  name          TEXT NOT NULL,
  industry      TEXT,
  employee_count INTEGER,
  primary_contact TEXT,
  created_at    TEXT NOT NULL,
  archived_at   TEXT,
  PRIMARY KEY (id),
  UNIQUE (msp_id, id),
  UNIQUE (msp_id, name),
  FOREIGN KEY (msp_id) REFERENCES msps (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clients_msp ON clients (msp_id);

-- ---------------------------------------------------------------------------
-- Global reference data (NOT tenant scoped -- these are shared definitions
-- synced from config/. They contain no customer data.)
-- ---------------------------------------------------------------------------

-- Control definitions, synced from config/controls.json.
-- `definition` holds the full JSON incl. answer schema, evaluation rules and
-- plain-language gap copy. `version` is a content hash used to stamp evidence.
CREATE TABLE IF NOT EXISTS controls (
  control_key TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  version     TEXT NOT NULL,
  definition  TEXT NOT NULL,
  synced_at   TEXT NOT NULL
);

-- Requirement profiles (insurer questionnaires, CMMC, HIPAA, SOC 2...),
-- synced from config/profiles/*.json.
CREATE TABLE IF NOT EXISTS requirement_profiles (
  profile_key TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  publisher   TEXT NOT NULL,
  version     TEXT NOT NULL,
  description TEXT NOT NULL,
  definition  TEXT NOT NULL,
  synced_at   TEXT NOT NULL
);

-- One row per control that a profile cares about.
CREATE TABLE IF NOT EXISTS profile_items (
  profile_key TEXT NOT NULL,
  control_key TEXT NOT NULL,
  weight      REAL NOT NULL,
  requirement TEXT NOT NULL CHECK (requirement IN ('mandatory','recommended','optional')),
  note        TEXT,
  PRIMARY KEY (profile_key, control_key),
  FOREIGN KEY (profile_key) REFERENCES requirement_profiles (profile_key) ON DELETE CASCADE,
  FOREIGN KEY (control_key) REFERENCES controls (control_key) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Client <-> profile assignment (tenant scoped)
-- ---------------------------------------------------------------------------

-- `position` fixes the display order. The first profile is the one the console
-- scores against by default, so it cannot be left to a timestamp tie.
CREATE TABLE IF NOT EXISTS client_profiles (
  msp_id      TEXT NOT NULL,
  client_id   TEXT NOT NULL,
  profile_key TEXT NOT NULL,
  position    INTEGER NOT NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (msp_id, client_id, profile_key),
  FOREIGN KEY (msp_id, client_id) REFERENCES clients (msp_id, id) ON DELETE CASCADE,
  FOREIGN KEY (profile_key) REFERENCES requirement_profiles (profile_key) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Evidence store -- APPEND ONLY. This is the audit trail.
-- ---------------------------------------------------------------------------
--
-- There is no UPDATE and no DELETE path for this table anywhere in the app.
-- The "current" state of a control is simply its most recent row.
--
-- status / gap_explanation are SNAPSHOTS evaluated at write time against the
-- control definition version recorded in control_version. That is deliberate:
-- an audit trail must show what we asserted on the day we asserted it, even if
-- the control definition is later edited.

-- seq is the ordering authority. Wall-clock timestamps tie when several records
-- are written in the same millisecond, and ids carry a random suffix, so
-- neither can decide which record is current. AUTOINCREMENT gives a strictly
-- increasing, never-reused insertion sequence -- which is what an append-only
-- log actually needs.
CREATE TABLE IF NOT EXISTS evidence_records (
  seq             INTEGER PRIMARY KEY AUTOINCREMENT,
  id              TEXT NOT NULL UNIQUE,
  msp_id          TEXT NOT NULL,
  client_id       TEXT NOT NULL,
  control_key     TEXT NOT NULL,
  control_version TEXT NOT NULL,
  answer_value    TEXT NOT NULL,           -- JSON-encoded scalar
  answer_label    TEXT NOT NULL,           -- human-readable snapshot
  status          TEXT NOT NULL CHECK (status IN ('pass','partial','fail')),
  gap_explanation TEXT,                    -- plain-language, null when passing
  remediation     TEXT,                    -- plain-language fix, null when passing
  note            TEXT,                    -- free text from whoever recorded it
  source          TEXT NOT NULL,           -- 'manual' today; 'integration:<name>' later
  recorded_by     TEXT NOT NULL,
  recorded_at     TEXT NOT NULL,
  FOREIGN KEY (msp_id, client_id) REFERENCES clients (msp_id, id) ON DELETE CASCADE,
  FOREIGN KEY (control_key) REFERENCES controls (control_key)
);

CREATE INDEX IF NOT EXISTS idx_evidence_current
  ON evidence_records (msp_id, client_id, control_key, seq DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_timeline
  ON evidence_records (msp_id, client_id, seq DESC);

-- Latest evidence row per (msp, client, control).
CREATE VIEW IF NOT EXISTS current_evidence AS
SELECT e.*
FROM evidence_records e
WHERE e.seq = (
  SELECT MAX(e2.seq)
  FROM evidence_records e2
  WHERE e2.msp_id = e.msp_id
    AND e2.client_id = e.client_id
    AND e2.control_key = e.control_key
);

-- ---------------------------------------------------------------------------
-- Generated evidence packs (immutable artifacts)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS evidence_packs (
  id            TEXT NOT NULL PRIMARY KEY,
  msp_id        TEXT NOT NULL,
  client_id     TEXT NOT NULL,
  profile_key   TEXT NOT NULL,
  score         REAL NOT NULL,
  state         TEXT NOT NULL,
  snapshot      TEXT NOT NULL,             -- full computed pack payload as JSON
  generated_by  TEXT NOT NULL,
  generated_at  TEXT NOT NULL,
  FOREIGN KEY (msp_id, client_id) REFERENCES clients (msp_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_packs_client
  ON evidence_packs (msp_id, client_id, generated_at DESC);

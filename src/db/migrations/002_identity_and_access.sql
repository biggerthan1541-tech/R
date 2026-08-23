-- Phase 2: identity, access control, client portal, operator audit log.
--
-- Every table here is tenant scoped and follows the Phase 1 rules: msp_id NOT
-- NULL, UNIQUE (msp_id, id) so children can reference a composite key, and
-- composite foreign keys onto the parent. A user, session, portal link or audit
-- entry belonging to one MSP is unrepresentable under another.

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
--
-- email is globally unique, not per-tenant: an operator belongs to one MSP, and
-- a single login field is the difference between a 30-second sign-in and asking
-- someone to remember which tenant they are on. Login failures are reported
-- identically whether or not the address exists.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT NOT NULL PRIMARY KEY,
  msp_id        TEXT NOT NULL,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL,            -- key from config/roles.json
  password_hash TEXT NOT NULL,            -- scrypt, self-describing (see src/auth/passwords.ts)
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at    TEXT NOT NULL,
  created_by    TEXT,
  last_login_at TEXT,
  UNIQUE (msp_id, id),
  UNIQUE (email),
  FOREIGN KEY (msp_id) REFERENCES msps (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_msp ON users (msp_id, email);

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------
--
-- The primary key is sha256 of the cookie token, never the token itself: a
-- dump of this table cannot be replayed as a set of live logins. The cookie
-- additionally carries an HMAC, so a forged value is rejected before any query.

CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT NOT NULL PRIMARY KEY,
  id           TEXT NOT NULL,
  msp_id       TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at   TEXT,
  UNIQUE (msp_id, id),
  FOREIGN KEY (msp_id, user_id) REFERENCES users (msp_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (msp_id, user_id);

-- ---------------------------------------------------------------------------
-- Client portal links
-- ---------------------------------------------------------------------------
--
-- A read-only, expiring URL handed to an end client so they can see their own
-- evidence pack and nothing else. Same storage discipline as sessions: the
-- token is stored hashed and signed in transit, and revocation is a row update
-- rather than a secret rotation.

CREATE TABLE IF NOT EXISTS portal_links (
  token_hash    TEXT NOT NULL PRIMARY KEY,
  id            TEXT NOT NULL,
  msp_id        TEXT NOT NULL,
  client_id     TEXT NOT NULL,
  pack_id       TEXT NOT NULL,
  label         TEXT,
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT,
  last_viewed_at TEXT,
  view_count    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (msp_id, id),
  FOREIGN KEY (msp_id, client_id) REFERENCES clients (msp_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_portal_client ON portal_links (msp_id, client_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Operator audit log
-- ---------------------------------------------------------------------------
--
-- Who did what, when. Kept separate from evidence_records: that log is what the
-- client's controls looked like, this one is what the operators did. Same
-- append-only discipline, plus a per-tenant hash chain -- each entry commits to
-- the previous one, so removing or editing an entry breaks verification of
-- every entry after it.

CREATE TABLE IF NOT EXISTS audit_log (
  seq           INTEGER PRIMARY KEY AUTOINCREMENT,
  id            TEXT NOT NULL UNIQUE,
  msp_id        TEXT NOT NULL,
  actor_user_id TEXT,                     -- null for system actions
  actor_label   TEXT NOT NULL,
  action        TEXT NOT NULL,            -- e.g. 'client.create', 'auth.login.failed'
  subject_type  TEXT,
  subject_id    TEXT,
  detail        TEXT NOT NULL DEFAULT '{}',
  occurred_at   TEXT NOT NULL,
  prev_hash     TEXT NOT NULL,
  entry_hash    TEXT NOT NULL,
  FOREIGN KEY (msp_id) REFERENCES msps (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_timeline ON audit_log (msp_id, seq DESC);
CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_log (msp_id, subject_type, subject_id, seq DESC);

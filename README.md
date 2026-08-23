# Readiness

A compliance and cyber-insurance-readiness platform for SMBs, sold through the MSP channel.
One MSP logs in and manages every client company's control posture from one place, then hands
each client a dated evidence pack.

The evidence store is the product. Every answer about every control is appended, never
overwritten, so a client's posture has a queryable history rather than a current value.

**Status: Phase 2 complete.** Evidence core and single-client flow (Phase 1), plus real
authentication, data-driven roles, a multi-client roll-up console, a read-only client portal, and
a tamper-evident operator audit log (Phase 2).

---

## Stack

| Choice | Why |
|---|---|
| **Node 22 + TypeScript** (ESM, `tsx`, no build step) | Fast edit-reload loop; strict types where the money is (evaluation and tenant scoping). |
| **Fastify** | Small, fast, and its plugin/hook model is where Phase 2 session auth will slot in with no restructuring. |
| **SQLite** via `better-sqlite3` | A real relational database with real foreign keys — which is what enforces tenant isolation here. Single file, zero ops, and the schema is ordinary SQL that moves to Postgres unchanged if scale demands it. Synchronous API keeps the data layer free of async noise. |
| **Server-rendered HTML** with an auto-escaping template tag | No client build, no framework. The evidence pack is a document, not an app; a print stylesheet turns it into a PDF from the browser. |
| **`node:test`** | Built in. No test-runner dependency. |

Four runtime dependencies in total. Nothing is generated, bundled, or transpiled ahead of time.

---

## Running it

```bash
npm install
npm run setup    # writes .env with a generated SESSION_SECRET
npm run demo     # seeds config + a tenant + three users + a worked example client
npm start        # http://localhost:3000
```

`npm run demo` prints sign-in credentials for three accounts — an owner, an operator and a
read-only auditor — and a link to a generated evidence pack. **The passwords are shown once.**

Other commands:

```bash
npm run seed     # sync config/ into the database, provision the tenant and users
npm run dev      # same as start, with reload on change
npm test         # 85 tests
npm run typecheck
npm run reset    # delete the database file
```

There is no default signing key: if `SESSION_SECRET` is missing the server refuses to start and
tells you to run `npm run setup`.

---

## Verifying Phase 2

> *"As one MSP I manage several clients from a single login with clean isolation."*

1. `npm run setup && npm run demo && npm start`, then open <http://localhost:3000>. You are
   redirected to sign in — there is no unauthenticated surface.
2. **Sign in as the owner** using the credentials `npm run demo` printed. You land on the
   roll-up console: every client, worst first, with score, verdict, coverage and biggest gap.
3. **Onboard a client in one submit** — the *Add a client* form takes the name and the
   requirement profiles together, then drops you straight on the control form. Name plus one
   profile is the minimum; everything else is optional.
4. **Drill in and back out** — open any client, record evidence, generate a pack, return to the
   console and watch the score move.
5. **Check role enforcement.** Sign out, sign in as `auditor@…` (read-only). The *Add a client*
   form, the *Save evidence* button and the profile controls are gone, and the client page says
   the role is read-only. Posting to those routes anyway returns 403, not a silent no-op.
6. **Check the audit log** at `/audit`. Every sign-in, client creation, evidence write and pack
   generation is there, attributed and dated, with the hash chain reported as verified.
7. **Share a pack with a client.** On a client page, issue a portal link. Open it in a private
   window — no login, no operator surface, just that one pack. Revoke it and reload: it is gone.

### Verifying tenant isolation by hand

Provision a second MSP with its own owner, sign in as them, and confirm the console is empty and
the first tenant's client, history, pack and portal URLs all return 404:

```bash
npx tsx -e "
import { db } from './src/db/connection.ts';
import { ensureMsp } from './src/db/msps.ts';
import { forTenant } from './src/db/tenant.ts';
import { hashPassword } from './src/auth/passwords.ts';
const id = ensureMsp(db(), 'rival-msp', 'Rival Managed Services');
forTenant(db(), id).createUser({
  email: 'owner@rival.example', name: 'Rival Owner', role: 'owner',
  passwordHash: await hashPassword('rival-password-12345'), createdBy: null,
});
console.log('rival tenant ready: owner@rival.example / rival-password-12345');
"
```

`test/access.test.ts` proves the same thing automatically, over HTTP, in both directions.

---

## Verifying Phase 1

> *"I can create a client, enter controls, and generate a pack."*

1. `npm run seed && npm start`, then open <http://localhost:3000> and sign in.
2. **Create a client** — fill in the *Add a client* form. You land on the client page.
3. **Assign a requirement profile** — tick *Cyber Insurance Baseline Questionnaire* (and any
   others) and save. Scoring is always relative to a profile; with more than one assigned you
   get tabs to switch between them.
4. **Enter controls** — answer each control and save. Only changed answers are written.
   Re-submitting the same answers reports *"No changes to record"* rather than padding the
   audit trail.
5. **Generate a pack** — hit *Generate evidence pack*. You get a client-facing document with
   the readiness score, a verdict in plain English, the failing controls ordered by how much
   each one costs with that insurer, and the fix for each. *Save as PDF* prints it.
6. **Check the history** — change one control's answer and save, then open the client's
   evidence history. Both records are there, dated and attributed. Nothing was overwritten.
7. **Check the pack is frozen** — reopen the pack you generated before that change. It still
   shows the old position, because a pack is an immutable artifact, not a live view.

---

## Data model

```
msps (tenant)
 ├── users                         operators, with a role from config/roles.json
 │    └── sessions                 token stored hashed, never in the clear
 ├── audit_log                     APPEND ONLY + hash chained — who did what
 └── clients                       msp_id + id, UNIQUE (msp_id, id)
      ├── client_profiles          which obligation sets this client must satisfy
      ├── evidence_records         APPEND ONLY — what the controls looked like
      ├── evidence_packs           immutable generated artifacts
      └── portal_links             expiring read-only links to one pack

controls              ─┐ global reference data, synced from config/,
requirement_profiles  ─┤ contains no customer data
profile_items         ─┘
```

### Migrations

`src/db/migrations/NNN_description.sql`, applied in order and recorded with a checksum. Editing a
migration that has already been applied is rejected — add a new one instead. Migrations run
automatically when the database is opened.

**Evidence records are never updated or deleted.** There is no code path that does. A control's
current state is its highest `seq` row — `seq` is an `AUTOINCREMENT` column rather than a
timestamp, because several records written in the same millisecond would otherwise tie and
leave "current" ambiguous.

Each record snapshots the evaluated `status`, the plain-language `gap_explanation` and
`remediation`, the human-readable `answer_label`, and the `control_version` hash of the
definition used. That is deliberate: an audit trail has to show what you asserted on the day
you asserted it, even after a control definition is later edited.

### How tenant isolation is enforced

Three layers, in order of strength:

1. **Composite foreign keys.** Child tables reference `clients (msp_id, id)`, not `clients (id)`.
   A row belonging to MSP A's client cannot be written under MSP B, because no such parent row
   exists — SQLite refuses the insert. Isolation does not depend on every query being written
   correctly.
2. **A scoped repository.** `src/db/tenant.ts` is the only supported route to customer data.
   Callers get a `TenantDb` bound to one MSP and never pass an `msp_id` — it is injected from
   the closure, so there is no parameter to get wrong.
3. **A SQL guard.** Every statement issued through a `TenantDb` is checked: touch a
   tenant-scoped table without filtering on (or writing) the bound `@msp_id` and it throws at
   call time instead of quietly returning rows.

`test/isolation.test.ts` exercises all three, including a direct attempt by one tenant to write
evidence against another's client. `test/no-raw-sql.test.ts` enforces the structural rule that
makes layer 2 hold: **no database access outside `src/db/`**, and no module other than
`tenant.ts` may query a tenant-scoped table. New code that reaches for a raw handle fails the
build rather than quietly opening a hole.

There is exactly one pre-authentication lookup in the codebase — `lookupTenantForLogin` — because
login is by email alone and the tenant is unknown until the address resolves. It returns an msp id
and nothing else: no user row, no password hash. The caller then opens a normal scoped `TenantDb`.

### Authentication and roles

| Concern | How |
|---|---|
| Passwords | scrypt (`node:crypto`), parameters stored with the hash so cost can be raised later |
| Sessions | 12h, HttpOnly + SameSite cookie; token stored as sha256; fresh token minted on every login (no fixation); revoked server-side on sign-out and when a user is disabled |
| CSRF | signed random token in an HttpOnly cookie, mirrored into a hidden field, compared in constant time |
| Roles | `config/roles.json` — data, not code |
| Client portal | signed expiring URL to exactly one pack; revocable; views counted |
| Audit log | append-only and hash-chained per tenant; `/audit` reports whether the chain verifies |

Failed sign-ins report identical wording whether or not the address exists, and the password check
runs even when no user matched so response time does not leak either.

## Editing roles and permissions

**`config/roles.json`** — three roles ship: owner, operator and read-only. Adding a role or
changing what one can do needs no code change.

```json
{
  "permissions": [{ "key": "evidence:write", "description": "Record a control's state" }],
  "roles": [
    { "key": "operator", "label": "Operator", "description": "...",
      "permissions": ["client:*", "evidence:write", "pack:*", "portal:*", "user:read", "audit:read"] }
  ]
}
```

Grants are exact (`evidence:write`), a group wildcard (`client:*`), or everything (`*`). A grant
matching no declared permission fails at startup rather than silently removing access.

---

## Editing control definitions

**`config/controls.json`** — nine controls ship by default (MFA, endpoint protection, tested
backups, email spoofing protection, access/offboarding, patching, incident response,
security awareness training, encryption).

Pass/fail logic is data, not code. Nothing in `src/` knows what MFA is:

```json
{
  "key": "edr_deployment",
  "title": "Endpoint protection coverage",
  "category": "Devices",
  "question": "What percentage of laptops, desktops and servers run managed endpoint protection?",
  "answer": { "type": "percent" },
  "rules": [
    { "when": { "op": "gte", "value": 98 }, "status": "pass" },
    { "when": { "op": "gte", "value": 80 }, "status": "partial" },
    { "when": { "op": "always" }, "status": "fail" }
  ],
  "gap": {
    "fail":    { "consequence": "...", "fix": "..." },
    "partial": { "consequence": "...", "fix": "..." }
  }
}
```

- `answer.type` — `enum` (with `options`), `percent`, `number`, or `boolean`.
- `rules` — evaluated in order, first match wins. Must end with `{ "op": "always" }`.
- Operators — `eq`, `neq`, `in`, `not_in`, `gte`, `gt`, `lte`, `lt`, `always`.
- `gap` — the plain-language copy that reaches the business owner. Write the **business
  consequence**, not the technical mechanism: what it costs them, and what an insurer or
  auditor does about it. Every non-passing status a control's rules can reach needs copy, and
  config loading refuses to start without it.

Run `npm run seed` after editing. A changed definition gets a new version hash; existing
evidence keeps the hash it was recorded under.

## Editing requirement profiles

**`config/profiles/*.json`** — one file per obligation set. Four ship: a composite cyber
insurance questionnaire, CMMC Level 1, the HIPAA Security Rule, and SOC 2 Common Criteria.
Add a file, run `npm run seed`, and it appears in the UI. No code changes.

```json
{
  "key": "insurer_baseline_2026",
  "name": "Cyber Insurance Baseline Questionnaire",
  "publisher": "Composite carrier baseline",
  "version": "2026.1",
  "description": "...",
  "items": [
    { "control": "mfa_coverage", "weight": 30, "requirement": "mandatory", "note": "Universally treated as a precondition to quote." },
    { "control": "patch_management", "weight": 10, "requirement": "recommended" }
  ]
}
```

- `weight` — relative pull on the score. Weights are normalised, so they need not sum to 100.
- `requirement` — `mandatory`, `recommended`, or `optional`. **Mandatory is a gate, not a
  weight:** any mandatory control failing or unanswered forces *Not ready* however high the
  score. This models how underwriting actually works — some answers are disqualifying, others
  are pricing.
- `note` — carried through to the evidence pack next to that control.

The same evidence scored against two profiles gives two different answers, which is the point:
HIPAA weights encryption heavily and treats it as mandatory, while an insurer barely asks.

### Scoring

`score = Σ(weight × points) / Σ(weight) × 100`, where `pass = 1`, `partial = 0.5`,
`fail` and unanswered = `0`.

| Verdict | Condition |
|---|---|
| **Not ready** | Any mandatory control failing or unanswered |
| **Ready with conditions** | No mandatory failures, but a mandatory control is partial, or score < 85 |
| **Ready** | Every mandatory control fully in place and score ≥ 85 |

Gaps in the pack are ordered mandatory-first, then by how much score each one forfeits.

---

## Layout

```
config/
  controls.json              control definitions + pass/fail rules + gap copy
  profiles/*.json            requirement profiles
  roles.json                 roles → permissions
src/
  config/env.ts              required configuration, validated at startup
  db/
    migrations/*.sql         versioned schema, applied in order
    migrate.ts               migration runner
    connection.ts            open + migrate
    msps.ts                  tenant provisioning
    reference.ts             global reference-data queries
    tenant.ts                THE isolation boundary — scoped repository + SQL guard
  auth/
    passwords.ts             scrypt hashing
    tokens.ts                signed, tenant-bearing session and portal tokens
    session.ts               sign in/out, actor resolution, permission checks
  http/
    cookies.ts               parsing, serialisation, HMAC signing
    security.ts              CSP + headers + CSRF
    validation.ts            HTTP-boundary input validation
  domain/
    types.ts
    evaluate.ts              the data-driven rule evaluator (knows nothing about security)
    config-loader.ts         load and validate config/, sync into the database
    readiness.ts             weighted scoring, verdicts, gap prioritisation
    roles.ts                 the data-driven permission engine
  render/
    html.ts                  auto-escaping template tag
    layout.ts                operator UI chrome
    views.ts                 console, client page, history
    auth-views.ts            sign-in, people, audit, portal links
    evidence-pack.ts         the client-facing document
  server.ts                  routes
  cli.ts                     setup / seed / demo / reset
test/                        isolation, migrations, no-raw-sql, security,
                             access (negative), portal, audit, evaluation,
                             scoring, rendering
```

---

## Deliberately not built yet

Phase 3 — per-MSP white-label branding and scheduled generation. Phase 4 — wholesale billing
records and invoice export.

Also out of scope by instruction: live integrations with identity/EDR/backup systems (manual
entry only), payment processing, and any mobile app.

### Known edges

- **No password reset or invitation email.** An owner sets a temporary password directly. Email
  delivery is a dependency and a deliverability problem; it is worth doing properly rather than
  half-doing here.
- **No rate limiting on sign-in.** Failed attempts are audited, but not throttled. This wants to
  be per-address and per-IP, and belongs with a deployment story (Phase 4) rather than in-process
  counters that reset on restart.
- **Sessions do not roll.** A session lasts 12 hours from sign-in and is not extended by activity.
- **The evidence pack is HTML.** *Save as PDF* prints it via the browser. If packs need to be
  generated server-side on a schedule (Phase 3), that becomes a headless-Chromium render step.
- **Onboarding friction that remains.** Creating a client and assigning profiles is one submit,
  but recording nine controls is still nine decisions. The obvious next win is a per-industry
  answer template that pre-fills the common baseline — that is Phase 3/4 territory, not something
  to bolt on here.

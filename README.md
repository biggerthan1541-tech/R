# Readiness

A compliance and cyber-insurance-readiness platform for SMBs, sold through the MSP channel.
One MSP logs in and manages every client company's control posture from one place, then hands
each client a dated evidence pack.

The evidence store is the product. Every answer about every control is appended, never
overwritten, so a client's posture has a queryable history rather than a current value.

**Status: Phase 1 complete.** Evidence core, manual data entry, profile-based evaluation, and
per-client evidence packs. Multi-tenancy is built into the data model and enforced at the
data-access layer from day one, but there is no login yet — that is Phase 2.

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
npm run demo     # seeds config + one tenant + a worked example client
npm start        # http://localhost:3000
```

Other commands:

```bash
npm run seed     # sync config/ into the database and provision the demo tenant
npm run dev      # same as start, with reload on change
npm test         # 31 tests
npm run typecheck
npm run reset    # delete the database file
```

`npm run demo` prints a direct link to a generated evidence pack.

---

## Verifying Phase 1

> *"I can create a client, enter controls, and generate a pack."*

1. `npm run seed && npm start`, then open <http://localhost:3000>.
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

### Verifying tenant isolation by hand

```bash
npx tsx -e "import {db} from './src/db/connection.ts'; import {ensureMsp} from './src/db/msps.ts'; ensureMsp(db(),'rival-msp','Rival Managed Services')"
ACTIVE_MSP_SLUG=rival-msp npm start
```

Acting as the second MSP, the client list is empty, and pasting the first MSP's client, history
or pack URL returns 404 — not a redirect, and not someone else's data.

---

## Data model

```
msps (tenant)
 └── clients                       msp_id + id, UNIQUE (msp_id, id)
      ├── client_profiles          which obligation sets this client must satisfy
      ├── evidence_records         APPEND ONLY — the audit trail
      └── evidence_packs           immutable generated artifacts

controls              ─┐ global reference data, synced from config/,
requirement_profiles  ─┤ contains no customer data
profile_items         ─┘
```

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
evidence against another's client.

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
src/
  db/
    schema.sql               tables, composite FKs, the append-only evidence log
    connection.ts            open + apply schema
    msps.ts                  tenant provisioning
    tenant.ts                THE isolation boundary — scoped repository + SQL guard
  domain/
    types.ts
    evaluate.ts              the data-driven rule evaluator (knows nothing about security)
    config-loader.ts         load, validate and sync config/ into the database
    readiness.ts             weighted scoring, verdicts, gap prioritisation
  render/
    html.ts                  auto-escaping template tag
    layout.ts                operator UI chrome
    views.ts                 operator UI pages
    evidence-pack.ts         the client-facing document
  server.ts                  routes
  cli.ts                     seed / demo / reset
test/                        isolation, evaluation, scoring, rendering
```

---

## Deliberately not built yet

Phase 2 — MSP login and the multi-client roll-up console. Phase 3 — per-MSP white-label
branding and scheduled generation. Phase 4 — wholesale billing records and invoice export.

Also out of scope by instruction: live integrations with identity/EDR/backup systems (manual
entry only), payment processing, and any mobile app.

### Known Phase 1 edges

- **No login.** The acting MSP comes from `ACTIVE_MSP_SLUG` or the first tenant on file.
  Phase 2 replaces one function (`activeMsp` in `src/server.ts`); nothing else changes, because
  every read and write already goes through a `TenantDb` scoped to whatever it returns.
- **No schema migrations.** The schema is applied with `CREATE TABLE IF NOT EXISTS`, so a
  column added to `schema.sql` will not reach an existing database. Pre-release, `npm run reset`
  is the answer; a migration step is worth adding before real data exists.
- **The evidence pack is HTML.** *Save as PDF* prints it via the browser. If packs need to be
  generated server-side on a schedule (Phase 3), that becomes a headless-Chromium render step.

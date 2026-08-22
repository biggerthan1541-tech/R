# Cyber Insurance Readiness Toolkit

Two things sharing one set of control definitions:

1. **The pack CLI** (`bin/pack.js`) — the pilot tool. You fill in one file per client
   and it produces a branded, client-ready evidence pack as HTML and PDF. This is
   manual labour by design: it makes *you* fast, it does not pretend to be a product.
2. **The questionnaire web app** (`src/server.js`) — the earlier MVP. Same controls,
   same scoring, same report renderer, but answers are typed into a browser form.

Both write to the same evidence ledger, so packs you produce by hand during the pilot
accumulate as history from day one.

---

## Producing a pack

```bash
npm install

npm run pack -- new "Acme Joinery Ltd"          # writes clients/acme-joinery-ltd.yaml
$EDITOR clients/acme-joinery-ltd.yaml           # fill it in
npm run pack -- build clients/acme-joinery-ltd.yaml
```

That last command validates the file, scores it, writes a dated record, and renders
`pack.html` + `pack.pdf` into `packs/<client>/<date>-<id>/`.

The scaffold from `pack new` is the reason this is quick. Every question is written out
with its valid values **and the outcome each one produces**, so you can fill it in
straight from your notes without looking anything up:

```yaml
  # Is multi-factor authentication required for every employee email account?
  #   Microsoft 365, Google Workspace, or whatever hosts your staff mailboxes.
  #   all          Yes — enforced for every user, no exceptions  [PASS]
  #   most         Enforced for most users, a few are exempt  [PARTIAL]
  #   admins_only  Only for administrators / leadership  [FAIL]
  #   optional     Available, but users choose whether to turn it on  [FAIL]
  #   none         No  [FAIL]
  mfa.email: most
```

Leave an answer blank if the client genuinely does not know. The pack reports it as
"not answered", which is its own finding — an incomplete questionnaire is a reason a
carrier holds a quote.

### Commands

| Command | What it does |
|---|---|
| `npm run pack -- new <name>` | Scaffold a client file. `--msp <brand>`, `--out <file>`, `--force` |
| `npm run pack -- check <file>` | Validate and score without writing anything |
| `npm run pack -- build <file>` | Validate, store a dated record, render HTML + PDF. `--no-pdf` |
| `npm run pack -- list [slug]` | Every pack produced so far, newest first |
| `npm run pack -- brands` | Available MSP brand configs |

`check` before `build` when you are unsure — it prints the score and any blocking
controls without touching the ledger.

### Worked example

`clients/harlow-and-vine-logistics-ltd.yaml` is a scaffold filled in for a 68-person
freight firm, and `packs/harlow-and-vine-logistics-ltd/` holds the pack it produced.
Rebuild it any time with:

```bash
npm run pack -- build clients/harlow-and-vine-logistics-ltd.yaml
```

It scores 60/100 and lands in "Not yet insurable" — good hygiene throughout, but
backups have never been restore-tested, and that alone blocks cover. It exercises every
feature: observation notes, a hand-tuned fix, an assessor's summary, and a critical
failure driving the verdict.

### Validation

The validator is strict on purpose — a typo that silently became a wrong pass/fail
would go in front of an MSP's customer:

```
error    acme.yaml has 3 problems:
  - engagement.msp "northgat" is not a known brand — did you mean "northgate"? (available: meridian, northgate)
  - answers.mfa.email = "mostly" is not a valid option — did you mean "most"?
      valid values: all, most, admins_only, optional, none
  - notes.backup.restor_test is not a question id — did you mean "backup.restore_test"?
```

### PDF output

`build` shells out to headless Chrome. It looks at `CHROME_PATH`, then Playwright's
browser cache, then the usual install locations. If it finds nothing you still get
`pack.html` — open it and print to PDF, which is two clicks and looks identical.

---

## The client file

Only `client.name` and `engagement.msp` are required. Everything else is optional and
omitted from the pack when absent.

```yaml
client:
  name: Harlow & Vine Logistics Ltd
  industry: Freight & warehousing
  employees: 68
  contact: "Dawn Whitmore, Operations Director"

engagement:
  msp: northgate              # which brand config to render under
  assessedOn: 2026-08-18
  assessedBy: Jordan Vale
  method: "On-site review + walkthrough of M365, Datto and Veeam consoles"
  policyRenewal: 2026-11-01
  broker: Kelmore Risk Partners

summary: >-                   # your words, printed near the top of the pack
  Harlow & Vine run a tidier estate than most businesses of their size…

answers:
  mfa.email: most
  # …

notes:                        # what you actually saw — keyed by question id
  mfa.email: >-
    Entra ID Conditional Access reviewed 18 Aug. Four shared mailboxes excluded,
    including accounts@ which receives supplier invoices.

overrides:                    # replace the standard wording for this client only
  backup.restore_test:
    fix: "Veeam is already licensed for this — book the restore test with Priya."
```

**`notes` is what turns a self-assessment into an evidence pack.** It prints under the
relevant finding as an "Observed" line and against the question in the detail table, so
the client sees what was checked rather than just what they claimed. `overrides` lets
you swap the generic fix for one naming their actual tools and people — usually worth
doing for the top two or three findings.

JSON works too; `build` picks the parser from the file extension.

---

## Brands

One YAML file per MSP in `config/brands/`. Add an MSP by copying an existing one:

```yaml
companyName: Northgate Managed IT
tagline: Cyber insurance readiness assessment
accentColor: "#1f4ed8"
logo: ./logos/northgate.svg     # relative to this file; SVG, PNG, JPG or WebP
contact:
  email: security@northgate-it.example
  phone: "+44 20 7946 0100"
  website: northgate-it.example
reportFooter: >-
  Prepared by {companyName} for the named client…
```

The logo is inlined as a data URI at render time, so a generated pack is a single
portable file — it survives being emailed on without breaking. When a logo is present
it replaces the company name in the header rather than sitting next to it, since a
wordmark plus the same name set in type is the classic white-label tell.

The web app renders under `northgate` by default; `BRAND=meridian npm start` switches it.

---

## Evidence history

Each build writes to two places, deliberately:

- **`packs/<client>/<date>-<id>/record.json`** — the durable record. Human-readable,
  diffable, commit it to git. Holds the inputs, the full evaluation, the brand, and the
  questionnaire version. `pack list` reads these, so history survives `npm run reset`.
- **The SQLite ledger** (`data/gap-analysis.db`) — the same run as `evidence_records`
  with `source: 'evidence_pack'`, alongside questionnaire runs from the web app. This
  is the queryable side: `client_id` is on every row, indexed on
  `(client_id, control_id, recorded_at)`, so "every client failing MFA" is one `WHERE`
  when the console gets built.

The files are the source of truth for history; the database is the query layer you can
rebuild from them.

---

## Editing the control definitions

**`config/controls.js` is the single source of truth** — for the CLI, the web app, and
the scaffold generator. Nothing under `src/` or `bin/` knows that MFA or backups exist,
so swapping in a real insurer questionnaire means editing that file and re-running
`pack new`; the template regenerates itself from whatever is there.

The file's header comment documents the schema. Each control:

```js
{
  id: 'MFA_COVERAGE',          // stable key — evidence records are keyed on it
  domain: 'Identity & Access',
  title: 'Multi-factor authentication',
  weight: 20,                  // share of the 100-point score; weights sum to 100
  severity: 'critical',        // a failing 'critical' control caps the verdict
  insurerContext: 'Why carriers ask…',
  questions: [ /* … */ ],
}
```

Each question carries its own rule and its own copy:

```js
{
  id: 'mfa.email',
  type: 'choice',                                   // or 'number'
  options: [{ value: 'all', label: 'Yes — every user' }, /* … */],
  evaluation: { pass: ['all'], partial: ['most'] }, // anything else fails
  outcomes: {
    partial: { gap: 'consequence in plain English', fix: 'what to do' },
    fail:    { gap: '…', fix: '…' },
  },
}
```

Numeric questions use comparators: `evaluation: { pass: { gte: 98 }, partial: { gte: 90 } }`
(also `gt`, `lte`, `lt`, `eq`).

Two rules worth knowing when you edit:

- A control's status is the **worst** status among its questions, but its **score** is
  the average — one failing question marks the control failed without zeroing the
  partial credit earned elsewhere in it.
- An unanswered question is `unknown`, not `fail`. It scores zero but reports
  separately.

Bump `QUESTIONNAIRE.version` when you change anything. Every record stores the version
it was assessed against, and packs render from a frozen snapshot, so a pack you handed
over last quarter keeps rendering as it was issued.

### Writing the gap and fix copy

This copy is the product. Write for a business owner with no security background: state
the **consequence** — what it costs them, what an insurer does about it — never the
mechanism. The DMARC gap reads "criminals email your customers a real-looking invoice
with their own bank details; your customers lose money, and they come to you about it",
with no mention of SPF alignment.

---

## Scoring

Each control contributes `weight × (average question factor)` where pass = 1,
partial = 0.5, fail and unknown = 0, normalised to 100:

| Band | Condition |
|---|---|
| Insurance ready | ≥ 85 and no failing critical control |
| Insurable with conditions | ≥ 65 and no failing critical control |
| Not yet insurable | < 65, **or** any critical control failing at any score |

The critical override is deliberate: a business can score well and still be uninsurable
because one precondition is missing. The worked example is exactly that.

The weightings and thresholds are a judgement call, not sourced from an underwriter —
they are one edit away in the config and worth calibrating against a real questionnaire.

---

## The web app

The original questionnaire MVP, still working and sharing everything:

```bash
npm start        # http://localhost:3000
npm run dev      # with --watch
npm run sample   # regenerate samples/sample-gap-report.html
npm run reset    # delete the database
```

Add a client, answer the questionnaire in the browser, get the same report without the
cover page or evidence notes. Useful for handing an MSP something to click through; the
CLI is what you use to produce actual deliverables.

---

## Deliberately not built

No integrations (you enter the data), no auth (`src/auth.js` is a stub returning a
fixed operator), no billing, no theming engine beyond the brand configs, no automation
of data collection, and no multi-client console — though the ledger is already shaped
for one.

---

## Layout

```
bin/pack.js            ← the CLI
config/
  controls.js          ← the questionnaire, rules, and plain-language copy (edit this)
  brands/*.yaml        ← one per MSP, plus logos/
src/
  brands.js            ← brand loading, logo inlining
  evaluate.js          ← pure scoring engine, knows nothing about specific controls
  db.js                ← schema and tenant-scoped queries
  server.js, auth.js   ← the web app
  views/               ← HTML rendering, shared by app and CLI
  pack/
    input.js           ← client file loading and validation
    scaffold.js        ← generates the fill-in template from the controls
    render.js          ← HTML + PDF output
    store.js           ← dated records on disk, evidence rows in the ledger
clients/               ← your client input files
packs/                 ← generated packs, one dated directory per build
samples/               ← the web app's sample report
```

Node 22.5+ (for the built-in `node:sqlite`). Two dependencies: `express` and `yaml`.

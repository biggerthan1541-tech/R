# Lapse

A living register for security exceptions, risk acceptances and temporary access
grants — the ones that **expire**, **nag their owner**, and **export auditor-ready
evidence**.

Built for the Head of Security / GRC lead / vCISO at a 150–800-person SOC 2 or
ISO 27001 company who tracks this in a spreadsheet today. The spreadsheet is the
competitor. Lapse beats it on the three things a spreadsheet cannot do: it knows
what has expired, it chases the owner without you, and it prints evidence.

---

## What it does

| | |
|---|---|
| **Register** | Every exception with a title, type, business justification, compensating control, risk level, named risk owner, named approver, framework tags, evidence link — and a **required** expiry date. |
| **Two pinned callouts** | *Expired but still open* (red, urgent — the number an auditor reads first) and *Expiring in ≤14 days*. |
| **Derived status** | `open · expiring · expired · renewed · closed` is computed from `expiry_date` + `closed_at` on **every read**, so the register is never stale between cron runs. |
| **Lifecycle actions** | Renew, Extend, Close, Reopen — each requires a written reason, each writes an append-only event. |
| **Auto-nag** | A daily job emails (Resend) and optionally Slacks the risk owner and approver at configurable lead times (default 14 / 7 / 1 days), on the expiry day, and **weekly after that** while the exception stays open. Every reminder is logged as an event. |
| **Auditor export** | One click → a typeset **PDF** and a **CSV**, both carrying owner, approver, compensating control, expiry, current status and the full event history. |
| **CSV import** | Upload the spreadsheet you keep today, map the columns (Lapse guesses), preview the parse, then import. A template CSV is downloadable. |
| **Multi-tenant** | A workspace per client org. `workspace_id` on every row; every page and route resolves the workspace through a single membership-checked gate. |
| **Self-serve onboarding** | Magic-link sign-in, create a workspace, invite teammates by email as owner / admin / approver / member. An invitation lands whether the person follows the emailed link or simply signs in with the invited address. |
| **Separation of duties** | Whoever logs an exception can never sign off on it. Renew, extend, close and reopen require an approver or admin who is not the author — enforced server-side, on every action. |
| **Actionable reminders** | Every nag carries a per-recipient link that signs the recipient in, joins them to the workspace at the right role, and lands them on that exception — even if they have never used Lapse. |

### Deliberately out of scope

No auto-discovery from firewalls/IAM/scanners. No policy management, no
control-mapping engine, no GRC suite. No AI features, no mobile app, no SSO, no
billing.

---

## Stack

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind v4**
- **Postgres** (Neon or Supabase) via **Drizzle ORM**
- **Auth.js v5** — email magic link only
- **Resend** for email, **Slack incoming webhook** for Slack
- **Vercel Cron** for the daily expiry sweep
- **pdfkit** for the auditor PDF (Archivo embedded)
- **Vitest** for tests

---

## Deploying

See **[DEPLOY.md](DEPLOY.md)** for the full runbook — Neon, Resend, Vercel env
vars, migrations, seeding, confirming the cron, and a smoke-test checklist.

```bash
npm run check-env    # verifies every required variable before you find out at 08:00
```

---

## Quick start

```bash
npm install
cp .env.example .env.local        # then fill in AUTH_SECRET at minimum

# Option A — zero-setup local Postgres (PGlite over a real wire protocol).
# Leave this running in its own terminal.
npm run db:local

# Option B — point DATABASE_URL at a Neon/Supabase branch instead.

npm run db:migrate                # apply migrations
npm run db:seed                   # ~11 realistic sample exceptions
npm run dev                       # http://localhost:3000
```

Sign in with the address you seeded (`you@example.com` by default, or set
`SEED_EMAIL`). With `DRY_RUN_NOTIFICATIONS=1` the magic link is **printed to the
terminal running `npm run dev`** instead of emailed — no Resend account needed to
try it locally.

### Local database

`npm run db:local` runs [PGlite](https://pglite.dev) — Postgres compiled to
WebAssembly — behind a real Postgres wire-protocol socket on `127.0.0.1:5432`,
with data in `./.pglite`. The app, `drizzle-kit`, the seed script and the test
suite all reach it through an ordinary `DATABASE_URL` and are completely unaware
it isn't Neon. No Docker, no local Postgres install.

```
LOCAL_DB_PORT=5432                # override the port
LOCAL_DB_DIR=./.pglite            # override the data directory
LOCAL_DB_MAX_CONNECTIONS=20       # the server multiplexes PGlite's single connection
```

---

## Environment variables

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. Use the **pooled** URL on Neon/Supabase. |
| `AUTH_SECRET` | yes | Auth.js signing secret — `openssl rand -base64 32`. |
| `AUTH_URL` | prod | Canonical app URL, e.g. `https://lapse.example.com`. Used for magic links and the links inside nag emails. |
| `AUTH_RESEND_KEY` | prod | Resend API key. Sends both magic links and nags. |
| `RESEND_FROM` | prod | Verified sender, e.g. `Lapse <lapse@yourdomain.com>`. |
| `SLACK_WEBHOOK_URL` | no | Fallback webhook; each workspace can set its own in Settings. |
| `CRON_SECRET` | yes | Shared secret the daily cron endpoint requires. |
| `DRY_RUN_NOTIFICATIONS` | no | `1` prints emails/Slack messages to the console instead of sending. Implied whenever `AUTH_RESEND_KEY` is unset. |
| `SEED_EMAIL` | no | Account the seed script grants the demo workspace to. |
| `NEXT_PUBLIC_APP_REGION` | prod | Hosting region stated on `/security`. |
| `NEXT_PUBLIC_DB_REGION` | prod | Database region stated on `/security`. |
| `NEXT_PUBLIC_SECURITY_CONTACT` | prod | Address for deletion and vulnerability reports on `/security`. |

`npm run check-env` validates all of the above and exits non-zero on a problem.

---

## The daily cron

`GET /api/cron/daily` does two things for every active exception:

1. **Syncs stored status** (`open → expiring → expired`) and writes a
   `status_changed` event. Reads never depend on this having run — status is
   derived live — but it keeps the stored column and the history honest.
2. **Sends the reminders that fell due today**, then logs a `nag_sent` event.

It is authenticated with `Authorization: Bearer $CRON_SECRET`, which is exactly
what Vercel Cron sends when `CRON_SECRET` is set as a project env var. The
schedule lives in `vercel.json` (08:00 UTC daily).

### Running it locally

```bash
npm run cron:local                 # sweep as of today, no server needed
npm run cron:local -- 2026-12-01   # sweep as if it were that date — the fast way
                                   # to watch an exception expire and nag
```

Or hit the endpoint against a running dev server:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily
```

The sweep is **idempotent**. Each `(exception, milestone)` pair is claimed in
`nag_log` before any message is sent, so a re-run — or two runs in one day —
cannot double-nag an owner. A missed week collapses into one message at the most
urgent milestone rather than three separate emails. Moving an expiry date
(renew / extend / reopen) clears the log and re-arms every milestone.

---

## Deploying to Vercel

1. Push the repo and import it into Vercel.
2. Set every variable from the table above in Project → Settings → Environment
   Variables. `CRON_SECRET` is what protects the cron route.
3. Point `DATABASE_URL` at your Neon/Supabase **pooled** connection string.
4. Run `npm run db:migrate` against the production database once.
5. `vercel.json` already registers the daily cron — no extra configuration.

The PDF route pins the Node.js runtime and ships the embedded Archivo font files
via `outputFileTracingIncludes` in `next.config.ts`.

---

## Tests

```bash
npm test          # unit suite
npm run typecheck
```

CI runs `tsc --noEmit`, the full suite and a production build on every pull
request (`.github/workflows/ci.yml`). It starts PGlite as its database, so the
integration tests run in CI too rather than skipping — no service container and
no secrets required.

151 tests covering the parts where a bug is expensive: date arithmetic across
DST and leap years, status derivation at every boundary, the nag state machine
(milestones, backlog collapse, idempotency, overdue re-nag), RFC 4180 CSV
read/write including formula-injection escaping, spreadsheet column guessing and
date coercion, export shaping, PDF generation, form validation, and every
allowed and blocked separation-of-duties transition.

Two integration files drive real Postgres and skip cleanly when `DATABASE_URL`
is unset:

- `tests/sweep.integration.test.ts` — status transitions, nag scheduling,
  idempotency, re-arming on renewal, silence after close.
- `tests/onboarding.integration.test.ts` — invitations claimed on sign-in, and
  the whole reminder path: a nagged approver with no account lands on the
  exception, is joined to the workspace, and closes it, while the author who
  logged it is blocked from signing off on their own record.

---

## Project structure

```
src/
├── app/
│   ├── page.tsx                       workspace picker
│   ├── login/                         magic-link sign-in
│   ├── api/auth/[...nextauth]/        Auth.js handlers
│   ├── api/cron/daily/                the daily sweep endpoint
│   ├── a/[token]/                     reminder link: sign in, join, land on the item
│   ├── invite/[token]/                accept a workspace invitation
│   ├── security/                      the public trust page
│   └── w/[slug]/
│       ├── layout.tsx                 workspace shell + nav
│       ├── page.tsx                   the register: callouts, filters, table
│       ├── exceptions/                create, view, edit, lifecycle actions
│       ├── export/{csv,pdf}/          auditor export routes
│       ├── import/                    CSV import wizard + template
│       ├── members/                   invite teammates, manage roles
│       └── settings/                  workspace name, nag lead times, Slack
├── components/                        client components (forms, chips, wizard)
├── db/
│   ├── schema.ts                      Drizzle schema — the data model
│   └── seed.ts                        ~11 realistic sample exceptions
├── lib/
│   ├── dates.ts                       calendar-date arithmetic (no time-of-day)
│   ├── status.ts                      derived status
│   ├── nag.ts                         the reminder state machine (pure)
│   ├── sweep.ts                       the daily job
│   ├── csv.ts / import.ts / export.ts CSV read, write, column mapping
│   ├── pdf.ts                         the auditor report
│   ├── filter.ts                      register filtering and sorting (pure)
│   ├── permissions.ts                 separation of duties (pure)
│   ├── invitations.ts                 invite, claim on sign-in
│   ├── action-tokens.ts               the actionable link inside a nag
│   └── workspace.ts                   the tenancy gate
└── lib/fonts/                         Archivo, embedded in the PDF
```

---

## Design notes

A few decisions worth knowing before you change something.

**Expiry is a calendar date, not a timestamp.** `expiry_date` is `YYYY-MM-DD`
text. "Expires on the 30th" means the same thing in every timezone, and no
exception silently expires an hour early for someone in Sydney.

**Status is derived on read.** The stored `status` column exists for reporting
and for the event history, but the UI and both exports compute status from
`expiry_date` + `closed_at` every time. A cron outage degrades reminders, never
the register's accuracy.

**`renewed` is a badge, not a state.** A renewed exception with a future date
reads as `renewed`; if it is close to expiry or past it, urgency wins and it
reads `expiring` or `expired`. "This keeps getting kicked down the road" is
exactly the signal the register exists to surface.

**Every action demands a reason.** Renew, extend, close and reopen all refuse to
submit without prose, because the reason is the thing the auditor asks about.

**Reminders are claimed before they are sent.** `nag_log` has a unique index on
`(exception_id, lead_days)` and rows are inserted *before* the email goes out, so
a crash mid-send loses a reminder rather than duplicating one — the safer failure.

**Import is all-or-nothing per file.** Valid rows are inserted in one
transaction; invalid rows are reported by line number with every problem listed
at once, so you fix the spreadsheet in one pass.

**CSV cells starting `= + - @` are prefixed with `'`.** An exception title is
attacker-influenced text and these exports get opened in Excel.

**A reminder nobody can act on is just noise.** Nag emails carry a per-recipient
bearer link that signs the recipient in, joins them to the workspace at the role
their part on the record implies — approver for the named approver, member for
the risk owner — and lands them on that exception. This is the same trust class
as a magic link: 256 bits of entropy, one mailbox, 45-day expiry. A forwarded
reminder grants access, which is stated plainly on `/security`.

**Sign-off is separated from authorship.** Recording an exception is asking for a
risk to be accepted; somebody else has to accept it. `lib/permissions.ts` is the
single place that rule lives, and every sign-off action goes through it on the
server — the UI only mirrors what it decides.

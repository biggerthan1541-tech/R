# Meridian HCM

An all-in-one Human Capital Management platform covering the complete employee
lifecycle — recruit, hire, onboard, employ, schedule, track time, manage leave,
administer benefits, review performance, run payroll, develop and offboard.

Meridian is an **original product**: its own brand, visual system, colour
palette, information architecture and code. It targets the functional depth of
an enterprise HCM suite rather than a single HR dashboard.

```
RECRUIT → HIRE → ONBOARD → EMPLOY → SCHEDULE → TRACK TIME → MANAGE PTO
       → BENEFITS → PERFORMANCE → PAYROLL → DEVELOP → OFFBOARD
```

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
npm run lint       # TypeScript project check
```

There is no backend to configure. On first load the app generates a complete,
internally consistent demo organization in the browser and stores it in
IndexedDB (falling back to local storage, then to memory). Everything you
change — approvals, payroll runs, hires, signatures — persists across reloads
until you reset the dataset from **Settings → Preferences**.

### Signing in

The sign-in screen offers one representative account per role. Any password of
four or more characters is accepted; accounts with MFA enabled ask for any six
digits. You can also search and sign in as any of the ~150 employees.

| Role | Sees |
|---|---|
| Employee | Own profile, time clock, schedule, pay, benefits, tasks |
| Manager | Team approvals for time, leave and expenses; scheduling; performance |
| HR Administrator | Records, lifecycle actions, onboarding, compliance, reporting |
| Payroll Administrator | Payroll processing, validation, taxes, deductions, GL |
| Recruiter | Requisitions, pipeline, interviews, offers, hiring |
| Benefits Administrator | Plans, eligibility, enrollment windows, participation |
| Finance | Labor cost, expense reconciliation, general ledger |
| System Administrator | Users, roles, permissions, sessions, integrations |
| Executive | Company-wide analytics and workforce KPIs |

Use the **acting role** control in the account menu to narrow your view to a
single role and see exactly what that role can reach.

---

## What makes it one system

Every module reads and writes the same employee record. A few concrete paths:

- **Punch → paycheck.** A clock-in creates a punch, which recomputes that day
  on the timecard, which re-applies weekly overtime rules, which feeds the
  payroll calculation when the period is processed.
- **Leave → payroll.** Approving time off decrements the balance *and* writes
  paid-leave hours onto the timecard, so payroll picks it up with no re-entry.
- **Candidate → employee.** Hiring a candidate creates the employee record,
  user account, compensation history, tax profile, onboarding packet built from
  the matching template, and the required training bundle — in one action.
- **Election → deduction.** Saving benefit elections writes per-pay employee and
  employer costs that the next payroll run deducts.
- **Expense → earnings.** An approved expense report is added to the next
  payroll run as a non-taxable reimbursement line.
- **Everything → audit.** Compensation changes, payroll approvals, role grants,
  signature events and lifecycle actions all append to an immutable audit log.

---

## Modules

| Area | What it does |
|---|---|
| **Dashboard** | Role-adaptive home: live clock, approvals queue, payroll status, tasks, announcements |
| **People** | Directory with table, card and org-chart views; deep employee profile across ten tabs |
| **Recruiting** | Requisitions, drag-and-drop pipeline, interview scheduling, scorecards, offers, hiring |
| **Onboarding** | Configurable templates with employee, manager, IT, HR and payroll tasks; completion tracking |
| **HR Operations** | Nine lifecycle actions, compliance dashboard, org structure, movement analysis |
| **Time & Attendance** | Web/kiosk/badge/mobile punching, geofencing, timecards, exceptions, corrections, approvals |
| **Scheduling** | Drag-and-drop shift board (day/week/month), publishing, open shifts, two-step swaps, availability |
| **Time Off** | Balances and accrual, request wizard with policy validation, approvals, team calendar, policies |
| **Payroll** | Full gross-to-net engine, eight-stage run workflow, validation gate, register, taxes, GL export |
| **Benefits** | Four-step enrollment wizard, plan comparison, dependents, enrollment administration |
| **Expenses** | Multi-line reports with receipts and policy flags, manager then finance approval, spend analysis |
| **Performance** | Goals, self and manager reviews, peer feedback, calibration with distribution analysis |
| **Learning** | Course catalog, assignments, in-app course player, certifications, team compliance |
| **Documents** | Categorised library with visibility rules, expiration tracking, version history |
| **Signatures** | E-SIGN style workflow: sent → viewed → signed → completed, with a full audit trail |
| **Reports** | 16 standard reports with filters and CSV export, plus scheduled delivery |
| **Analytics** | Executive KPIs across workforce, labor cost, time and absence, and talent |
| **Assistant** | Permission-scoped natural-language questions answered from live records |
| **Settings** | Organization, pay rules, permission matrix, automation rules, integrations, preferences |
| **Audit log** | Filterable, exportable record of who changed what, when, and from where |

---

## Payroll: how gross-to-net is computed

`src/lib/payroll.ts` implements the pipeline in the open, so a tax-year update
is a data change rather than a code change.

```
earnings (hours × rate, or salary ÷ periods, + bonus/commission/retro)
  → pre-tax deductions (medical, dental, vision, HSA/FSA, 401(k))
  → federal taxable wages
  → FIT (annualised brackets), Social Security (wage base aware),
    Medicare (+ additional Medicare over threshold), state income tax
  → post-tax deductions and garnishments
  → + non-taxable reimbursements
  = net pay
```

Employer-side FICA, FUTA and SUTA are computed alongside for true labor cost.

### The validation gate

Before a run can be approved, `src/lib/validation.ts` checks every paycheck for
missing time, unapproved timecards, unusual or low hours, unexpected overtime,
unresolved missed punches, missing direct deposit, unverified accounts,
incomplete or exempt tax setup, jurisdiction mismatches, missing benefit
deductions, negative or very low net pay, large variance against the prior
check, in-period compensation changes, duplicate earning lines, incomplete
I-9s, omitted employees and run-level variance. Findings are classified:

```
ERROR   blocks approval and funding
WARNING advisory, surfaced to the approver
REVIEW  requires a human decision
READY   nothing outstanding
```

Resolving a finding requires a written note, stored with the resolver and
timestamp in the payroll audit trail.

---

## Access control

`src/lib/permissions.ts` defines ~60 named permissions grouped by module and
maps them to the nine roles. Each module resolves a **data scope** before it
reads anything:

- `all` — every employee record
- `team` — the viewer's reporting tree, walked to any depth
- `self` — only the viewer
- `none` — the module is not reachable

Navigation, quick actions, global search, report catalog and the assistant are
all filtered by the same scope, so a manager searching for a company payroll
figure gets nothing rather than a partial answer.

---

## Automation

Ten configurable rules ship enabled: overtime notification, PTO over balance,
overdue onboarding escalation, payroll anomaly review, certification
expiration, unsubmitted timecard reminder, mandatory training escalation, new
hire provisioning, compensation change audit and large expense secondary
approval. Each is `WHEN <trigger> IF <conditions> THEN <actions>`, editable
from Settings without touching code, and every firing is logged with the
subject record and the actions taken.

---

## Architecture

```
src/
├── lib/
│   ├── types.ts          Domain model for the whole platform
│   ├── permissions.ts    Roles, permissions, data scopes
│   ├── payroll.ts        Gross-to-net calculation engine
│   ├── validation.ts     Pre-commit payroll validation
│   ├── store.tsx         Provider: session, persistence, audit, automation
│   ├── actions.ts        Every state-changing workflow
│   ├── selectors.ts      Shared derived reads
│   ├── assistant.ts      Permission-scoped question answering
│   ├── storage.ts        IndexedDB → local storage → memory
│   └── seed/             Deterministic demo data generator
├── components/           UI kit and chart library
├── app/                  Shell, navigation, command palette, login
└── pages/                One module per file
```

**Stack:** React 18, TypeScript (strict), Vite, Tailwind CSS, React Router.
Charts are hand-built SVG — no charting dependency.

### Design system

An original identity: violet-indigo primary (`#5B3FD6`), deep teal secondary,
warm amber accent, on a restrained slate neutral ramp. Colours are declared as
semantic CSS custom properties, so the dark theme is a genuine re-map rather
than an inversion.

The categorical chart palette is validated for colour-vision separation
against both the light and dark chart surfaces — lightness band, chroma floor,
CVD ΔE between adjacent hues, normal-vision separation and contrast all pass.

### Responsive

Desktop gets the full collapsible-rail experience. Tablet reflows to adaptive
columns. Mobile gets a bottom tab bar tuned for employees and managers, with
wide tables scrolling inside their own containers so the page never scrolls
sideways.

---

## Demo data

Generated deterministically from a fixed seed, so the dataset is identical on
every reset while still looking organic:

- ~150 employees across 12 departments, 6 locations and 45 job titles, in a
  real reporting tree from CEO to front line
- Timecards, punches, published schedules, availability and swap requests
- Time-off policies, balances, requests and a holiday calendar
- 13 payroll runs with ~800 detailed pay statements and live validation findings
- Benefit plans, elections and dependents; garnishments
- Requisitions, ~96 candidates, applications, interviews and offers
- Onboarding packets, goals, review cycles, training assignments
- Documents, signature campaigns, expense reports, audit and automation history

All people, pay and company data are fictional and never leave the browser.

---

## Scope and honesty about it

This is a demonstration platform, not a system of record. Specifically:

- Tax rates and brackets are simplified and approximate; state tax uses flat
  effective rates. Real payroll needs a tax provider.
- Authentication is simulated — any password is accepted, and MFA accepts any
  six digits. Roles and scopes, however, are enforced consistently throughout.
- Integrations, e-signature delivery, banking, notification email/SMS and
  scheduled report delivery are modelled as architecture and status, not live
  connections.
- Documents are metadata records; no file bytes are stored or transmitted.

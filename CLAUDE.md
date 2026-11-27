# CLAUDE.md

Repository, conventions and environment context for AI assistants working in
this codebase.

---

## What this repository is

**Meridian HCM** — an all-in-one Human Capital Management platform covering the
full employee lifecycle. It is an original product with its own brand, design
system and code. See `README.md` for the product overview, module list, payroll
engine explanation and access-control model.

Single-page React application, no backend. The demo organization is generated
deterministically in the browser and persisted to IndexedDB.

---

## Environment

Runs in a **Claude Code on the Web** remote container:

- Working directory is `/home/user/R`.
- The container is discarded after inactivity — **commit and push before ending
  a session**.
- Outbound network is available for package installs and git.
- No `gh` CLI; use the `mcp__github__*` MCP tools for GitHub interactions.
- Chromium is pre-installed at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
  Playwright works if launched with that `executablePath`; do not run
  `playwright install`.

---

## Commands

```bash
npm install
npm run dev        # Vite dev server on :5173
npm run build      # tsc project build + production bundle
npm run lint       # TypeScript check only (no ESLint configured)
```

`npm run lint` is the fast correctness gate — the config uses
`noUnusedLocals` and `noUnusedParameters`, so unused imports fail the build.
Run it after every change.

---

## Project structure

```
src/
├── lib/
│   ├── types.ts          Domain model — the source of truth for every entity
│   ├── permissions.ts    Roles, permission catalog, data-scope resolution
│   ├── payroll.ts        Gross-to-net calculation engine
│   ├── validation.ts     Pre-commit payroll validation rules
│   ├── store.tsx         AppProvider: session, persistence, audit, automation
│   ├── actions.ts        All state-changing workflows (useActions and friends)
│   ├── selectors.ts      Pure derived reads shared across modules
│   ├── assistant.ts      Intent handlers for the natural-language assistant
│   ├── storage.ts        IndexedDB → local storage → memory persistence
│   ├── dates.ts          Local-safe ISO date helpers
│   ├── format.ts         Currency, number, CSV and download helpers
│   └── seed/             Deterministic demo data generator
├── components/
│   ├── ui.tsx            The complete UI kit
│   ├── charts.tsx        Hand-built SVG chart library
│   └── Brand.tsx         Logo mark and wordmark
├── app/                  Shell, nav config, command palette, login, error boundary
└── pages/                One file per module
```

---

## Conventions that matter here

### State changes go through `actions.ts`

Never mutate the database from a component. Use the hooks in `src/lib/actions.ts`
(`useActions`, `usePayrollActions`, `usePeopleActions`, `useTalentActions`,
`useAdminActions`). They exist so that audit entries, notifications, task queues
and automation rules fire consistently regardless of which screen triggered the
change. Adding a workflow means adding an action there, not inline `update()`
calls in a page.

`update(mutator, auditEntry)` mutates the draft in place and swaps the top-level
reference to trigger a render. Pass an audit entry for anything a user would
expect to find in the audit log.

### Permissions are checked before data is read

Call `can(...perms)` for capability checks and `visibleIds(module)` for the set
of employee ids the viewer may see. Filter *then* aggregate — never compute over
everything and hide the result. Modules that a role cannot reach render
`<PermissionDenied />` rather than an empty state.

### Design tokens, not raw colours

Use the semantic Tailwind tokens (`bg`, `surface`, `sunken`, `line`, `ink`,
`muted`, `faint`, plus the `brand`/`teal`/`accent`/`success`/`warning`/`danger`
scales). They are CSS custom properties defined in `src/index.css`, which is
what makes the dark theme work. Chart series must use `seriesColor(i)` from
`components/charts.tsx` — that palette is validated for colour-vision
separation, and adding an ad-hoc colour breaks the guarantee.

### Code style

- No comments unless the *why* is non-obvious.
- Match the density and idiom of the surrounding file.
- Validate at boundaries only; trust internal guarantees.
- Fix what was asked; three similar lines beat a premature abstraction.
- No emojis unless requested.

### Seed data

`src/lib/seed/` is deterministic (fixed RNG seed) so a reset reproduces the same
organization. It must also be **date-independent** — the dataset is generated
relative to "today", so anything anchored to a specific calendar window has to
work on any day. The in-flight payroll run, for example, is derived from the
most recently closed pay period rather than a check-date comparison.

Changing the seed shape means bumping `DB_VERSION` in `src/lib/seed/index.ts`,
otherwise stored databases from earlier sessions load against new code.

---

## Git workflow

| Concern | Rule |
|---|---|
| Development branch | `claude/complete-hcm-platform-kke8lz` |
| Push command | `git push -u origin <branch>` |
| Push failures | Retry up to 4 times with exponential back-off (2s → 4s → 8s → 16s) |
| Pull requests | Only when the user explicitly asks |
| Force-push / destructive ops | Never without explicit instruction |
| Commit subject | Imperative mood, ≤72 characters |
| Commit body | Explain *why*, not *what* |
| Secrets | Never commit `.env`, credentials or API keys |

Append the session URL to commit messages:

```
<subject line>

<body explaining why>

https://claude.ai/code/session_<id>
```

---

## Verifying changes

1. `npm run lint` — catches unused imports and type errors.
2. `npm run build` — confirms the production bundle compiles.
3. For UI work, drive the real app with Playwright and look at the result.
   Log in through the persona picker, navigate, and collect `pageerror` and
   `console.error` events; a screenshot that renders is not the same as a screen
   without runtime errors.

---

## MCP integrations available

Beyond the GitHub server, this environment may expose Canva design tools, media
generation, calendar and cloud file storage. Load tool schemas with `ToolSearch`
before calling them. None of them are required to build or run this project.

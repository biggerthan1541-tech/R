# CLAUDE.md

This file documents the repository, development conventions, and environment context for AI assistants (Claude Code and others) working in this codebase.

---

## Repository State

`biggerthan1541-tech/R` is **Readiness** — a compliance and cyber-insurance-readiness platform for SMBs, sold through the MSP channel. See `README.md` for the product shape, the data model, and how to run it.

Built in phases; **Phases 1 and 2 are complete**, plus the end-to-end operator path: self-serve signup, readiness scored across every assigned profile at once, PDF export, and a what-changed-since-last-time record on every regenerated pack. Phases 3–4 (white-label branding and scheduled generation, wholesale billing) are specified but deliberately not built. Do not build a later phase early.

The product test to apply to any change: **does this move an MSP closer to handing an insurer a credible pack?** `test/operator-journey.test.ts` walks that path over HTTP against an empty database and is the first test to run when the flow changes.

### Stack

Node 22 + TypeScript (ESM, no build step, run via `tsx`), Fastify, SQLite via `better-sqlite3`, server-rendered HTML with an auto-escaping template tag, `node:test`. Four runtime dependencies; keep it that way.

### Non-negotiables

These are enforced by tests, not just convention — `test/no-raw-sql.test.ts` and `test/access.test.ts` fail the build if any is broken.

- **No SQL outside `src/db/`.** All customer data goes through the scoped repository in `src/db/tenant.ts`, and no module other than `tenant.ts` may query a tenant-scoped table. Never add a tenant-scoped table without a composite foreign key onto its parent plus an entry in `TENANT_SCOPED_TABLES`. The single pre-auth exception is `lookupTenantForLogin`, which returns an msp id and nothing else.
- **The evidence log is append-only.** No `UPDATE` or `DELETE` path for `evidence_records`, ever. Current state is the highest `seq`. The audit log is the same, plus a per-tenant hash chain.
- **Control, profile and role logic is data.** Pass/fail rules, gap copy and permissions live in `config/`, never in `src/`. Nothing under `src/domain/` should know what MFA is, or that an "operator" exists.
- **Escape everything.** Build HTML with the `html` tag from `src/render/html.ts`; client names and free-text notes reach client-facing documents.
- **Every form carries CSRF.** Use `csrfField(ctx)` from `src/render/layout.ts`; the hook rejects state-changing requests without it.
- **Every route declares a permission.** Call `requirePermission(request, '<permission>')` — never `requireActor` alone for anything a role might not be allowed to do.
- **Migrations are immutable.** Add `src/db/migrations/NNN_*.sql`; never edit one that has shipped. The runner rejects a changed checksum.
- **No secrets in code.** Configuration comes from `src/config/env.ts`, which fails startup when something required is missing. There are no defaults for signing keys.

---

## Environment

This project runs in a **Claude Code on the Web** remote execution environment (ephemeral container). Important implications:

- The working directory is `/home/user/R`.
- The container is discarded after inactivity — **always commit and push before ending a session**.
- Outbound network is available for package installs, API calls, and git operations.
- No `gh` CLI is available; use the `mcp__github__*` MCP tools for all GitHub interactions.

---

## Git Workflow

| Concern | Rule |
|---|---|
| Default dev branch | `claude/msp-compliance-phase-1-8a31mx` |
| Push command | `git push -u origin <branch>` |
| Push failures | Retry up to 4 times with exponential back-off (2 s → 4 s → 8 s → 16 s) |
| PRs | Only create a PR when the user explicitly asks for one |
| Force-push / destructive ops | Never without explicit user instruction |
| Commit message style | Imperative mood, ≤72 chars subject, body explains *why* not *what* |
| Secrets | Never commit `.env`, credentials, or API keys |

Always append the session URL to commit messages:

```
<subject line>

https://claude.ai/code/session_<id>
```

---

## MCP Integrations

Three MCP servers are connected to this environment in addition to the built-in GitHub server. Use `ToolSearch` to load a tool's schema before calling it.

### 1. GitHub (`mcp__github__*`)
Full GitHub API access scoped to `biggerthan1541-tech/R`.

Key tools: `get_file_contents`, `push_files`, `create_pull_request`, `list_commits`, `list_branches`, `create_branch`, `add_issue_comment`, `search_code`, `pull_request_read`, `subscribe_pr_activity`.

> Use these for **all** GitHub interactions — never use `gh` CLI.

### 2. Canva (`mcp__06a5efe3-*`)
Design generation, editing, and asset management via the Canva API.

Key tools: `generate-design`, `generate-design-structured`, `create-design-from-brand-template`, `export-design`, `get-design`, `get-design-content`, `perform-editing-operations`, `start-editing-transaction` / `commit-editing-transaction` / `cancel-editing-transaction`, `upload-asset-from-url`, `list-brand-kits`, `search-designs`.

**Editing transaction pattern** — always wrap multi-step design edits in a transaction:
1. `start-editing-transaction`
2. `perform-editing-operations` (one or more)
3. `commit-editing-transaction` (or `cancel-editing-transaction` on error)

### 3. Runway / Media Generation (`mcp__b1e7c311-*`)
AI image and video generation, plus virality prediction.

Key tools: `generate_image`, `generate_video`, `virality_predictor`, `media_upload` + `media_confirm` (for local files), `job_display`, `show_generations`, `models_explore`, `balance`, `transactions`.

**Local file workflow** — when working with a local video/image file, always call `media_upload` then `media_confirm` before passing the asset to generation or analysis tools.

**Virality predictor** — use when the user asks to predict engagement, attention, audience response, retention risk, hook strength, or creative performance of a video.

### 4. File Service (`mcp__f62d915c-*`)
Cloud file storage (likely Google Drive) for reading, creating, downloading, and searching files.

Key tools: `create_file`, `read_file_content`, `download_file_content`, `copy_file`, `list_recent_files`, `search_files`, `get_file_metadata`, `get_file_permissions`.

---

## Development Conventions

> These are defaults. Override them in this file once the project has an established stack.

### Code Style
- No comments unless the *why* is non-obvious (a subtle invariant, a workaround, a hidden constraint).
- No docstrings beyond a single short line where required by tooling.
- No emojis unless the user explicitly requests them.

### Error Handling
- Validate only at system boundaries (user input, external APIs). Trust framework/internal guarantees.
- Do not add fallbacks for scenarios that cannot happen.

### Security
- No command injection, XSS, SQL injection, or other OWASP Top 10 issues.
- No secrets in source; use environment variables loaded from outside the repo.

### Scope Discipline
- Fix what was asked; don't refactor or add abstractions beyond the task.
- Three similar lines is better than a premature abstraction.
- No half-finished implementations or feature flags for hypothetical future requirements.

---

## Running & Testing

```bash
npm install
npm run setup       # one-time: write .env with a generated SESSION_SECRET
npm start           # http://localhost:3000 -> "Set up your MSP" (no seeding needed)
npm run demo        # optional worked example: tenant + users + a client with history
npm run dev         # with reload

npm test            # node:test, no runner dependency (121 tests)
npm run typecheck   # tsc --noEmit
npm run reset       # delete the database file
```

`npm run demo` prints sign-in credentials once. Schema changes go in a new migration file under `src/db/migrations/`; they are applied automatically on open.

---

## Project Structure

```
R/
├── CLAUDE.md
├── README.md                  ← product, data model, how to verify each phase
├── config/
│   ├── controls.json          ← control definitions, pass/fail rules, gap copy
│   ├── roles.json             ← roles → permissions
│   └── profiles/*.json        ← requirement profiles (insurer, CMMC, HIPAA, SOC 2)
├── src/
│   ├── config/env.ts          ← required configuration, validated at startup
│   ├── db/                    ← migrations, connection, msps, reference, tenant (isolation boundary)
│   ├── auth/                  ← passwords (scrypt), tokens, sessions, permission checks
│   ├── http/                  ← cookies, security (CSP/CSRF/headers), validation
│   ├── domain/                ← evaluate, config-loader, readiness scoring, roles, types
│   ├── render/                ← html escaping, layout, console/client views, auth views, evidence pack, pdf
│   ├── server.ts              ← Fastify routes
│   └── cli.ts                 ← setup / seed / demo / reset
└── test/                      ← isolation, migrations, no-raw-sql, security, access,
                                 portal, audit, evaluation, scoring, rendering
```

---

## Updating This File

Whenever a significant convention is established (new framework chosen, test runner added, directory structure decided), update the relevant section here **in the same commit** that introduces the change.

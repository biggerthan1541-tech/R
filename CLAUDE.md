# CLAUDE.md

This file documents the repository, development conventions, and environment context for AI assistants (Claude Code and others) working in this codebase.

---

## Repository State

This repository holds **Lapse** — a register for security exceptions, risk
acceptances and temporary access grants that expire, nag their owner and export
auditor-ready evidence. See `README.md` for the product brief, setup, environment
variables and design notes.

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
| Default dev branch | `claude/lapse-exceptions-mvp-5po7v4` |
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

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Drizzle ORM on Postgres ·
Auth.js v5 (email magic link) · Resend · pdfkit · Vitest. Deploys to Vercel; the
daily expiry sweep runs on Vercel Cron.

---

## Running & Testing

```bash
npm install
cp .env.example .env.local     # set AUTH_SECRET at minimum

npm run db:local               # embedded Postgres (PGlite) on :5432 — leave running
npm run db:migrate
npm run db:seed

npm run dev                    # http://localhost:3000
npm test                       # vitest
npm run typecheck
npm run cron:local -- 2026-12-01   # run the daily sweep as if it were that date
```

`DRY_RUN_NOTIFICATIONS=1` prints magic links and nag emails to the terminal
instead of sending them, so no Resend key is needed locally.

---

## Project Structure

See the annotated tree in `README.md`. In short: `src/app` is the App Router,
`src/lib` holds the pure domain logic (dates, derived status, the nag state
machine, CSV/PDF export, filtering) and `src/db` holds the Drizzle schema and
seed.

---

## Design Invariants

Do not break these without reading the "Design notes" section of `README.md`:

- `expiry_date` is a `YYYY-MM-DD` calendar date, never a timestamp.
- Status is **derived on read** from `expiry_date` + `closed_at`; the stored
  column is for reporting and history only.
- Every lifecycle action (renew / extend / close / reopen) requires a written
  reason and writes an append-only `event` row.
- Nag milestones are claimed in `nag_log` *before* sending, so the sweep is
  idempotent.
- Every workspace-scoped page and route resolves the workspace through
  `requireWorkspace()` — that is the only tenancy gate.

---


## Updating This File

Whenever a significant convention is established (new framework chosen, test runner added, directory structure decided), update the relevant section here **in the same commit** that introduces the change.

# CLAUDE.md

This file documents the repository, development conventions, and environment context for AI assistants (Claude Code and others) working in this codebase.

---

## Repository State

This repository holds a **cyber-insurance questionnaire gap-analysis tool** — the wedge MVP for a compliance/insurance-readiness product sold to SMBs through the MSP channel.

**Stack:** Node 22 + Express 5, server-rendered HTML, `node:sqlite` (built in) for persistence. Express is the only runtime dependency; there is no build step and no front-end framework.

**Load-bearing convention:** control definitions and their pass/fail rules live in `config/controls.js` and nothing under `src/` knows about any specific control. Keep it that way — the whole point is that insurer requirements change without touching app logic.

**Second load-bearing convention:** every row that belongs to a client carries `client_id`, and every query function in `src/db.js` takes `clientId` as its first argument and throws without one. The UI is single-tenant today; the data model is not. Do not add a query that skips the scope.

See `README.md` for how to run it and what is deliberately out of scope.

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
| Default dev branch | `claude/cyber-insurance-questionnaire-mvp-qr5v2f` |
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
npm run sample     # regenerate samples/sample-gap-report.html + seed a demo client
npm start          # http://localhost:3000
npm run dev        # same, with --watch
npm run reset      # delete data/gap-analysis.db
```

Requires Node 22.5+ for `node:sqlite`. There is no test runner yet — verify changes by
running `npm run sample` (the sample flows through the same evaluation and rendering
code as the web app) and by walking a questionnaire in the browser.

---

## Project Structure

```
R/
├── CLAUDE.md
├── README.md
├── config/
│   ├── controls.js       ← questionnaire, pass/fail rules, plain-language copy
│   └── branding.js       ← company name, logo, colours, report disclaimer
├── src/
│   ├── server.js         ← Express routes; app.param resolves + scopes :clientId
│   ├── db.js             ← schema and tenant-scoped queries
│   ├── evaluate.js       ← pure scoring engine, no DB and no control knowledge
│   ├── auth.js           ← stub actor; replace here when real auth lands
│   └── views/            ← server-rendered HTML (layout, home, questionnaire, report)
├── public/styles.css     ← shared by the app and the standalone sample report
├── scripts/              ← generate-sample.js, reset-db.js
├── samples/              ← sample answers, generated gap report, evidence JSON
└── data/                 ← SQLite database (gitignored)
```

### Writing plain-language copy

The `gap` and `fix` text in `config/controls.js` is the product. Write it for a business
owner with no security background: state the **consequence** (what it costs them, what
an insurer does about it), never the mechanism. No jargon, no acronyms left unexpanded,
no scare tactics beyond what is accurate.

---

## Updating This File

Whenever a significant convention is established (new framework chosen, test runner added, directory structure decided), update the relevant section here **in the same commit** that introduces the change.

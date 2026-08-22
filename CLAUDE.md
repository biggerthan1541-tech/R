# CLAUDE.md

This file documents the repository, development conventions, and environment context for AI assistants (Claude Code and others) working in this codebase.

---

## Repository State

This repository holds a **cyber-insurance readiness toolkit** — the pilot-stage wedge for a compliance/insurance-readiness product sold to SMBs through the MSP channel.

Two front ends over one set of control definitions:

- **`bin/pack.js`** — the pack CLI, and the primary tool. The founder fills in one YAML file per client and it renders a branded, client-ready evidence pack (HTML + PDF). Manual by design: this is validating whether MSPs value the *output* before software gets built to generate it at scale.
- **`src/server.js`** — the earlier questionnaire web app. Same controls, same scoring, same renderer, browser form instead of a file.

**Stack:** Node 22, server-rendered HTML, `node:sqlite` (built in) for persistence. Two runtime dependencies, `express` and `yaml`. No build step, no front-end framework.

**Load-bearing convention:** control definitions and their pass/fail rules live in `config/controls.js` and nothing under `src/` knows about any specific control. Keep it that way — the whole point is that insurer requirements change without touching app logic.

**Second load-bearing convention:** every row that belongs to a client carries `client_id`, and every query function in `src/db.js` takes `clientId` as its first argument and throws without one. The UI is single-tenant today; the data model is not. Do not add a query that skips the scope.

**Third:** the pack CLI and the web app must stay on one code path. `evaluate.js` is pure and shared; `views/report.js` renders both (the pack passes `context` and `summary`, the web app does not); `src/brands.js` serves both. When adding a pack feature, extend the shared piece rather than forking a pack-only renderer.

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

# pack CLI (the primary tool)
npm run pack -- new "Acme Ltd"                                  # scaffold a client file
npm run pack -- check clients/acme-ltd.yaml                     # validate + score, writes nothing
npm run pack -- build clients/harlow-and-vine-logistics-ltd.yaml # render the worked example
npm run pack -- list

# web app
npm start          # http://localhost:3000   (BRAND=meridian to switch branding)
npm run dev        # same, with --watch
npm run sample     # regenerate samples/sample-gap-report.html + seed a demo client
npm run reset      # delete data/gap-analysis.db
```

Requires Node 22.5+ for `node:sqlite`. PDF output shells out to headless Chrome —
`CHROME_PATH`, then Playwright's cache, then the usual locations; without one you still
get `pack.html`.

There is no test runner yet. Verify changes by rebuilding the worked example
(`npm run pack -- build clients/harlow-and-vine-logistics-ltd.yaml`, which should score
60/100 and flag backups as blocking), running `npm run sample`, and walking a
questionnaire in the browser. When changing the renderer, check both — the pack and the
web report share it.

---

## Project Structure

```
R/
├── CLAUDE.md
├── README.md
├── bin/pack.js           ← the pack CLI
├── config/
│   ├── controls.js       ← questionnaire, pass/fail rules, plain-language copy
│   ├── branding.js       ← thin wrapper: which brand the web app renders under
│   └── brands/           ← one YAML per MSP, plus logos/
├── src/
│   ├── brands.js         ← brand loading; inlines the logo as a data URI
│   ├── evaluate.js       ← pure scoring engine, no DB and no control knowledge
│   ├── db.js             ← schema and tenant-scoped queries
│   ├── server.js         ← Express routes; app.param resolves + scopes :clientId
│   ├── auth.js           ← stub actor; replace here when real auth lands
│   ├── views/            ← HTML rendering, shared by CLI and web app
│   └── pack/
│       ├── input.js      ← client file loading + strict validation
│       ├── scaffold.js   ← generates the fill-in template from controls.js
│       ├── render.js     ← HTML + PDF output
│       └── store.js      ← dated records on disk, evidence rows in the ledger
├── public/styles.css     ← shared by web app, sample report and packs
├── clients/              ← client input files (YAML), incl. the worked example
├── packs/                ← generated packs, one dated directory per build
├── scripts/              ← generate-sample.js, reset-db.js
├── samples/              ← the web app's sample report
└── data/                 ← SQLite database (gitignored)
```

### The scaffold is generated, not written

`pack new` builds its template from `config/controls.js` — every question with its valid
values and the outcome each produces. Never hand-edit a template to match a control
change; edit `controls.js` and regenerate.

### Writing plain-language copy

The `gap` and `fix` text in `config/controls.js` is the product. Write it for a business
owner with no security background: state the **consequence** (what it costs them, what
an insurer does about it), never the mechanism. No jargon, no acronyms left unexpanded,
no scare tactics beyond what is accurate.

---

## Updating This File

Whenever a significant convention is established (new framework chosen, test runner added, directory structure decided), update the relevant section here **in the same commit** that introduces the change.

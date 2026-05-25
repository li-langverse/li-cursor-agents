# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Workflow repo routing** — `explore-li-ecosystem` skill section for implementers; `resolve-workflow-repo.ts`; `run-agent --goal-file` / `--workflow-repo` inference; `scripts/goal-directed-loop.sh`.
- **Completion modes** — `LI_AGENT_VERIFY_MODE`, `digest_only` (skip-push), and `LI_REPO_WORKFLOW_SMOKE`; hard vs informational gaps; supervisor handoffs between agents in the same tick (`src/control-plane/run-completion.ts`, `src/supervisor/handoff.ts`).
- **PR deduplication** — post-hook reuses open PR for branch instead of `gh pr create` duplicate (`src/repo-workflow/pr.ts`).
- **Classified git errors** — `git_auth_cursor_bot`, `pr_already_exists`, etc. (`src/repo-workflow/git-errors.ts`).
- **Live li-demo smoke** — `npm run smoke:li-demo:live` runs `docs_maintainer` on real `gh repo clone` of `li-langverse/li-demo` with Cursor SDK and post-hook push (`scripts/live-li-demo-smoke.mjs`).
- **Long-run swarm monitor** — `npm run agents:monitor` runs `scripts/monitor-swarm-long.sh` (default 3h, 5m interval): clones `li-local-ci` when missing, checks Docker/Supabase containers (project-scoped names), `GET /api/runtime`, optional `LI_MONITOR_SDK_SMOKE` / `LI_MONITOR_SUPABASE_ENSURE` / `LI_MONITOR_MIGRATION_DRY_RUN`.
- **`scripts/ensure-li-local-ci.sh`** — clones `https://github.com/li-langverse/li-local-ci` when `LI_USE_LOCAL_CI≠0`, `LI_AUTO_CLONE_LOCAL_CI≠0`, and `bin/li-local-ci` is missing.
- **`agents:keep` + local CI** — `scripts/keep-agents-running.sh` invokes `ensure-li-local-ci.sh` after Supabase setup (warns on failure, does not block dashboard).
- **Swarm watchdog** — `npm run agents:watch` / `scripts/watch-control-plane.sh` restarts dashboard + supervisor when `/api/status` fails; re-POSTs `/api/supervisor/start` if loop stops.
- **`LI_SWARM_MAX_PARALLEL`** — optional cap for run-all parallel spawns (`0` = all leaf agents at once).

### Changed

- **Cursor API key resolution** — skip `http(s)://` dashboard URLs in `CURSOR_API_KEY` / `CURSOR_SDK`; pick first plausible key across all credential env vars; `.env` no longer overrides a good shell key with a URL; `check-sdk-key.sh` probes `GET /v1/me` per candidate (`src/env.ts`).
- **Cursor Auto model everywhere by default** — `CURSOR_MODEL` defaults to `default` (Auto) in `env.defaults.sh`, `keep-agents-running.sh`, and `.env.example`; `auto`/`default` aliases normalized in `resolveCursorModelId()`; `/api/status` and `/api/runtime` expose `cursor_model_id`.
- **SDK / Cursor error visibility** — `errorDetailFromUnknown` and `formatErrorMarkdown` capture `code`, HTTP `status`, `requestId`, `operation`, `endpoint`, `isRetryable`, and one-hop `causeLine`; generic message `"Error"` is expanded when `code` is set (`src/agent-output-format.ts`, `src/backends/cursor-sdk-backend.ts`).
- **Dashboard API e2e** — `POST /api/supervisor/start` accepts `already_running` when auto-start beat the test (`src/e2e/dashboard-api.e2e.ts`).

### Fixed

- **Repo-workflow push after `gh clone`** — `gitPushBranch()` uses explicit `GH_TOKEN` push URL; scrub clone `url.insteadof`; bypasses global gh config that forced `cursor[bot]` 403 (`src/repo-workflow/git.ts`, `pr.ts`, `workspace.ts`).

### Fixed

- **Cursor keys from `.env` override process env** — non-empty `CURSOR_API_KEY`, `CURSOR_SDK`, `CURSOR_MODEL`, etc. in `li-cursor-agents/.env` replace already-set values so a refreshed local key is not ignored when the shell still has stale Cloud-injected vars (`src/env.ts`).
- Supervisor loop survives tick-level throws (logs error, continues interval).
- Ops server logs `uncaughtException` / `unhandledRejection` without exiting.
- `package.json` declares `pg` and `@modelcontextprotocol/sdk` (fixes fresh `npm ci` build).
- Operational logs (`keep-agents.log`, supervisor subprocess) prefix ISO-8601 timestamps; `src/agent-log.ts`, `scripts/test-log-timestamps.mjs` regression.
- Supabase persist `fetch failed`: retry transient REST errors, serialize state upserts, normalize `localhost` → `127.0.0.1`, wait for PostgREST in `ensure-supabase.sh`, `db:probe` checks REST not only Postgres (`src/db/supabase-retry.ts`, `rest-health.ts`, `persist.ts`).
- Dashboard agent status: **Recommended** (briefing/heap) vs misleading **Queued**; cooldown wins over recommended; supervisor subprocess state mirrored to `data/control-plane/state.json` for parent reload when Supabase persist fails (`src/control-plane/state.ts`, `web/app.js`).

### Added
- **Control-plane DB exploration for agents** — MCP server `li-control-plane-db` (`list_control_plane_tables`, `describe_table`, `query_control_plane_db`) wired into Cursor SDK when Supabase is enabled; skill `explore-control-plane-db`; `npm run db:probe`.
- **`workspace_sweeper` agent** — fallback safety: scan sibling clones for uncommitted work, safe `commit`/`push`/`gh pr create`, document test commands, restart dashboard via `keep-agents-running.sh` (`src/repo-workflow/workspace-sweep.ts`, `npm run workspace:sweep`).

### Added

- **`bug_fixer`**, **`security_auditor`**, **`code_implementer`** agents — CI/bug queue, CWE catalog audit, implements gaps with guaranteed push (`repo-workflow` post-hook).
- **Local CI PR comments** — after `local-ci-sweep`, posts `<!-- li-agent local-ci -->` on PRs when GHA is missing/red (`src/local-ci/pr-comment.ts`).
- **Guaranteed push post-hook** — `docs_maintainer`, `ci_maintainer`, numerics agents auto `commit`/`push`/`gh pr create` after run when isolated workspace is dirty (`src/repo-workflow/post-hook.ts`); tests use `fixtures/li-demo-workflow` + `LI_REPO_WORKFLOW_USE_FIXTURE=1`.
- **`pr_branch_opener`** agent — opens PRs for remote branches without an open pull request (`pr-branch-hygiene.py` preflight).
- **`pr_branch_hygiene`** preflight instructions for `pr_alignment` to close superseded/outdated PRs (`safe_now` rows).

### Fixed

- Supervisor cooldown: do not re-dispatch recommended agents when heap queue skipped tasks on cooldown (`src/supervisor/loop.ts`); cooldown treats terminal run statuses (`src/heap/task-queue.ts`).
- Native `sqlite3` / arch mismatch: `scripts/ensure-native-modules.sh` rebuilds for host Node before `agents:keep`.

### Added

- `LI_CONTROL_PLANE_STORE=supabase|disk` (default supabase); `assertStoreReady()` at stack start; single-store persist path in `src/db/persist.ts`.
- `src/agent-output-format.ts` — structured agent markdown (metadata, preflight, deliverable, error + stack).

### Added
- `scripts/ensure-supabase.sh` + `npm run db:ensure`: start local Supabase, apply migrations, write `.env.supabase` with JWT keys (CLI 2.53 does not print service role).
- Supabase is the **default** primary store (`LI_STACK_SKIP_SUPABASE=0`); `agents:keep` and `npm run setup` call ensure automatically.

### Changed
- Removed auto `LI_STACK_SKIP_SUPABASE=1` on low disk; opt out explicitly when Docker is unavailable.

### Added

- **Local CI** — `npm run ci:local` via sibling `li-local-ci` (host); GHA workflow is `workflow_dispatch` only to save quota.
- **Swarm statistics** on Overview: actions taken (tool calls), file edits, lines added/deleted, PRs opened/merged/open, packages created — `GET /api/statistics`, persisted counters in `data/control-plane/swarm-stats.json`.

### Changed

- Interventions recomputed from fresh `agent-briefing.json`, filtered to open PRs only, persisted to `interventions_latest` (Supabase) + disk; auto-refresh briefing when older than 20m (throttled).
- Dashboard footer: two modes only — **Supervisor mode** (toggle loop) and **Run all (parallel)**.
- Dashboard shows **cursor-sdk vs mock** in top bar, overview banner, runs table, Activity cards, and run drawer (`sdk_ready` on `/api/status`).
- **Real Cursor SDK is the default** for dashboard, `agents:keep`, and supervisor; `CURSOR_MOCK=1` only in `npm test` / CI / `--mock`. Production scripts `unset CURSOR_MOCK` after loading `.env`.

### Fixed

- Dashboard no longer shows a frozen `last_tick_at` while the subprocess supervisor keeps ticking — reload state from disk on API poll; supervisor activity log shared via `supervisor-activity.jsonl`.

### Added

- Dashboard **Activity** view and overview teaser: `GET /api/activity/recent` with prompt/output/action drill-downs; **Full trace** opens existing run drawer.
- Supervisor loop feedback: in-memory activity log (`GET /api/supervisor/activity`), CLI startup banner, dashboard toast + supervisor log panel + footer button states.
- Local Supabase control-plane store: `supabase/migrations/20260517120000_control_plane.sql`, `supabase/config.toml`, `src/db/*`.
- APIs: `GET /api/agents/:id/history`, DB-first `/api/runs` and run detail.
- Backfill: `scripts/backfill-control-plane-db.mjs`, `npm run db:backfill`.
- Docs: `docs/agent-run-history.md`.
- Dashboard Cursor-style run timeline in agent drawer (completion, PR links, premature badges).
- Agent completion audit (`run-completion.ts`), repo-workflow rollouts, agent-kit maintainer automation.

### Changed

- Supervisor, runner, and ops-server persist runs/reports/state to Supabase when `SUPABASE_URL` is set; disk JSON remains export cache (`LI_EXPORT_DISK_CACHE`).

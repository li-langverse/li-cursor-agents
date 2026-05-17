# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Placement governance** — `placement-governance.ts` hard gates (roadmap, `trusted.lean`, `PKG-*`); `applyPlacementDecision` used by MCP + post-run.
- **Run-all handoff phases** — `runHandoffPhasedSwarm` returns `phases[]`; e2e `run-all-handoff.e2e.ts`; `schemas/agent-handoff.v1.json`.
- **Completion audit** — flags `trusted.lean` edits without `trusted-change-approved` in deliverable/trace.
- **MCP** — `get_briefing_snapshot` on `li-ecosystem-context`.
- **GHA swarm cron** — `.github/workflows/swarm-maintenance-cron.yml` (12h briefing/scorecard refresh, no LLM); `swarm-audit-cron.yml` (weekly handoff smoke + optional benchmarks dispatch).
- **Dashboard lane API** — `/api/lanes`, start/stop research & implement loops, per-lane ticks; footer toggles in `web/app.js`.
- **Briefing scorecards** — `swarm_scorecard`, `research_goals_status`, `provability_scorecard` via `src/briefing/swarm-scorecard.ts` + maintenance lane refresh.
- **`li-ecosystem-context` MCP** — `record_placement_decision`, `list_pending_handoffs`, research session tools (`src/mcp/li-ecosystem-context-mcp.ts`).
- **Handoff phased run-all** — `LI_SWARM_HANDOFF_PHASES` (default on) uses research → implement ticks instead of parallel spawn.
- **Maintenance lane** — `npm run agents:maintenance-lane` refreshes briefing without LLM.
- **Research + implement lanes** — `src/lanes/research-lane.ts`, `implement-lane.ts`; `npm run agents:research-lane` / `agents:implement-lane`; session-first scheduling; placement gate via `package_architect`.
- **`config/research-goals.yaml`** + `src/research-goals/load-goals.ts` — goal priority, cadence, agent mapping.
- **Post-run swarm effects** — `src/handoffs/post-run.ts` advances research sessions, creates cycle handoffs, parses architect placement JSON.
- **Cross-process SDK lock** — `data/control-plane/sdk-session.lock` via `withGlobalSdkSessionLock()`.
- **Swarm handoffs + research sessions** — Supabase migration `20260517150000_swarm_handoffs_sessions.sql`; disk fallback `data/handoffs/pending.jsonl`; `src/handoffs/handoff-store.ts`, `src/research-sessions/session-store.ts`.
- **Agents** — `package_architect` (plan), `goal_researcher`, `proof_gap_researcher`, `stdlib_researcher`; prompts under `prompts/`; heap coordinator mapping in `src/heap/coordinators.ts`.
- **Prompt wiring** — `config/swarm-mandate.md`, `src/preflight/swarm-context.ts`, `src/agents/sdk-mode.ts` (plan/debug prefixes); pending handoffs + session continuation in `buildUserMessage`.
- **Implement git rhythm** — post-hook `openPr=false` for `code_implementer`/`bug_fixer` unless `LI_REPO_WORKFLOW_OPEN_PR=1` (`src/repo-workflow/post-hook.ts`).

### Fixed

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

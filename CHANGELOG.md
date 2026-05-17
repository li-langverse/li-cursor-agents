# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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

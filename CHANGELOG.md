# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Supervisor loop feedback: in-memory activity log (`GET /api/supervisor/activity`), CLI startup banner, dashboard toast + supervisor log panel + footer button states.
- Local Supabase control-plane store: `supabase/migrations/20260517120000_control_plane.sql`, `supabase/config.toml`, `src/db/*`.
- APIs: `GET /api/agents/:id/history`, DB-first `/api/runs` and run detail.
- Backfill: `scripts/backfill-control-plane-db.mjs`, `npm run db:backfill`.
- Docs: `docs/agent-run-history.md`.
- Dashboard Cursor-style run timeline in agent drawer (completion, PR links, premature badges).
- Agent completion audit (`run-completion.ts`), repo-workflow rollouts, agent-kit maintainer automation.

### Changed

- Supervisor, runner, and ops-server persist runs/reports/state to Supabase when `SUPABASE_URL` is set; disk JSON remains export cache (`LI_EXPORT_DISK_CACHE`).

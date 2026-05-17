# Supabase control plane primary store

## Summary

`li-cursor-agents` persists agent runs, supervisor state, reports, interventions, briefing/heap snapshots, and repo rollouts to **local Supabase** via versioned migrations; the dashboard reads DB-first when `SUPABASE_URL` is configured.

## Agent continuation

1. **Read** `docs/agent-run-history.md`, `supabase/migrations/20260517120000_control_plane.sql`, `src/db/persist.ts`.
2. **Run** `supabase start && supabase db reset`, set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, `npm run db:backfill`, `npm run dashboard`.
3. **Then** wire streaming `agent_run_events` chunks if SDK exposes partial output; optional `LI_EXPORT_DISK_CACHE=0` for DB-only mode.
4. **Blocked on** human merge of this PR; live SDK e2e still requires `CURSOR_API_KEY`.

## Changed

- `supabase/migrations/20260517120000_control_plane.sql` — tables: `agent_runs`, `agent_run_events`, `control_plane_state`, `control_plane_reports`, `interventions_snapshots`, `briefing_snapshots`, `heap_plan_snapshots`, `queued_agent_tasks`, `repo_workflow_rollouts`.
- `src/db/` — client, `runs.ts`, `control-plane.ts`, `persist.ts`.
- `src/control-plane/state.ts`, `build-report.ts`, `runs-catalog.ts`, `src/supervisor/loop.ts`, `src/runner.ts`, `src/ops-server.ts`.
- `web/app.js`, `web/style.css` — timeline UI.
- `scripts/backfill-control-plane-db.mjs`, `.env.example`, `package.json` (`@supabase/supabase-js`).
- Tests: `src/e2e/dashboard-api.e2e.js` includes `/api/agents/:id/history`.

## Not changed

- `lic` compiler, Lean proofs, and `li-tests` manifest.
- `benchmarks` ingest/dashboard publishing (briefing scripts consumed, not rewritten).
- GitHub org branch protection or merge automation (PRs still human-reviewed).
- Production hosted Supabase (local CLI only in this PR).

## Breaking

N/A — disk cache remains default; CI runs without Supabase unchanged.

## Security

N/A — local dev RLS policies allow service role only; no new trusted axioms or secrets committed.

## Performance

N/A — no benchmark tier changes; DB writes are async side paths on supervisor tick.

## Downstream

N/A — `lip`/`lit` pins unchanged; agent-kit install path unchanged.

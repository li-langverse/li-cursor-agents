# Agent run history (local Supabase)

The control plane stores **all** durable state in **local Supabase** when configured. Disk files under `data/` remain an optional export/cache (`LI_EXPORT_DISK_CACHE`, default on).

## Tables

| Table | Purpose |
|-------|---------|
| `agent_runs` | Full run history (output, status, completion, PR URLs) |
| `agent_run_events` | Timeline events per run (`run_finished`, future streaming chunks) |
| `control_plane_state` | Supervisor state (singleton row `id=1`) |
| `control_plane_reports` | Latest + historical dashboard reports |
| `interventions_snapshots` | Intervention lists per report tick |
| `briefing_snapshots` | Briefing JSON keyed by `briefing_hash` |
| `heap_plan_snapshots` | Heap plan per briefing |
| `queued_agent_tasks` | Denormalized heap queue rows |
| `repo_workflow_rollouts` | Per-repo agent-kit PR rollout rows |

Migrations: `supabase/migrations/20260517120000_control_plane.sql`

## Startup

```bash
cd li-cursor-agents
supabase start
supabase db reset   # applies migrations locally

# Keys from `supabase status`
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_SERVICE_ROLE_KEY=<service_role from supabase status>

cp .env.example .env   # fill SUPABASE_* and BENCHMARKS_ROOT
npm install
npm run build
npm run dashboard
```

## Backfill from disk

```bash
node scripts/backfill-control-plane-db.mjs
```

Reads `data/runs/*.md|json` and `data/control-plane/{state,latest-report,interventions}.json`.

## APIs (DB-first when `SUPABASE_URL` set)

- `GET /api/runs` — global run list
- `GET /api/runs/:id` — run output + completion
- `GET /api/agents/:id/detail` — agent drawer (includes `history`)
- `GET /api/agents/:id/history?limit=50` — Cursor-style timeline rows

## Code layout

- `src/db/client.ts` — Supabase client
- `src/db/runs.ts` — run repository
- `src/db/control-plane.ts` — state, reports, interventions, briefing, heap
- `src/db/persist.ts` — dual-write (DB primary, disk cache)

CI runs without Supabase (`CURSOR_MOCK=1`); tests use disk fallback automatically.

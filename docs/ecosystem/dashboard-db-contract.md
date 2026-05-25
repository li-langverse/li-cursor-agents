# Dashboard ↔ Supabase contract

The ops dashboard (`:9477`) and Next.js read API share the same Supabase tables when `LI_CONTROL_PLANE_STORE=supabase`.

## Tables

| Table | Purpose |
| --- | --- |
| `agent_runs` | Run lifecycle: `run_id`, `agent_id`, `status`, `started_at`, `finished_at`, `run_trace`, `run_input` |
| `agent_run_events` | Structured SDK activity: `run_id`, `seq`, `event_type`, `payload` (tool calls, steps, lifecycle) |
| `worker_status` | Peer heartbeat from async-swarm: `active_runs`, lane flags, SDK slot counts |

## Runtime API (`GET /api/runtime`)

- **`active_runs`**: union of async-swarm heartbeat rows and DB `agent_runs` with `status=running` (orphans after worker loss).
- Each running row includes **`recent_events`** (last 5) and **`last_event`** (latest payload preview) when run-event persist is enabled.
- **`store`**, **`db_enabled`**, **`control_plane_store`**: must read `supabase` when the stack is up; `disk` is a boot-time fallback only.

## Events API (`GET /api/runs/:run_id/events`)

- Reads `agent_run_events` (Supabase) or `data/runs/events/<run_id>.jsonl` (disk).
- Token/text/thinking deltas are skipped by default (`LI_SDK_LOG_SKIP_TOKEN_DELTAS`).

## Live activity UI

- Ops dashboard (`web/app.js`) prefers `active_runs[].recent_events` / `last_event`, then polls `/events` for gaps.
- Next.js overview uses the same runtime shape via `db-api`.

## Stale runs

- `reconcileStaleRunningAgentRuns()` marks DB rows stuck in `running` for longer than `LI_STALE_RUNNING_RUN_MS` (default 30m) as `error` with `stale_running_reconciled`.
- Does **not** mark fresh runs; mid-run SIGKILL leaves rows until stale reconcile or manual fix.

## Operational notes

1. Both systemd units run `scripts/lib/agents-swarm-systemd-wrapper.sh`, which calls `ensure-supabase.sh` at start. If the DB container is not ready, services fall back to **`LI_CONTROL_PLANE_STORE=disk`** and the dashboard will show empty DB activity until restart.
2. After host reboot or Docker start: `systemctl --user restart li-agents-async-swarm li-agents-dashboard`, then confirm `curl :9477/api/runtime | jq '.store, .active_runs[0].recent_events'`.
3. SDK runs emit events; preflight-only work (e.g. briefing scripts before SDK) may show runs without events until the SDK phase starts.

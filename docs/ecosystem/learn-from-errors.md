# Learn from errors (2026-05-26)

Summary from Supabase `agent_runs` diagnosis on branch `feat/goal-directed-swarm` (last 24h sample: 6 finished, 14 incomplete, 106 error).

## Error taxonomy (typical categories)

| Category | `error` / signal | Count pattern | Root cause | Recommended fix |
|----------|------------------|---------------|------------|-----------------|
| Stale reconcile | `stale_running_reconciled` | Many rows, same message, many agents | Worker/dashboard died; DB rows stayed `running` until boot reconcile | Expected after crash; use **Error summary** not raw row count; restart `li-agents-async-swarm` + dashboard |
| SDK slot timeout | `sdk-session.lock: timeout` | Few per agent | All 5 slots held (orphan swarm or long runs) | `./scripts/sweep-hung-agents.sh --apply`; ensure one async-swarm unit; raise `LI_SDK_MAX_CONCURRENT` only if quota allows |
| Incomplete / no terminal status | `status=incomplete` or missing `finished_at` | Medium | Run interrupted (SIGTERM, OOM, API drop) | `Restart=always` on dashboard; avoid killing swarm during deploy |
| Agent failures | Agent-specific stderr in `error` | Low–medium | Task/tooling failure | Fix per agent; inspect `GET /api/runs/:id` |
| Restart storm duplicates | Many `stale_running_reconciled` at same `finished_at` minute | Spike on each dashboard restart | Repeated reconcile without clearing old `running` rows first | Run reconcile once per boot (already); display uses dedupe |

## Duplicate rows vs duplicate failures

- **Not duplicate DB rows**: each `run_id` is unique; reconcile **updates** existing rows to `error`, it does not insert copies.
- **Duplicate noise**: many agents each left a stale `running` row → one reconcile pass marks all → 20–30 identical errors. Dashboard now **dedupes** `stale_running_reconciled` to one row per agent in history/activity and exposes **`GET /api/runs/errors-summary`**.

## Metrics that lied: 31 “running” vs 5 SDK cap

`active_run_count` used to be `max(merged running rows, sdk_sessions_active)`, so orphan DB `running` rows inflated the metric. Fixed: **`active_run_count` = SDK slots in use** (capped). See [concurrent-runs-troubleshooting.md](./concurrent-runs-troubleshooting.md).

## Prevention checklist

1. Single swarm process: `systemctl --user status li-agents-async-swarm` (only one active).
2. Dashboard survives SIGTERM: reinstall systemd with `Restart=always`.
3. After deploy: `systemctl --user restart li-agents-async-swarm li-agents-dashboard`.
4. Weekly: enable `li-agents-sweep.timer` or run `sweep-hung-agents.sh --apply`.
5. Monitor: `jq '{in_sdk:.active_run_count, registered:.active_runs_registered, slots:.sdk_slots_in_use, max:.sdk_max_concurrent}'` on `/api/runtime`.

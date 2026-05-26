# Concurrent runs vs SDK cap (troubleshooting)

## Symptom

Dashboard or `worker_status` shows **26–31** active runs while `sdk_max_concurrent` is **5** and only five SDK slot files are held.

## What each field means

| Field | Meaning | Can exceed `LI_SDK_MAX_CONCURRENT`? |
|-------|---------|-------------------------------------|
| `active_runs` | Union of async-swarm heartbeat tracks **plus** Supabase `agent_runs` with `status=running` (orphans after worker loss) | Yes |
| `active_runs_registered` | Running tracks from the **worker heartbeat only** (in-process `registerSupervisorRun` / lanes) | Yes — workers register before acquiring a slot |
| `sdk_sessions_active` | In-process SDK depth in the heartbeat process | No (capped by env) |
| `sdk_slots_in_use` | Non-stale files under `data/control-plane/sdk-slots/` | No |
| **`active_run_count`** | **In SDK now** — `min(max(slots, in-process), sdk_max)` | No |

Before 2026-05-26, `active_run_count` used `max(merged running rows, sdk_sessions_active)`, so stale DB `running` rows and many registered-but-waiting tracks inflated the number to 26–31 even though only five slots were held.

## Typical root causes

1. **Stale `agent_runs.status=running`** — worker or dashboard died without finishing runs; merge adds them to `active_runs` until `reconcileStaleRunningAgentRuns()` marks them `error` with `stale_running_reconciled` on dashboard/swarm boot.
2. **Restart storm** — each dashboard SIGTERM/restart reconciles all stale rows at once → many error rows with the same message (use **Error summary** / deduped activity, not raw row count).
3. **Orphan async-swarm** — second `async-swarm.js` process holds slots or leaves stale locks; systemd layout should run **one** `li-agents-async-swarm.service`. Use `./scripts/sweep-hung-agents.sh --apply` or the sweep timer.
4. **Duplicate swarm + dashboard autostart** — avoid `LI_AUTO_START_ASYNC_SWARM=1` on dashboard when `li-agents-async-swarm` is installed (`LI_SWARM_EXTERNAL=1`).

## What to do

1. Confirm slots: `curl -s :9477/api/runtime | jq '{active_run_count, active_runs_registered, sdk_slots_in_use, sdk_max_concurrent, active_runs: (.active_runs|length)}'`
2. Restart cleanly: `systemctl --user restart li-agents-async-swarm li-agents-dashboard`
3. Reconcile: stale rows flip to `error` automatically; see `GET /api/runs/errors-summary`
4. Prevent dashboard staying down after SIGTERM: reinstall units (`Restart=always` on dashboard) via `scripts/install-agents-swarm-systemd.sh`

See also [sdk-slot-policy.md](./sdk-slot-policy.md), [dashboard-db-contract.md](./dashboard-db-contract.md), [hung-agent-sweep.md](./hung-agent-sweep.md).

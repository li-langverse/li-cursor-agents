# Recent error learnings (reporting-only)

Generated from grouped `agent_runs` analysis. **No rows are deleted or merged in storage** — use `GET /api/errors/summary` or `./scripts/report-swarm-errors.sh` for deduped *counts* only.

## Why ~26–31 “running” vs SDK cap 5

| Signal | What it counts | Typical value |
|--------|----------------|---------------|
| `active_runs` (list length) | Heartbeat `registerSupervisorRun` tracks **plus** DB `status=running` orphans merged for display | Can be 20–30+ |
| `active_runs_registered` | Running rows in the **worker heartbeat only** | Often 15–25 while pool is busy |
| `sdk_slots_in_use` | Cross-process lock files under `data/control-plane/sdk-slots/` | **≤ `LI_SDK_MAX_CONCURRENT` (5)** |
| **`active_run_count`** | **In SDK now** — `min(max(slots_in_use, in-process), cap)` | **≤ 5** |

Workers call `registerSupervisorRun` at the start of `runAgent`, **before** acquiring an SDK slot. Many continuous worker loops can therefore show as “running” while blocked on `sdk-session.lock`. That is expected; only slot files reflect true Cursor SDK concurrency.

Stale DB rows (`status=running` after a crash) inflate `active_runs` until `reconcileStaleRunningAgentRuns()` marks them `error` with `stale_running_reconciled` on boot — each row stays in the DB; reporting groups them.

See [concurrent-runs-troubleshooting.md](./concurrent-runs-troubleshooting.md).

## Error taxonomy (typical 24h production)

| Category | Pattern | Likely cause | Action |
|----------|---------|--------------|--------|
| `stale_running_reconciled` | High count, many agents, same minute `finished_at` | Dashboard/swarm SIGTERM or crash; reconcile on restart | Normal after incident; check `active_run_count` vs slots, not raw error row count |
| `sdk_slot_timeout` | `sdk-session.lock: timeout` | All 5 slots held (long runs or orphan swarm) | `sweep-hung-agents.sh --apply`; one `li-agents-async-swarm` unit |
| `(no error message)` | `status=error`, empty `error` | Legacy or interrupted persist | Inspect `run_id` via `/api/runs/:id` |
| Agent-specific | Unique string per agent | Task/tool failure | Fix agent prompt or deps |

## Reporting tools (read-only)

```bash
./scripts/report-swarm-errors.sh 1d    # JSON grouped by category + agent
curl -s :9477/api/errors/summary?range=7d | jq '.categories[0]'
```

Response shape:

- `total_errors` — raw row count in range
- `categories[].count` — rows in that error category
- `categories[].by_agent[]` — per-agent count + `example_run_ids` (up to 5 samples; all rows remain in DB)

## Prevention

1. Single async-swarm: `systemctl --user status li-agents-async-swarm`
2. Dashboard `Restart=always` after reinstalling systemd units
3. Monitor: `jq '{in_sdk:.active_run_count, slots:.sdk_slots_in_use, listed:(.active_runs|length)}' <<<"$(curl -s :9477/api/runtime)"`

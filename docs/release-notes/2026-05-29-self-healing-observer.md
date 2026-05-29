# Release notes: self-healing observer (sprint)

## Summary

Strengthens the programmatic swarm observer so routine failures classify correctly, `workspace_sweeper` fires on real dirty-workspace signals, and the dashboard exposes when auto-heal is exhausted.

## Changed

- `src/observer/classify-failure.ts` — classifies run stderr (SDK auth, preflight script, dirty repo, git conflict); detects stale briefing and failed `preflight_runs`.
- `src/observer/remediate.ts` — fixes `workspace_dirty_sweep` detection (`dirty_count` / `dirty_repos`, not `repos_needing_sweep`); dispatches `swarm_observer` on preflight/handoff backlog; sweeper on repeated `repo_dirty` runs.
- `src/observer/swarm-health.ts` — findings for stale briefing, preflight failure, handoff backlog, repeated failure patterns; `swarm_degraded` + `degraded_reasons` on report.
- `src/observer/degraded.ts` — shared `computeSwarmDegraded()` used by supervisor and API.
- `src/ops-server.ts` — `/api/swarm/health` includes `observer_retry_counts` and `briefing_generated_at`.
- Tests: `classify-failure.test.ts`, `remediate.test.ts`, `degraded.test.ts`, extended `swarm-health.test.ts`.

## Not changed

- Async swarm auto-start still requires `LI_AUTO_START_ASYNC_SWARM=1` (watchdog unchanged).
- No merge to `main`; PR review required.

## Env

| Variable | Default | Purpose |
|----------|---------|---------|
| `LI_OBSERVER_BRIEFING_STALE_MS` | 6h | Stale `generated_at` finding |
| `LI_OBSERVER_HANDOFF_BACKLOG_THRESHOLD` | 4 | Open handoffs → meta observer |

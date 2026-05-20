# Release notes: swarm resilience + watchdog

## Summary

Adds a control-plane watchdog, supervisor tick error recovery, optional parallel cap for run-all, and declares missing `pg` / MCP npm dependencies so `npm ci && npm run build` works on fresh clones.

## Agent continuation

1. **Read** `scripts/watch-control-plane.sh`, `LI_SWARM_MAX_PARALLEL`, `LI_SUPERVISOR_MAX_TASKS` in `.env.example`.
2. **Run** `npm run agents:keep` in one terminal and `npm run agents:watch` in another (or set `LI_SWARM_MAX_PARALLEL=8` if Cursor rate-limits concurrent SDK runs).
3. **Then** confirm `curl -sf http://127.0.0.1:9477/api/runtime` shows `supervisor_loop_running: true` after killing the dashboard PID once (watchdog should restart).
4. **Blocked on** human PR merge; Docker still required for default Supabase store.

## Changed

- `scripts/watch-control-plane.sh` — health + supervisor loop watchdog; restarts via `keep-agents-running.sh`.
- `src/supervisor/loop.ts` — tick failures log and continue instead of exiting the supervisor process.
- `src/control-plane/runtime.ts`, `parallel-pool.ts` — `LI_SWARM_MAX_PARALLEL` throttles `/api/swarm/run-all` spawns (0 = unlimited).
- `src/ops-server.ts` — log `uncaughtException` / `unhandledRejection` without exiting.
- `package.json` — `pg`, `@modelcontextprotocol/sdk`, `agents:watch` script.
- `scripts/env.defaults.sh`, `.env.example` — document new env vars.

## Not changed

- Supervisor still runs up to `LI_SUPERVISOR_MAX_TASKS` agents **sequentially** per tick (not parallel within a tick).
- Cursor SDK concurrent session limits (account-side) — use `LI_SWARM_MAX_PARALLEL` to match your quota.
- `benchmarks` preflight scripts and Cursor Automations catalog.

## Breaking / Security / Performance / Downstream

| Area | Notes |
|------|--------|
| Breaking | N/A — new env vars are optional; default `LI_SWARM_MAX_PARALLEL=0` preserves prior run-all behavior. |
| Security | N/A — watchdog only binds localhost dashboard port. |
| Performance | Capping parallel spawns reduces peak CPU/API usage when set. |
| Downstream | None — disk/Supabase control plane unchanged. |

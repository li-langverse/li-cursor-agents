# Release notes: swarm monitor, local-ci auto-clone, richer SDK errors

## Summary

Adds a long-running monitor script, auto-clones `li-local-ci` when missing (and wires it into `agents:keep`), tightens Supabase/Dashboard health probes for multi-hour runs, and surfaces Cursor SDK error metadata instead of a bare `"Error"` string.

## Agent continuation

1. **Read** `.env.example` (`LI_MONITOR_*`, `LI_AUTO_CLONE_LOCAL_CI`), `scripts/monitor-swarm-long.sh`, `scripts/ensure-li-local-ci.sh`, `CHANGELOG.md` Unreleased.
2. **Run** `npm run db:ensure` once if store is Supabase, then `npm run agents:keep` in one terminal; optional `npm run agents:monitor` (or `nohup npm run agents:monitor >>logs/monitor-swarm.log 2>&1 &`) for 2–3h observation.
3. **Then** confirm `curl -sf http://127.0.0.1:${LI_AGENT_DASHBOARD_PORT:-9477}/api/runtime` each interval in the monitor log; set `LI_MONITOR_SUPABASE_ENSURE=1` if containers die mid-run (re-runs `ensure-supabase.sh`).
4. **Blocked on** valid `CURSOR_API_KEY` for real SDK runs; monitor’s `LI_MONITOR_SDK_SMOKE=1` uses quota.

## Changed

- `scripts/monitor-swarm-long.sh` — project-scoped Docker container count; REST check uses `supabase status` API URL; optional migration dry-run, optional `ensure-supabase` on failure.
- `scripts/ensure-li-local-ci.sh`, `scripts/keep-agents-running.sh` — clone-on-miss + non-fatal warn.
- `package.json` — `agents:monitor`.
- `.gitignore` — `supabase/.temp/`.
- `src/agent-output-format.ts`, `src/agent-output-format.test.ts`, `src/backends/cursor-sdk-backend.ts` — structured error fields + tests.
- `src/e2e/dashboard-api.e2e.ts` — supervisor start idempotency.

## Not changed

- Cursor Cloud agent quotas, model routing, or `@cursor/sdk` semantics.
- `benchmarks` repo preflight scripts and org merge queue automation.
- Default control-plane store remains Supabase when Docker is available; disk mode unchanged.

## Breaking / Security / Performance / Downstream

| Area | Notes |
|------|--------|
| Breaking | N/A — new scripts and env vars are optional. |
| Security | N/A — `ensure-li-local-ci` clones public `li-langverse/li-local-ci` only; no new secrets. |
| Performance | Long monitor + `LI_MONITOR_SUPABASE_ENSURE=1` can run `supabase start`/`db push`; keep defaults light. |
| Downstream | None — formatted run markdown gains extra error table rows when SDK provides fields. |

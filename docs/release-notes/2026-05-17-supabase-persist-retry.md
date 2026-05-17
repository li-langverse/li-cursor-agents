# Supabase persist reliability (REST retry + probe)

## Summary

Fix `saveControlPlaneState: TypeError: fetch failed` by retrying transient PostgREST errors, coalescing rapid state upserts, normalizing local API URLs, and making `db:probe` / `db:ensure` verify REST (54321) not only Postgres (54322).

## Agent continuation

1. **Read** — `src/db/supabase-retry.ts`, `src/db/rest-health.ts`, `logs/keep-agents.log` for persist errors.
2. **Run** — `npm run db:ensure`, `npm run db:probe` (must show `REST ... OK`), `npm test`, optional `LI_E2E_DB=1 npm test -- dist/db/rest-health.test.js`.
3. **Then** — restart stack `npm run agents:keep`; supervisor should not exit on persist.
4. **Blocked on** — Docker / `supabase start` if REST probe fails after 30s.

## Changed

- `src/db/supabase-retry.ts`, `supabase-url.ts` — transient detection, exponential backoff, client reset.
- `src/db/control-plane.ts` — wrap state load/save with retry.
- `src/db/persist.ts` — coalesce concurrent `persistControlPlaneState` (latest wins).
- `src/db/rest-health.ts`, `src/cli/db-probe.ts` — REST probe before SQL.
- `scripts/ensure-supabase.sh` — wait up to 30s for PostgREST HTTP 200.
- Tests: `supabase-retry.test.ts`, `persist-coalesce.test.ts`, `rest-health.test.ts` (e2e when `LI_E2E_DB=1`).

## Not changed

- `lic` compiler, Lean, benchmarks catalog.
- Agent briefing logic or heap scoring.
- Cloud / hosted Supabase deployment (local stack focus).

## Breaking

N/A.

## Security

N/A — same service-role upsert path; retries do not widen SQL surface.

## Performance

N/A — coalescing reduces duplicate REST upserts during supervisor ticks.

## Downstream

N/A — `li-cursor-agents` only.

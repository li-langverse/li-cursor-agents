# Control-plane store, cooldown dedup, agent output formatting

## Summary

`LI_CONTROL_PLANE_STORE` selects a single Supabase or disk backend (default supabase), supervisor cooldown no longer bypasses via recommended-agent fallback, and agent runs emit structured markdown with stack traces on errors.

## Agent continuation

1. **Read** `src/db/client.ts`, `src/agent-output-format.ts`, `src/supervisor/loop.ts` (cooldown fallback guard), `scripts/ensure-native-modules.sh`.
2. **Run** `npm run db:ensure`, `npm test`, `npm run agents:keep` (dashboard http://127.0.0.1:9477/).
3. **Then** verify live SDK run for `plan_verifier` if mock-only output looked empty; open/update PR on `feat/agent-heap-control-plane`.
4. **Blocked on** human PR merge; `CURSOR_API_KEY` for non-mock SDK runs.

## Changed

- `src/db/client.ts` — `configuredStore()`, `assertStoreReady()`, `useDiskStore()` / `useSupabaseStore()`; legacy `LI_STACK_SKIP_SUPABASE=1` → disk.
- `src/db/persist.ts`, `src/control-plane/state.ts` — single store path; no supabase-fail-then-disk primary fallback.
- `src/heap/task-queue.ts` — cooldown counts terminal statuses (`finished`, `error`, `incomplete`, `cancelled`).
- `src/supervisor/loop.ts` — skip recommended-agent fallback when `skippedCooldown > 0` (fixes `swarm-handoff.e2e.ts` tick2).
- `src/agent-output-format.ts` + test — metadata, preflight sections, deliverable, error markdown with stack.
- `src/backends/cursor-sdk-backend.ts`, `mock-backend.ts`, `finalize-run.ts`, `runner.ts`, `run-completion.ts`.
- `scripts/ensure-native-modules.sh`, `keep-agents-running.sh`, `env.defaults.sh`, `prompts/plan-verifier.md`.
- Tests: `LI_CONTROL_PLANE_STORE=disk CURSOR_MOCK=1 npm test` — 63 pass (2 skipped).

## Not changed

- `lic` compiler, Lean proofs, `li-tests` manifest, and PH-* phase gates in `lic`.
- `li-local-ci` workflow YAML (separate repo/PR).
- GitHub org branch protection or self-merge policy.
- Benchmarks dashboard ingest thresholds.

## Breaking

N/A — default store is supabase; set `LI_CONTROL_PLANE_STORE=disk` or `LI_STACK_SKIP_SUPABASE=1` for disk-only dev without Docker.

## Security

N/A — no new secrets; `.env` / `.env.supabase` remain gitignored.

## Performance

N/A — no benchmark catalog changes.

## Downstream

N/A — agent-kit manifest pin unchanged in this slice.

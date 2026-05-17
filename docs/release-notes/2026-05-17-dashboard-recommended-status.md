# Dashboard: Recommended vs Queued + supervisor state IPC

## Summary

Fix misleading dashboard status where every briefing agent showed **Queued** while **Running** stayed at zero; mirror supervisor state to `state.json` when Supabase persist fails so the parent dashboard sees `current_supervisor_agent`.

## Agent continuation

1. **Read** — `web/app.js` `agentStatusMap`, `src/control-plane/state.ts` `saveState` / `reloadStateIfNewer`, `logs/keep-agents.log` for `persist state failed` or `fetch failed`.
2. **Run** — `npm test`; `npm run smoke:dashboard`; open dashboard → stat card **Recommended** (not Queued); during supervisor tick one agent should show **Running**.
3. **Then** — if Running still stuck at 0 during ticks, verify Supabase reachable (`npm run db:probe`) and supervisor subprocess alive (`GET /api/runtime`).
4. **Blocked on** — human merge of PR; no `lic` / compiler changes in this slice.

## Changed

- `web/app.js`, `web/index.html`, `web/style.css` — status `recommended` (was `queued` for briefing/heap presence); cooldown checked before recommended.
- `src/control-plane/state.ts` — IPC mirror `state.json` on every `saveState` when store=supabase; catch persist errors; reload merges disk mirror after DB.
- `src/control-plane/runs-catalog.ts` — agent detail status `recommended`; reload state when supervisor subprocess running.
- `src/control-plane/build-report.ts` — catch report persist failures.
- `src/control-plane/state-reload.test.ts` — supabase mirror reload test.
- `src/e2e/dashboard-live-runs.e2e.ts` — expect `recommended` post-run.

## Not changed

- Supervisor tick interval, `LI_SUPERVISOR_MAX_TASKS`, or heap scoring (`src/heap/`).
- `lic` compiler, Lean proofs, `li-tests` manifest.
- Briefing content / `agent-briefing.py` in benchmarks (only dashboard semantics).

## Breaking

N/A — UI label change only; API agent detail `status` value `queued` → `recommended`.

## Security

N/A — no auth or trust boundary changes.

## Performance

N/A — one extra `state.json` write per supervisor state save (small JSON).

## Downstream

N/A — `li-cursor-agents` only.

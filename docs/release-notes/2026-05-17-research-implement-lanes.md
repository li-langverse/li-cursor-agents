# Research and implement async lanes

## Summary

Adds always-on research and implement lane loops with goal registry, session-first scheduling, handoff placement gate, and cross-process SDK locking.

## Agent continuation

1. **Read** `config/research-goals.yaml`, `src/lanes/research-lane.ts`, `src/lanes/implement-lane.ts`, `src/handoffs/post-run.ts`.
2. **Run** `LI_CONTROL_PLANE_STORE=disk CURSOR_MOCK=1 npm test`; smoke `npm run agents:research-lane -- --once --mock`.
3. **Then** wire dashboard lane toggles; `li-ecosystem-context` MCP; `agent-briefing.py` scorecards (phase C).
4. **Blocked on** human PR merge; optional GHA cron workflows.

## Changed

- `config/research-goals.yaml`, `src/research-goals/load-goals.ts`
- `src/research-sessions/session-lifecycle.ts`
- `src/lanes/*`, `src/cli/research-lane.ts`, `src/cli/implement-lane.ts`
- `src/handoffs/placement-validator.ts`, `post-run.ts`; `claimNextHandoff` agent-specific statuses
- `src/backends/sdk-session-lock.ts` — file lock + in-process chain
- `src/runner.ts` — `applySwarmPostRunEffects` after finalize
- Tests: `load-goals.test.ts`, `placement-validator.test.ts`, `research-lane.test.ts`, `e2e/async-handoff.e2e.ts`
- `package.json` — `agents:research-lane`, `agents:implement-lane`

## Not changed

- GHA scheduled audits, briefing `swarm_scorecard` / `provability_scorecard` (phase C).
- `li-ecosystem-context` MCP tools (`record_placement_decision`, session MCP).
- `lic` compiler, benchmarks ingest, supervisor heap (lanes are parallel path).

## Breaking

N/A

## Security

N/A — lanes respect existing `GH_TOKEN` / PR-only workflow.

## Performance

N/A — default research interval 90s, implement 120s (`LI_*_LANE_INTERVAL_MS`).

## Downstream

Run both lanes alongside dashboard: `LI_RESEARCH_LANE_ENABLED=1 LI_IMPLEMENT_LANE_ENABLED=1 npm run agents:research-lane` (separate terminal).

# Dashboard lanes, briefing scorecards, ecosystem MCP

## Summary

Exposes async research/implement lanes on the dashboard API, enriches briefings with swarm scorecards, adds `li-ecosystem-context` MCP for placement/session tools, and makes run-all use handoff phases by default.

## Agent continuation

1. **Read** `src/ops-server.ts` lane routes, `src/briefing/swarm-scorecard.ts`, `src/mcp/li-ecosystem-context-mcp.ts`, `docs/ecosystem/agent-automations.md`.
2. **Run** `LI_CONTROL_PLANE_STORE=disk CURSOR_MOCK=1 npm test`; dashboard `npm run dashboard` → toggle Research/Implement lanes.
3. **Then** GHA cron workflows for briefing-only refresh; benchmarks `agent-briefing.py` scorecard parity in production repo.
4. **Blocked on** human PR merge.

## Changed

- `src/ops-server.ts` — `/api/lanes/*`, scorecard on `/api/status`
- `src/lanes/lane-runtime.ts`, `maintenance-lane.ts`, `run-handoff-phases.ts`
- `src/control-plane/runtime.ts` — `runAllAgentsNow` handoff phases
- `web/index.html`, `web/app.js` — lane footer buttons
- `fixtures/e2e-benchmarks/scripts/agent-briefing.py` — fixture scorecard keys
- `package.json` — `@modelcontextprotocol/sdk`, `agents:maintenance-lane`

## Not changed

- Production `benchmarks/scripts/agent-briefing.py` (only fixture updated).
- GHA workflow YAML (still pending).
- `lic` compiler / `li-tests`.

## Breaking

N/A — `LI_SWARM_HANDOFF_PHASES=0` restores parallel run-all.

## Security

N/A

## Performance

N/A

## Downstream

Wire production benchmarks briefing script to emit the same scorecard keys as maintenance lane.

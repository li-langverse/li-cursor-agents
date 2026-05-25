# Swarm recommendations, goal scaffolds in implement lane, handoff hygiene

## Summary

Supervisor and enrich paths merge handoff/scorecard signals into `recommended_agents`; implement lane injects full goal scaffold markdown; maintenance fails invalid handoffs; research runs audit `north_star_fit` in handoff digests.

## Agent continuation

1. **Read** `src/briefing/swarm-recommendations.ts`, `src/handoffs/goal-scaffold-prompt.ts`, `src/handoffs/handoff-hygiene.ts`.
2. **Run** `LI_CONTROL_PLANE_STORE=disk CURSOR_MOCK=1 npm test`.
3. **Then** merge PR #5; enable supervisor with enriched briefing each tick.
4. **Blocked on** human PR merge.

## Changed

- `src/briefing/swarm-recommendations.ts` — `mergeSwarmRecommendations`
- `src/supervisor/loop.ts` — `enrichBriefingObject` before heap queue
- `src/lanes/implement-lane.ts` — `buildGoalScaffoldBlock` in handoff prompt
- `src/lanes/maintenance-lane.ts` — `failHandoffsMissingNorthStar`
- `src/preflight/implementation-queue-handoffs.ts` — handoffs → `implementation_queue`
- `src/control-plane/run-completion.ts` — research handoff `north_star_fit` gap

## Not changed

- `@cursor/sdk` has no `mode` on `Agent.send` — still system-prompt prefixes in `sdk-mode.ts`.
- `lic` product code for CAD/game (scaffolds only).

## Breaking

N/A

## Security

N/A

## Performance

N/A

## Downstream

Push `feat/agent-heap-control-plane`; review with benchmarks PR #32.

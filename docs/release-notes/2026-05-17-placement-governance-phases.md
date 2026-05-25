# Placement governance and phased run-all

## Summary

Adds governance validation for package placement decisions, phased run-all with explicit phase list, trusted.lean completion audit, handoff JSON schema, and briefing snapshot MCP tool.

## Agent continuation

1. **Read** `src/handoffs/placement-governance.ts`, `src/lanes/run-handoff-phases.ts`, `schemas/agent-handoff.v1.json`.
2. **Run** `LI_CONTROL_PLANE_STORE=disk CURSOR_MOCK=1 npm test`.
3. **Then** Phase E auto-merge dry-run; CAD/game v1 scaffolds via `game_engine_ux` / `cad_fundamentals` goals.
4. **Blocked on** human PR merge.

## Changed

- `src/handoffs/placement-governance.ts`, `placement-governance.test.ts`
- `src/mcp/li-ecosystem-context-mcp.ts` — `get_briefing_snapshot`, governance on `record_placement_decision`
- `src/lanes/run-handoff-phases.ts`, `src/e2e/run-all-handoff.e2e.ts`
- `src/control-plane/run-completion.ts`, `finalize-run.ts`
- `package.json` — `test:e2e` includes run-all-handoff

## Not changed

- Full `list_org_repos` / `search_repo_tree` MCP (future).
- `lic` CAD/game v1 code (research goals only).
- Auto-merge (`LI_AUTO_MERGE`) wiring in `pr_merger`.

## Breaking

N/A

## Security

Placement validator blocks unapproved `trusted.lean` placement paths.

## Performance

N/A

## Downstream

Open/update PR on `feat/agent-heap-control-plane` for full async handoff stack review.

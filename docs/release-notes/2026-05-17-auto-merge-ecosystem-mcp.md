# Auto-merge gate, ecosystem MCP, implementation handoffs

## Summary

Adds `LI_AUTO_MERGE` dry-run/real merge gating for `pr_merger`, trusted.lean merge approval env, read-only ecosystem MCP repo/package tools, and research-goal implementation handoffs with v1 scaffolds.

## Agent continuation

1. **Read** `src/merge/auto-merge-gate.ts`, `src/mcp/ecosystem-briefing-tools.ts`, `src/handoffs/implementation-handoff.ts`, `config/goal-scaffolds/`.
2. **Run** `cd li-cursor-agents && LI_CONTROL_PLANE_STORE=disk CURSOR_MOCK=1 npm test`.
3. **Then** enable `LI_AUTO_MERGE=1` on supervisor host only after human confirms merge queue; set `LI_TRUSTED_MERGE_APPROVED=1` for trusted.lean PRs.
4. **Blocked on** human PR merge for PR #5 (`feat/agent-heap-control-plane`).

## Changed

- `src/merge/auto-merge-gate.ts`, `auto-merge-gate.test.ts` — `evaluateNextMerge`, `buildAutoMergeInstruction`
- `src/preflight.ts`, `src/supervisor/loop.ts` — pr_merger auto-merge blocks
- `src/mcp/li-ecosystem-context-mcp.ts`, `ecosystem-briefing-tools.ts`, `ecosystem-briefing-tools.test.ts`
- `src/handoffs/implementation-handoff.ts`, `post-run.ts`, `placement-validator.ts`
- `config/goal-scaffolds/game_engine_ux.md`, `cad_fundamentals.md`
- `.env.example` — `LI_AUTO_MERGE`, `LI_TRUSTED_MERGE_APPROVED`
- `CHANGELOG.md`

## Not changed

- `lic` compiler, `li-tests`, benchmarks ingest scripts.
- Real `pr-auto-merge.py` behavior in benchmarks repo (agents only receive instructions).
- PR #5 merge / self-merge policy.
- Full CAD/game engine product code (scaffolds + handoffs only).

## Breaking

N/A — new env gates are opt-in (`LI_AUTO_MERGE=1`).

## Security

- Governance/roadmap merges blocked by auto-merge evaluator.
- `trusted.lean` merge requires `LI_TRUSTED_MERGE_APPROVED=1` when briefing/PR files indicate touch.

## Performance

N/A — MCP tree search capped by `max_results` (default 20).

## Downstream

Push branch `feat/agent-heap-control-plane`; keep PR #5 open for review.

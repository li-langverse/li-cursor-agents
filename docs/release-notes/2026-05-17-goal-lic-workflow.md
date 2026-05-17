# Goal implementation → `lic` workflow

## Summary

`code_implementer` goal handoffs clone **lic** via `workflowRepo`, with path allowlists, goal PR templates, `fixtures/lic-workflow` for mock runs, and `repo: lic` on briefing implementation_queue rows.

## Agent continuation

1. **Read** — `src/handoffs/goal-workflow.ts`, `src/lanes/implement-lane.ts`, `config/goal-scaffolds/*.md`, lic `docs/ecosystem/game-engine-ux.md` + `cad-fundamentals.md`.
2. **Run** — `LI_CONTROL_PLANE_STORE=disk CURSOR_MOCK=1 npm test` in li-cursor-agents; claim a goal handoff and `npm run agents:implement-lane` with `LI_REPO_WORKFLOW_OPEN_PR=1` on a supervisor host.
3. **Then** — merge PR #5 (li-cursor-agents) and open lic PR from `feat/goal-scaffold-v1-docs`; wire benchmarks `swarm-audit-refresh` dispatch if token present.
4. **Blocked on** — human PR merge; production `LI_AUTO_MERGE=1`; `@cursor/sdk` send-time `mode` (use `sdk-mode.ts` prefixes).

## Changed

- `src/handoffs/goal-workflow.ts` — `resolveGoalImplementationRepo`, `buildGoalWorkflowExtra`, `GOAL_LIC_PATHS`
- `src/handoffs/goal-workflow.test.ts`
- `src/types.ts` — `AgentRunOptions.workflowRepo`
- `src/runner.ts` — pass `repo` to `beginRepoWorkflowSession`
- `src/lanes/implement-lane.ts` — workflow extra, `workflowRepo`, goal PR env for post-hook
- `fixtures/lic-workflow/` — mock lic clone
- `src/repo-workflow/workspace-session.ts` — `prepareFixtureLicClone`
- `src/preflight/implementation-queue-handoffs.ts` — `repo` on swarm handoff queue items
- `src/e2e/goal-lic-workflow.e2e.ts`
- lic: `docs/ecosystem/game-engine-ux.md`, `docs/ecosystem/cad-fundamentals.md`

## Not changed

- Default `code_implementer` repo for non-goal handoffs remains **li-demo** (`workspace-session.ts`).
- Lean kernel, `trusted.lean`, compiler phases PH-2e/2f.
- benchmarks PR #32 merge; Supabase schema.
- `@cursor/sdk` native agent mode API.

## Breaking

N/A — additive options and docs only.

## Security

N/A — no new trusted surface; path allowlist is prompt guidance only.

## Performance

N/A — no benchmark or codegen change.

## Downstream

- **lic** PR: feature branch `feat/goal-scaffold-v1-docs` with ecosystem docs.
- **benchmarks**: optional `repository_dispatch` unchanged.

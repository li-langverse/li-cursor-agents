# Guaranteed push post-hook + li-demo fixture tests

## Summary

Code-changing agents (`docs_maintainer`, `ci_maintainer`, numerics) now get an automatic commit/push/PR step after each run when the isolated workspace has uncommitted changes; li-demo fixture tests lock the behavior in CI.

## Agent continuation

1. **Read** `src/repo-workflow/post-hook.ts`, `workspace-session.ts`, `fixtures/li-demo-workflow/README.md`.
2. **Run** `LI_CONTROL_PLANE_STORE=disk CURSOR_MOCK=1 npm test` (includes `post-hook.test.ts`, `repo-workflow-push.e2e.ts`).
3. **Then** production: ensure `GH_TOKEN` in `../.env.github`; unset `LI_REPO_WORKFLOW_SKIP_PUSH` for real push; default repos `li-demo` (docs/ci) and `lic` (numerics).
4. **Blocked on** human PR merge.

## Changed

- `src/runner.ts` — `beginRepoWorkflowSession` + `commitPushOpenPrAfterAgentRun` after agent run.
- `src/repo-workflow/pr.ts` — allow local commit when `skipPush` without `GH_TOKEN`.
- `src/agents/registry.ts` — `guaranteedPush: true` on docs/ci/numerics agents.
- `src/backends/mock-backend.ts` — writes touch file under workspace for mock tests.
- Tests: `src/repo-workflow/post-hook.test.ts`, `src/e2e/repo-workflow-push.e2e.ts`.

## Not changed

- `agent_kit_maintainer` rollout path (still pre-LLM `rolloutAgentKitPrs`).
- `pr_branch_opener` / `pr_alignment` (separate PR hygiene agents).
- `lic` compiler and `li-tests`.

## Breaking

N/A — opt-out via `LI_REPO_WORKFLOW_SKIP_PUSH=1`.

## Security

N/A — uses existing `GH_TOKEN`; PR-only branch policy unchanged.

## Performance

N/A

## Downstream

N/A

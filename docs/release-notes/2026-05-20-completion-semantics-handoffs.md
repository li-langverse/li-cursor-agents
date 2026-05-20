# Completion semantics, handoffs, PR dedup, classified git errors

## Summary

Agent runs now distinguish production vs verify/digest-only completion, pass supervisor handoffs within a tick, reuse open PRs instead of duplicating, and surface actionable git auth errors when post-hook push fails.

## Agent continuation

1. **Read** `src/control-plane/run-audit-context.ts`, `src/control-plane/run-completion.ts`, `src/supervisor/handoff.ts`, `src/repo-workflow/git-errors.ts`.
2. **Run** `LI_AGENT_VERIFY_MODE=1 npm run verify:agents:live` — expect `finished` (not false incomplete) for repo-workflow agents; report `logs/agent-matrix-live-report.json`.
3. **Then** production: `npm run smoke:li-demo:live` with `LI_REPO_WORKFLOW_SMOKE=1` reuses open PR on same branch; supervisor ticks pass handoff blocks to subsequent agents.
4. **Blocked on** Human merge of duplicate li-demo PRs #7–#9 if still open.

## Changed

- `LI_AGENT_VERIFY_MODE=1` — verify completion mode (digest OK without PR).
- `LI_REPO_WORKFLOW_SKIP_PUSH=1` without smoke → `digest_only` mode.
- `LI_REPO_WORKFLOW_SMOKE=1` — stable PR title for li-demo smoke.
- `auditRunCompletion` — hard `gaps` vs informational `notes`; post-hook push failure → `error` status.
- `statusForTaskCooldown` — verify/digest incomplete does not block queue cooldown as failure.
- `buildHandoffInstruction` — prior agents in same supervisor tick.
- `findOpenPrForBranch` + reuse in `commitPushOpenPr`.
- `classifyGitRemoteError` for cursor[bot] 403 and duplicate PR.

## Not changed

- **lic** compiler, benchmarks catalog thresholds, merge-approved automation.
- **Agent prompts** content (orchestrator, docs-maintainer bodies) — only runtime semantics and supervisor injection.
- **Supabase schema** — no migration.

## Breaking

N/A — new env vars optional; default behavior stricter only when post-hook push fails (now `error` instead of silent `finished`).

## Security

N/A — no new secrets; still uses `GH_TOKEN` / `CURSOR_API_KEY`.

## Performance

N/A — handoff text adds small prompt prefix per agent in multi-task ticks.

## Downstream

- Dashboard may show `incomplete` lifecycle for production hard-gap runs (intentional).
- Close duplicate li-demo smoke PRs after validation.

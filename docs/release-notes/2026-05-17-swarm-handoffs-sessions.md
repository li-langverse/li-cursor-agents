# Swarm handoffs, research sessions, and SDK modes

## Summary

Adds DB/disk handoff and research-session stores, wires swarm mandate + handoffs + session continuation into agent prompts, registers four new agents, and splits implement post-hook into commit+push vs open-PR-on-demand.

## Agent continuation

1. **Read** `supabase/migrations/20260517150000_swarm_handoffs_sessions.sql`, `src/handoffs/handoff-store.ts`, `src/preflight/swarm-context.ts`, `src/agents/sdk-mode.ts`.
2. **Run** `LI_CONTROL_PLANE_STORE=disk CURSOR_MOCK=1 npm test`; apply migration with `npm run db:ensure` when using Supabase.
3. **Then** implement research/implement lanes (plan A0–B), `record_placement_decision` MCP, and `config/research-goals.yaml`.
4. **Blocked on** lane schedulers + GHA cron (phase C); human merge of this PR.

## Changed

- `supabase/migrations/20260517151000_swarm_handoffs_sessions.sql` — `research_sessions`, `research_session_steps`, `agent_handoffs` (renamed from `20260517150000` — version collided with `interventions_latest`).
- `supabase/migrations/20260517152000_research_sessions_hypotheses.sql` — adds `research_sessions.hypotheses` jsonb (required by research lane).
- `src/handoffs/*`, `src/research-sessions/*`, `src/swarm/mandate.ts`, `config/swarm-mandate.md`.
- `src/preflight/swarm-context.ts`, `src/preflight.ts`, `src/runner.ts` — mandate, handoffs, sessions, SDK mode prefix.
- `src/agents/registry.ts`, `src/types.ts` — `package_architect`, `goal_researcher`, `proof_gap_researcher`, `stdlib_researcher`; `cursorSdkMode` on plan/debug agents.
- `src/repo-workflow/pr.ts`, `post-hook.ts` — `openPr=false`; `LI_REPO_WORKFLOW_OPEN_PR=1` for implement agents.
- `src/heap/coordinators.ts` — map new leaves under governance/ecosystem coordinators.
- Tests: `handoff-store.test.ts`, `sdk-mode.test.ts`, `session-store.test.ts`, `post-hook` PR rhythm.

## Not changed

- Research/implement lane loops and dashboard toggles (not in this slice).
- `li-ecosystem-context` MCP / `packages/placement-validator.ts`.
- `lic` compiler, `li-tests`, `trusted.lean`, benchmarks ingest.

## Breaking

N/A — disk fallback when `!dbEnabled()`; implement agents no longer open PR every run unless `LI_REPO_WORKFLOW_OPEN_PR=1`.

## Security

N/A — handoff JSON in Supabase uses existing RLS/service-role pattern; no new secrets.

## Performance

N/A — one extra async prompt block per run (handoff/session list).

## Downstream

After merge: run `npm run db:ensure` on hosts with Supabase; document `LI_REPO_WORKFLOW_OPEN_PR` in `.env.example` follow-up.

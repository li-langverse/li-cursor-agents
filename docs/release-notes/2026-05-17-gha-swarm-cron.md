# GHA scheduled swarm maintenance and audit

## Summary

Adds GitHub Actions cron workflows that refresh fixture briefings and scorecards without Cursor SDK, plus a weekly handoff audit smoke job.

## Agent continuation

1. **Read** `.github/workflows/swarm-maintenance-cron.yml`, `swarm-audit-cron.yml`, `docs/ecosystem/agent-automations.md`.
2. **Run** `npm test` locally; on GHA: workflow_dispatch both workflows once after merge.
3. **Then** wire production `benchmarks` scripts into the same scorecard keys; set `LI_BENCHMARKS_DISPATCH_TOKEN` for cross-repo dispatch.
4. **Blocked on** human PR merge.

## Changed

- `.github/workflows/swarm-maintenance-cron.yml` — 12h `agents:maintenance-lane --once`
- `.github/workflows/swarm-audit-cron.yml` — weekly tests + briefing key assert
- `AGENTS.md` — commit+push every verified slice
- `README.md`, `docs/ecosystem/agent-automations.md`

## Not changed

- `lic` / production `benchmarks` audit scripts (dispatch only, optional secret).
- LLM agents in GHA (still forbidden by default).

## Breaking

N/A

## Security

Optional `LI_BENCHMARKS_DISPATCH_TOKEN` — repository secret only; never in logs.

## Performance

N/A — bounded npm test subset on weekly audit job.

## Downstream

benchmarks repo: add `repository_dispatch` handler for `swarm-audit-refresh` if dispatch is used.

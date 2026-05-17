# Production briefing enrich + swarm-audit-refresh dispatch

## Summary

Adds `briefing:enrich` CLI for live swarm scorecards on benchmarks `agent-briefing.json`, `handoff_audit` for missing `north_star_fit`, and a benchmarks GHA handler for `repository_dispatch` type `swarm-audit-refresh`.

## Agent continuation

1. **Read** `src/briefing/enrich-briefing-file.ts`, `src/handoffs/handoff-audit.ts`, `scripts/enrich-briefing-scorecards.sh`.
2. **Run** `cd benchmarks && LI_CURSOR_AGENTS_ROOT=../li-cursor-agents npm run briefing:enrich --prefix ../li-cursor-agents -- --benchmarks-root .` after `python3 scripts/agent-briefing.py`.
3. **Then** merge PRs on `li-cursor-agents` and `benchmarks`; set `LI_BENCHMARKS_DISPATCH_TOKEN` for weekly dispatch.
4. **Blocked on** human merge of feature branches.

## Changed

- `src/cli/enrich-briefing.ts`, `src/briefing/enrich-briefing-file.ts`, `handoff-audit.ts` + tests
- `package.json` — `briefing:enrich`
- `src/lanes/maintenance-lane.ts` — uses `enrichBriefingObject`
- `src/mcp/li-ecosystem-context-mcp.ts` — `handoff_audit` in snapshot
- `.github/workflows/swarm-audit-cron.yml` — asserts `handoff_audit`
- `docs/ecosystem/agent-automations.md`
- **benchmarks** (sibling PR): `scripts/agent-briefing.py`, `.github/workflows/swarm-audit-refresh.yml`

## Not changed

- `lic` compiler, `li-tests`, production merge of `LI_AUTO_MERGE`.
- Ingest of briefing JSON into Pages (still manual/ingest workflow).

## Breaking

N/A

## Security

N/A — read-only enrich; no new trusted surface.

## Performance

Enrich scans ≤200 handoffs; repo tree search unchanged from prior MCP caps.

## Downstream

benchmarks PR must land with or after this repo so `dist/cli/enrich-briefing.js` exists in CI checkout.

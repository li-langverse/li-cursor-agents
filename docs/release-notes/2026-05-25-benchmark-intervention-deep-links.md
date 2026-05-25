# Release notes: 2026-05-25 — benchmark-intervention-deep-links

**Status:** Ready for review  
**Repo:** li-langverse/li-cursor-agents  
**PR:** (branch `feat/benchmark-deep-links`)  
**PH / REQ:** WP9  
**Author:** agent

---

## Summary (one sentence)

Red-benchmark human interventions link to the first failing bench drill-down on the benchmarks dashboard instead of the overview homepage.

## Agent continuation (required)

1. Read: `src/control-plane/interventions.ts` (`redBenchmarks`), benchmarks briefing fields `benchmark_dashboard_base` / `deep_links`
2. Run: `npm run build && node --test dist/control-plane/interventions.test.js`
3. Then: refresh briefing via benchmarks `agent-briefing.py` in deployed environments
4. Blocked on: benchmarks PR merged (deep_links in JSON) for full link fidelity — fallback builds URL from first red `id`

## Changed (specific)

| Area | What | Evidence |
|------|------|----------|
| Interventions | Primary link `…/bench/{first_id}/` | `interventions.test.ts` green |

## Not changed (scope fence)

- Supervisor routing / agent registry — unchanged
- Briefing generation — lives in benchmarks repo

## Breaking changes

None.

## Security

N/A.

## Performance

N/A.

## Downstream

| Repo | Action |
|------|--------|
| benchmarks | ship `agent-briefing.py` WP9 fields |

## CHANGELOG entry (paste into Unreleased)

- **WP9 intervention links:** red benchmark interventions use `/bench/{id}/` deep links — [2026-05-25-benchmark-intervention-deep-links.md](docs/release-notes/2026-05-25-benchmark-intervention-deep-links.md).

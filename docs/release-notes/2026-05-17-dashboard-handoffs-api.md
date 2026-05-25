# Dashboard handoffs panel and swarm API

## Summary

Adds `/api/handoffs`, `/api/swarm/briefing`, overview UI for scorecard and open handoffs, and wires **Refresh briefing** to maintenance-lane enrich.

## Agent continuation

1. **Read** `src/ops-server.ts` (`/api/handoffs`, `/api/swarm/briefing`), `web/app.js` `renderSwarmHandoffsPanel`.
2. **Run** `npm run dashboard` + open Overview → Swarm handoffs; `npm test`.
3. **Then** merge PR #5; enable lanes from footer.
4. **Blocked on** human PR merge.

## Changed

- `src/ops-server.ts` — handoffs + swarm briefing routes; briefing refresh uses `maintenanceLaneTick`
- `src/ops/swarm-briefing-snapshot.ts` + test
- `web/index.html`, `web/app.js`, `web/style.css` — handoffs table, scorecard row, implement tick
- `src/e2e/dashboard-api.e2e.ts`, `scripts/smoke-dashboard-api.mjs`

## Not changed

- `lic` product implementation for CAD/game goals.
- SDK native `mode` parameter (still prompt prefixes).

## Breaking

N/A

## Security

Handoffs API read-only; same store ACL as control-plane disk/Supabase.

## Performance

Handoffs list capped at 100 per request.

## Downstream

None beyond PR #5 review.

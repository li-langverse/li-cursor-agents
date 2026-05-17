# Activity overview with drill-downs

## Summary

Dashboard Activity view lists recent agent runs with expandable input, output, and actions; `/api/activity/recent` supplies summaries for the overview teaser and Activity page.

## Agent continuation

1. **Read** — `src/control-plane/activity-summary.ts`, `web/app.js` (`renderActivityFeed`), `GET /api/activity/recent`.
2. **Run** — `npm run test:dashboard-api`; open dashboard → **Activity** or Overview → **Recent agent actions** → **Full trace** on a run.
3. **Then** — wire live poll on Activity view only if needed; extend e2e to click drill-downs in Playwright if added later.
4. **Blocked on** — full step deltas in list API (detail drawer still loads `/api/runs/:id`).

## Changed

- `src/control-plane/activity-summary.ts` — `toActivityListItem`, slim trace/input for list payloads.
- `src/control-plane/runs-catalog.ts` — `listRecentActivity`.
- `src/ops-server.ts` — `GET /api/activity/recent`.
- `web/index.html`, `web/app.js`, `web/style.css` — Activity nav, action cards, overview teaser.
- `src/e2e/dashboard-api.e2e.ts` — activity recent endpoint assertion.

## Not changed

- Supervisor tick scheduling, cooldown defaults, or subprocess spawn behavior.
- Supabase migration schema (`run_input` / `run_trace` columns unchanged).
- `lic` compiler, Lean gate, or master-plan PH phases.

## Breaking

N/A — additive dashboard API and UI.

## Security

N/A — no new trust surface; same run detail auth as existing `/api/runs/:id` (local ops server).

## Performance

N/A — list endpoint caps at 50 runs; trace slimmed (no deltas, truncated prompts) for list view.

## Downstream

N/A — `li-cursor-agents` only; consumers poll `/api/activity/recent` optional.

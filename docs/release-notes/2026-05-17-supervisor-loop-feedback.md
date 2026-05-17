# Supervisor loop start/stop feedback

## Summary

Dashboard and CLI now show clear confirmation when the supervisor loop starts, ticks, or stops.

## Agent continuation

1. **Read** `src/control-plane/supervisor-activity.ts`, `web/app.js` (`showToast`, `renderSupervisorActivity`).
2. **Run** `npm run stack` → open dashboard → **Start loop** → toast + supervisor log + footer "Loop running"; terminal shows `[supervisor] info:` / `tick:` lines.
3. **Then** `GET /api/supervisor/activity` for programmatic log tail.
4. **Blocked on** nothing for mock mode; real SDK still needs `CURSOR_API_KEY`.

## Changed

- `src/control-plane/supervisor-activity.ts` — ring buffer + stderr log lines.
- `src/control-plane/runtime.ts` — `startSupervisorLoop` / `stopSupervisorLoop` messages + `supervisor_loop_started_at`.
- `src/ops-server.ts` — `GET /api/supervisor/activity`; start/stop POST bodies include `message`, `activity`.
- `web/index.html`, `web/app.js`, `web/style.css` — toast, supervisor log panel, adaptive 2s poll when loop on.
- `src/cli/supervisor.ts`, `scripts/start-control-plane.sh` — CLI banners.
- `src/e2e/dashboard-api.e2e.ts` — supervisor start + activity test.

## Not changed

- Supervisor dispatch rules (cooldown, unchanged briefing skip).
- `lic` compiler, benchmarks briefing scripts, Supabase schema (except state JSON fields).
- Agent run trace / `run_input` recording (separate PR commits).

## Breaking

N/A — additive API and UI only.

## Security

N/A — no new trust surface; activity log is local process memory.

## Performance

N/A — activity buffer capped at 80 entries.

## Downstream

N/A — li-cursor-agents only.

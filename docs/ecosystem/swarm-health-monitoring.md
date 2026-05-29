# Swarm health monitoring

Periodic markdown snapshots confirm the dashboard, async swarm, runtime API, research productivity, deduped error counts (stale vs real), self-improvement signals, heuristic scores, and trend vs the prior snapshot. Reports are **read-only** (no DB writes).

## Quick check

```bash
./scripts/swarm-health-report.sh
cat logs/swarm-health-reports/latest.md
```

Exit code **0** only when:

- `li-agents-dashboard.service` is **active** (user systemd), and
- `GET /api/runtime` succeeds with `async_swarm_running: true`.

Otherwise the script exits **1** (timer still runs; check `journalctl`).

## Report layout

| Path | Meaning |
|------|---------|
| `logs/swarm-health-reports/YYYY-MM-DDTHH-MM.md` | UTC timestamped snapshot |
| `logs/swarm-health-reports/latest.md` | Symlink to newest file |

### Sections (in order)

1. **Trend** — compares to the newest prior `20*.md` in the same directory: overall OK/UNHEALTHY, real-error count delta (or total if older reports lack the split), async_swarm up/down change.
2. **Scores (1–10)** — heuristic operational / self-healing / self-improvement (see below).
3. **Recommendations** — up to three auto bullets when thresholds fire.
4. **systemd** — dashboard + async-swarm unit state.
5. **Runtime API** — store, slots, `async_swarm_running`.
6. **Research productivity** — finished / error / stale counts in last 10 research runs; goal/vertical linkage; last successful researcher from `GET /api/runs`; table with context note for the Researchers tab.
7. **Errors (1d)** — stale reconcile vs real errors; top three **real** categories only.
8. **Self-improvement signals** — ecosystem grade file, handoff count, interventions, meta-agent last runs.
9. **Legacy researchers loop** — `run-researchers-long` pgrep (informational).

## Scoring rules (heuristic)

Scores are **not** persisted; they guide skimming only.

| Dimension | Starts at | Penalties / bonuses |
|-----------|-----------|---------------------|
| **Operational** | 10 | −4 overall unhealthy; −3 dashboard not active; −2 async unit not active; −3 `async_swarm_running` false; −1..−3 by real error count (>0, >5, >10). Clamped 1–10. |
| **Self-healing** | 8 | −4 async swarm false; −1..−3 real errors; +1 when >90% of 1d errors are stale reconcile (noise, not failures). |
| **Self-improvement** | 6 | +1..+2 for finished research in last 10; +1 for goal/vertical on ≥5 runs; +1 last researcher success &lt;24h; +/− from ecosystem letter grade (A/B bonus, D/F penalty); +1 per meta agent (`swarm_observer`, `ecosystem_grader`) with a recent finished run; −2 if interventions non-empty. |

## Recommendations thresholds

| Condition | Suggestion |
|-----------|------------|
| `real_error_count` > 5 (1d) | Inspect real categories + [recent-error-learnings.md](./recent-error-learnings.md) |
| `GET /api/runtime` fails while both units are active | Inspect dashboard API latency, `worker_status.active_runs` payload size, and Supabase/heartbeat logs |
| `async_swarm_running` false | Check async-swarm service and dashboard logs |
| No researcher `finished` in 24h (or none ever in recent runs) | Check research lane, goals, SDK slots |
| Overall UNHEALTHY (fallback) | Fix dashboard/async before trusting Researchers tab |

## Split dashboard vs async-swarm (`worker_status`)

The dashboard (`serve-dashboard`) and async-swarm (`async-swarm.js start`) are **separate processes**. `/api/runtime` reads `worker_status` from Supabase (or `data/control-plane/worker-status.json`), not the async-swarm in-memory flag.

If Supabase upserts fail (`fetch failed`), disk may be newer than DB — health uses **freshest** `updated_at` (DB + disk). The async-swarm writer never persists `async_swarm_running=false` while the swarm process is alive; `markDetachedSwarmStopped` skips when `li-agents-async-swarm.service` is active.

After deploy, restart **both** units: `systemctl --user restart li-agents-async-swarm li-agents-dashboard`.

## Interpreting `stale_running_reconciled`

After a dashboard or async-swarm **restart** (SIGTERM, `systemctl restart`, workspace sweep `try-restart`), boot reconcile marks orphaned `agent_runs` rows as `error` with category **`stale_running_reconciled`**. That is **bookkeeping**, not agent task failure.

- Health report **Overall: OK** can still show many stale rows in the research table until new successful runs appear.
- `GET /api/errors/summary?range=1d` exposes **`stale_reconcile_count`** and **`real_error_count`** — use **real** for alerting.
- Trend reports need **multiple** snapshots under `logs/swarm-health-reports/`; the first run notes “no prior snapshot”.

## API: errors summary split

`GET /api/errors/summary?range=1d` (alias `/api/runs/errors-summary`) includes:

- `stale_reconcile_count` — rows in `stale_running_reconciled` or `unregistered_running_reconciled`
- `real_error_count` — all other error rows in the window
- `total_errors` — raw error row count (unchanged)

## systemd timer (recommended)

Install (standalone):

```bash
./scripts/install-health-report-timer.sh
```

Or with the swarm stack:

```bash
./scripts/install-agents-swarm-systemd.sh   # includes health timer unless --no-health-report
```

Default schedule: **every 20 minutes** (`OnBootSec=5min`, `OnUnitActiveSec=20min`). Override at install:

```bash
LI_HEALTH_REPORT_INTERVAL=30min ./scripts/install-health-report-timer.sh
```

Status:

```bash
systemctl --user status li-agents-health-report.timer
systemctl --user list-timers 'li-agents-*'
journalctl --user -u li-agents-health-report.service -n 30 --no-pager
```

### Disable timer

```bash
systemctl --user disable --now li-agents-health-report.timer
```

Reports already on disk are kept.

## Cron alternative

If you prefer cron instead of systemd:

```cron
*/20 * * * * cd /path/to/li-cursor-agents && ./scripts/swarm-health-report.sh >> logs/swarm-health-reports/cron.log 2>&1
```

## Dry-run / tests

```bash
LI_DRY_RUN=1 LI_REPORT_DIR=/tmp/li-health-test ./scripts/swarm-health-report.sh
npm run test:health-report
```

`LI_MOCK_UNHEALTHY=1` with dry-run forces exit 1 for CI-style failure checks.

Implementation: `scripts/swarm-health-report.sh` probes APIs; `scripts/lib/swarm-health-report-render.py` formats markdown.

## Related

- [hung-agent-sweep.md](./hung-agent-sweep.md) — slot/orphan cleanup timer
- [swarm-architecture.md](./swarm-architecture.md) — dashboard + async-swarm split
- `./scripts/report-swarm-errors.sh` — JSON error summary only

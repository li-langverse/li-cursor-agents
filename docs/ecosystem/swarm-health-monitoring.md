# Swarm health monitoring

Periodic markdown snapshots confirm the dashboard, async swarm, runtime API, recent research runs, and deduped error counts. Reports are **read-only** (no DB writes).

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

Sections: systemd units, runtime store/slots/SDK counts, last 10 research runs (with summaries), 1d error summary (`range=1d`), optional `run-researchers-long` pgrep count.

### Interpreting `stale_running_reconciled`

After a dashboard or async-swarm **restart** (SIGTERM, `systemctl restart`, workspace sweep `try-restart`), boot reconcile marks orphaned `agent_runs` rows as `error` with category **`stale_running_reconciled`**. That is **bookkeeping**, not agent task failure.

- Health report **Overall: OK** can still show the Researchers table full of `stale_running_reconciled` until new successful runs appear.
- `GET /api/errors/summary?range=1d` may show **100+** errors with only **one** real SDK failure — compare `categories[].count` and read [recent-error-learnings.md](./recent-error-learnings.md).
- Trend reports need **multiple** snapshots under `logs/swarm-health-reports/`; a single file cannot show OK vs FAIL over time.

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

## Related

- [hung-agent-sweep.md](./hung-agent-sweep.md) — slot/orphan cleanup timer
- [swarm-architecture.md](./swarm-architecture.md) — dashboard + async-swarm split
- `./scripts/report-swarm-errors.sh` — JSON error summary only

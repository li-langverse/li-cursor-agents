# Hung-agent sweep

Reclaim crashed SDK slot locks and stop **orphan** or **stuck** agent processes without tearing down the healthy swarm (dashboard + systemd async-swarm).

## What it does

| Target | Action |
|--------|--------|
| Stale `data/control-plane/sdk-slots/*.lock` (dead PID) | Reclaim on every run |
| `run-agent.js` older than `LI_AGENT_MAX_RUN_AGE_MS` with no log writes for `LI_SWEEP_GRACE_MS` | SIGTERM → SIGKILL (`--apply`) |
| `async-swarm.js` not under dashboard / `li-agents-async-swarm` / `logs/async-swarm.pid` | Kill (`--apply`) |
| Legacy `plan-loop.py` when no active `li-*-plan-loop` systemd units | Kill (`--apply`) |

**Never killed** (unless `--force`):

- `serve-dashboard.js` and its child tree
- `li-agents-async-swarm.service` MainPID and descendants
- PID recorded in `logs/async-swarm.pid` (detached swarm)

Normal in-flight runs inside the swarm are left alone.

## Usage

```bash
cd li-cursor-agents
source ~/Documents/Cursor/.env

# Report only (default)
./scripts/sweep-hung-agents.sh

# Execute cleanup
./scripts/sweep-hung-agents.sh --apply

# JSON for automation
./scripts/sweep-hung-agents.sh --json

# Also kill protected dashboard/swarm trees (destructive)
./scripts/sweep-hung-agents.sh --apply --force
```

npm: `npm run agents:sweep-hung` (dry-run) · `npm run agents:sweep-hung -- --apply`

## Environment

| Variable | Default | Meaning |
|----------|---------|---------|
| `LI_SDK_MAX_CONCURRENT` | `8` | Slot pool size (reclaim scans all slots) |
| `LI_AGENT_MAX_RUN_AGE_MS` | `7200000` (2h) | Minimum process age before `run-agent` is eligible |
| `LI_SWEEP_GRACE_MS` | `1800000` (30m) | Log idle window (no growth on open `.log` fds) |
| `LI_SWEEP_KILL_GRACE_MS` | `15000` | Wait after SIGTERM before SIGKILL |

## Systemd timer

Installed with `./scripts/install-agents-swarm-systemd.sh` (skip with `--no-sweep`):

- `li-agents-sweep.service` — oneshot, runs `sweep-hung-agents.sh --apply`
- `li-agents-sweep.timer` — first run 15m after boot, then every 30m

```bash
systemctl --user status li-agents-sweep.timer
systemctl --user start li-agents-sweep.service   # manual run
journalctl --user -u li-agents-sweep.service -n 30
```

## Cron alternative

If you do not use user systemd:

```cron
# Every 30 minutes — dry-run log + apply (adjust path)
*/30 * * * * cd /path/to/li-cursor-agents && ./scripts/sweep-hung-agents.sh --apply >> logs/sweep-hung-agents.log 2>&1
```

## Related

- [sdk-slot-policy.md](./sdk-slot-policy.md) — slot cap and stale lock semantics
- [swarm-architecture.md](./swarm-architecture.md) — operator install
- `scripts/kill-stale-agent-processes.sh` — **nuclear** dev/CI reset (kills dashboard, all agents); not for production sweeps

# Stale Cursor terminal cleanup (2h loop + launchd backup)

## Summary

Adds scripts to terminate stale Cursor agent shells and orphaned test processes on a 2-hour interval, with a macOS launchd backup when `agents:keep` is not running.

## Agent continuation

1. **Read** `scripts/cleanup-stale-cursor-terminals.py`, `scripts/cursor-terminals-cleanup-loop.sh`, `scripts/install-cursor-terminals-cleanup-launchd.sh`.
2. **Run** `npm run maintenance:terminals:dry-run` then `npm run maintenance:terminals:launchd` on macOS hosts that run Cursor agents overnight.
3. **Next** confirm `logs/cursor-terminals-cleanup.log` and `logs/cursor-terminals-cleanup-launchd.log` after two ticks; tune `LI_CURSOR_TERMINALS_*` in `.env` if interactive shells are closed too aggressively.
4. **Blocked** — none; does not require Supabase or SDK quota.

## Changed

- `scripts/cleanup-stale-cursor-terminals.{py,sh}` — SIGTERM stale `zsh -c` under Cursor extension-hosts (default age 2h), `zsh -il` on pty-host (4h), orphans (`li-tests` httpd, `lis db start`); protects active PIDs from `~/.cursor/projects/*/terminals/*.txt`.
- `scripts/cursor-terminals-cleanup-loop.sh` — background loop (`LI_CURSOR_TERMINALS_CLEANUP_INTERVAL_SEC`, default 7200).
- `scripts/com.li-langverse.cursor-terminals-cleanup.plist.in`, `scripts/install-cursor-terminals-cleanup-launchd.sh` — LaunchAgents backup scheduler.
- `scripts/keep-agents-running.sh` — starts cleanup loop with ecosystem sync loop.
- `scripts/env.defaults.sh`, `.env.example`, `package.json` (`maintenance:terminals*`).

## Not changed

- Supervisor tick logic, Cursor SDK backend, dashboard API, control-plane store paths.

## Breaking

N/A — opt out with `LI_CURSOR_TERMINALS_CLEANUP=0` or `LI_CURSOR_TERMINALS_CLEANUP_LOOP=0`.

## Security

N/A — local process management only; no new network surface.

## Performance

N/A — small periodic `ps` scan; frees stuck agent/orphan shells (typically low RSS per process).

## Downstream

N/A — host-local maintenance only.

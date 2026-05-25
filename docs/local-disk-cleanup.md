# Local disk cleanup (Cursor + Docker + agent workspaces)

Li swarm runs bloat **Cursor** `state.vscdb`, **Docker** layers, and **`data/workspaces/`** clones. Use the maintenance scripts on your Mac (not GitHub Actions).

## One-shot

```bash
npm run maintenance:disk-cleanup
```

Close Cursor first so SQLite `VACUUM` can compact the global DB.

## Daily schedule (launchd)

```bash
npm run maintenance:install-schedule
```

Installs `~/Library/LaunchAgents/com.li-langverse.disk-cleanup.plist` — runs **every day at 04:00** local time.

Logs: `~/Library/Logs/li-disk-cleanup/`

## What each step does

| Step | Default behavior |
|------|------------------|
| **Cursor** | Deletes `state.vscdb.backup`; if Cursor is quit, deletes `agentKv:blob:*` rows (Li agent session cache, ~GBs), then `wal_checkpoint` + `VACUUM` |
| **Docker** | `docker system prune -f --volumes` when the daemon is up |
| **Workspaces** | Removes `data/workspaces/<org>/<repo>/<runId>/` dirs older than **1 day** |

## Environment overrides

| Variable | Effect |
|----------|--------|
| `LI_DISK_CLEANUP_DOCKER_FULL=1` | Aggressive `docker system prune -af --volumes` |
| `LI_WORKSPACE_RETENTION_DAYS=7` | Keep workspace clones longer |
| `LI_WORKSPACE_ROOT` | Non-default workspaces path |
| `LI_DISK_CLEANUP_LOG_DIR` | Log directory |
| `LI_DISK_CLEANUP_PRUNE_CHAT=1` | Also delete `bubbleId:*` and `composer.*` chat rows (more aggressive) |

## Uninstall schedule

```bash
launchctl bootout "gui/$(id -u)/com.li-langverse.disk-cleanup"
rm ~/Library/LaunchAgents/com.li-langverse.disk-cleanup.plist
```

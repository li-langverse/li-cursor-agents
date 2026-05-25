#!/usr/bin/env bash
# Background loop: kill stale Cursor/agent terminals every 2h (default).
# Started by keep-agents-running.sh or launchd, or manually:
#   nohup ./scripts/cursor-terminals-cleanup-loop.sh >>logs/cursor-terminals-cleanup.log 2>&1 &
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p logs

# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi

INTERVAL="${LI_CURSOR_TERMINALS_CLEANUP_INTERVAL_SEC:-7200}"
echo "[cursor-terminals-cleanup-loop] interval=${INTERVAL}s root=$ROOT"

while true; do
  echo "[cursor-terminals-cleanup-loop] tick $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if ! "$ROOT/scripts/cleanup-stale-cursor-terminals.sh"; then
    echo "[cursor-terminals-cleanup-loop] WARN: cleanup failed — retry in ${INTERVAL}s" >&2
  fi
  sleep "$INTERVAL"
done

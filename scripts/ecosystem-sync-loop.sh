#!/usr/bin/env bash
# Background loop: pull org repos + sync skills on an interval.
# Started by keep-agents-running.sh or manually:
#   nohup ./scripts/ecosystem-sync-loop.sh >>logs/ecosystem-sync.log 2>&1 &
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p logs

# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
if [[ -f "$LI_GITHUB_ENV" ]]; then set -a; source "$LI_GITHUB_ENV"; set +a; fi

INTERVAL="${LI_ECOSYSTEM_SYNC_INTERVAL_SEC:-3600}"
echo "[ecosystem-sync-loop] interval=${INTERVAL}s root=$ROOT"

while true; do
  echo "[ecosystem-sync-loop] tick $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if ! "$ROOT/scripts/sync-ecosystem.sh"; then
    echo "[ecosystem-sync-loop] WARN: sync failed — retry in ${INTERVAL}s" >&2
  fi
  sleep "$INTERVAL"
done

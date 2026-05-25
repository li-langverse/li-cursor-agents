#!/usr/bin/env bash
# Async swarm in a separate Node process so Cursor SDK spawnSync does not block worker HTTP.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=lib/dev-export-env.sh
source "$ROOT/scripts/lib/dev-export-env.sh"
dev_export_li_env

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi
# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"
li_resolve_env_paths "$ROOT"
if [[ -f "$ROOT/.env.supabase" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env.supabase"
  set +a
fi

API_PORT="${LI_AGENT_DASHBOARD_PORT}"
mkdir -p "$ROOT/logs"
SWARM_LOG="$ROOT/logs/async-swarm-dev.log"

echo "swarm-dev: waiting for worker http://127.0.0.1:${API_PORT}/api/health …"
for _ in $(seq 1 90); do
  if curl -sf --max-time 2 "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -sf --max-time 2 "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then
  echo "swarm-dev: worker not healthy on :${API_PORT} — start dev:worker first" >&2
  exit 1
fi

echo "swarm-dev: starting async swarm (log: ${SWARM_LOG})"
exec node "$ROOT/dist/cli/async-swarm.js" start 2>&1 | tee -a "$SWARM_LOG"

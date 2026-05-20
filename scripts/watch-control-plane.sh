#!/usr/bin/env bash
# Watchdog: restart dashboard + supervisor if the ops server stops responding.
# Use with keep-agents-running (separate process) or systemd.
#
#   LI_WATCH_INTERVAL_SEC=30 ./scripts/watch-control-plane.sh
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
li_resolve_env_paths "$ROOT"

PORT="${LI_AGENT_DASHBOARD_PORT:-9477}"
INTERVAL="${LI_WATCH_INTERVAL_SEC:-30}"
FAIL_THRESHOLD="${LI_WATCH_FAIL_THRESHOLD:-3}"
failures=0

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [watch] $*"; }

health_ok() {
  curl -sf --max-time 5 "http://127.0.0.1:${PORT}/api/status" >/dev/null 2>&1
}

supervisor_ok() {
  curl -sf --max-time 5 "http://127.0.0.1:${PORT}/api/runtime" 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get('supervisor_loop_running') else 1)" 2>/dev/null
}

restart_stack() {
  log "restarting control plane (keep-agents-running)"
  LI_KEEP_AGENTS_RESTART=1 bash "$ROOT/scripts/keep-agents-running.sh" >>"$ROOT/logs/watch-control-plane.log" 2>&1 || true
  sleep 5
  failures=0
}

mkdir -p "$ROOT/logs"
log "watching :${PORT} every ${INTERVAL}s (fail threshold ${FAIL_THRESHOLD})"

while true; do
  if health_ok; then
    failures=0
    if ! supervisor_ok; then
      log "dashboard up but supervisor loop off — POST /api/supervisor/start"
      curl -sf -X POST "http://127.0.0.1:${PORT}/api/supervisor/start" \
        -H "Content-Type: application/json" -d '{}' >/dev/null 2>&1 \
        || log "supervisor start API failed"
    fi
  else
    failures=$((failures + 1))
    log "health check failed (${failures}/${FAIL_THRESHOLD})"
    if [[ "$failures" -ge "$FAIL_THRESHOLD" ]]; then
      restart_stack
    fi
  fi
  sleep "$INTERVAL"
done

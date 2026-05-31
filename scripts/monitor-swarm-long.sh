#!/usr/bin/env bash
# Long-running health monitor: Supabase, dashboard, li-local-ci, optional SDK ping.
#
#   LI_MONITOR_DURATION_SEC=10800   # default 3h
#   LI_MONITOR_INTERVAL_SEC=300       # default 5m between checks
#   LI_MONITOR_SDK_SMOKE=1          # run sdk-smoke each interval (slow + uses quota)
#   LI_MONITOR_SUPABASE_ENSURE=1    # run scripts/ensure-supabase.sh when probe fails (slow)
#   LI_MONITOR_MIGRATION_DRY_RUN=1  # append supabase db push --dry-run tail (noisy)
#   LI_AGENT_DASHBOARD_PORT=9477
#
# Logs: logs/monitor-swarm.log (repo gitignores *.log)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p logs

# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"
if [[ -f "$ROOT/.env" ]]; then set -a && source "$ROOT/.env" && set +a; fi
li_resolve_env_paths "$ROOT"
if [[ -f "$ROOT/.env.supabase" ]]; then set -a && source "$ROOT/.env.supabase" && set +a; fi

PORT="${LI_AGENT_DASHBOARD_PORT:-9477}"
DURATION="${LI_MONITOR_DURATION_SEC:-10800}"
INTERVAL="${LI_MONITOR_INTERVAL_SEC:-300}"
LOG="$ROOT/logs/monitor-swarm.log"
END=$((SECONDS + DURATION))

log() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [monitor] $*" | tee -a "$LOG"
}

dashboard_probe() {
  curl -sf --max-time 8 "http://127.0.0.1:${PORT}/api/runtime" 2>/dev/null | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  print('dashboard_ok', 'loop', d.get('supervisor_loop_running'), 'agent', d.get('current_supervisor_agent'), 'runs', d.get('active_run_count'), 'store', d.get('control_plane_store'))
except Exception as e:
  print('dashboard_bad', e)
" 2>/dev/null || echo "dashboard_unreachable"
}

supabase_probe() {
  if [[ "${LI_STACK_SKIP_SUPABASE:-}" == "1" ]] || [[ "${LI_CONTROL_PLANE_STORE:-lidb}" == "disk" ]]; then
    echo "supabase_skipped disk_or_skip"
    return 0
  fi
  if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
    echo "supabase_docker_down"
    return 1
  fi
  local _proj n api_url
  _proj="$(basename "$ROOT")"
  n="$(docker ps --format '{{.Names}}' 2>/dev/null | grep -cE "^supabase_.+_${_proj}$" || true)"
  if [[ "${n:-0}" -lt 2 ]]; then
    echo "supabase_containers_low project=${_proj} count=${n:-0}"
    if [[ "${LI_MONITOR_SUPABASE_ENSURE:-0}" == "1" ]]; then
      LI_SUPABASE_ENSURE_QUIET=1 bash "$ROOT/scripts/ensure-supabase.sh" >>"$LOG" 2>&1 || true
      n="$(docker ps --format '{{.Names}}' 2>/dev/null | grep -cE "^supabase_.+_${_proj}$" || true)"
      echo "supabase_after_ensure count=${n:-0}"
    fi
    if [[ "${n:-0}" -lt 2 ]]; then
      return 1
    fi
  fi
  api_url="http://127.0.0.1:54321"
  if command -v supabase >/dev/null 2>&1 && [[ -f "$ROOT/supabase/config.toml" ]]; then
    api_url="$(cd "$ROOT" && supabase status -o json 2>/dev/null | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  print(d.get('API_URL') or 'http://127.0.0.1:54321')
except Exception:
  print('http://127.0.0.1:54321')
" 2>/dev/null || echo "http://127.0.0.1:54321")"
  fi
  if [[ "${LI_MONITOR_MIGRATION_DRY_RUN:-0}" == "1" ]] && command -v supabase >/dev/null 2>&1 && [[ -f "$ROOT/supabase/config.toml" ]]; then
    (cd "$ROOT" && supabase db push --dry-run 2>&1 | tail -3) | sed 's/^/supabase_migrate_/' | tee -a "$LOG" >/dev/null || true
  fi
  local sr code
  sr="${SUPABASE_SERVICE_ROLE_KEY:-}"
  if [[ -n "$sr" ]]; then
    code="$(curl -sf -o /dev/null -w "%{http_code}" -H "apikey: $sr" -H "Authorization: Bearer $sr" "${api_url}/rest/v1/" 2>/dev/null || echo 000)"
    echo "supabase_rest_http=$code api=${api_url}"
    if [[ "$code" != "200" ]]; then
      return 1
    fi
  else
    echo "supabase_warn no_service_role_in_env"
  fi
  echo "supabase_ok containers=${n:-0}"
}

local_ci_probe() {
  if bash "$ROOT/scripts/ensure-li-local-ci.sh" >>"$LOG" 2>&1; then
    echo "li_local_ci_ok"
  else
    echo "li_local_ci_fail"
  fi
}

log "start duration=${DURATION}s interval=${INTERVAL}s port=${PORT} log=$LOG"
while (( SECONDS < END )); do
  log "--- tick ---"
  local_ci_probe | tee -a "$LOG"
  supabase_probe | tee -a "$LOG"
  dashboard_probe | tee -a "$LOG"
  if [[ "${LI_MONITOR_SDK_SMOKE:-0}" == "1" ]]; then
    if env -u CURSOR_MOCK bash "$ROOT/scripts/sdk-smoke.sh" >>"$LOG" 2>&1; then
      log "sdk_smoke_ok"
    else
      log "sdk_smoke_fail"
    fi
  fi
  sleep "$INTERVAL"
done
log "end duration reached"

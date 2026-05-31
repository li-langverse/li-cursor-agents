#!/usr/bin/env bash
set -euo pipefail
: "${AGENTS_SWARM_ROLE:?AGENTS_SWARM_ROLE required}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DATA_DIR="${AGENTS_SWARM_DATA_DIR:-$ROOT/data/control-plane}"
DISABLE_FILE="${DATA_DIR}/DISABLE_AUTOSTART"
ENV_FILE="${LI_CURSOR_ENV_FILE:-$HOME/Documents/Cursor/.env}"
PORT="${LI_AGENT_DASHBOARD_PORT:-9477}"
# Preserve unit/CLI bind host across .env sourcing (systemd --lan).
BIND_HOST_FROM_UNIT="${LI_AGENT_DASHBOARD_HOST:-}"
STORE_FROM_UNIT="${LI_CONTROL_PLANE_STORE:-}"
if [[ -f "$DISABLE_FILE" ]]; then
  echo "agents-swarm-systemd[$AGENTS_SWARM_ROLE]: DISABLE_AUTOSTART — exit 0"
  exit 0
fi
mkdir -p "$DATA_DIR" "$ROOT/logs"
cd "$ROOT"
# shellcheck source=li-stack-env.sh
source "$ROOT/scripts/lib/li-stack-env.sh"
li_source_env_supabase "$ROOT" || true
source "$ROOT/scripts/env.defaults.sh"
[[ -f "$ROOT/.env" ]] && { set -a; source "$ROOT/.env"; set +a; }
li_resolve_env_paths "$ROOT"
[[ -f "$ENV_FILE" ]] && { set -a; source "$ENV_FILE"; set +a; }
if [[ -n "$BIND_HOST_FROM_UNIT" ]]; then
  export LI_AGENT_DASHBOARD_HOST="$BIND_HOST_FROM_UNIT"
fi
if [[ -n "$STORE_FROM_UNIT" ]]; then
  export LI_CONTROL_PLANE_STORE="$STORE_FROM_UNIT"
fi
_store="${LI_CONTROL_PLANE_STORE:-lidb}"
[[ "${LI_STACK_SKIP_SUPABASE:-}" == "1" ]] && _store="disk"
_force_disk_store() {
  echo "agents-swarm-systemd[$AGENTS_SWARM_ROLE]: $1 — using LI_CONTROL_PLANE_STORE=disk" >&2
  _store="disk"
  export LI_CONTROL_PLANE_STORE=disk
  unset SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_ANON_KEY LI_TEST_SUPABASE_URL 2>/dev/null || true
}

if [[ "$_store" == "lidb" ]]; then
  bash "$ROOT/scripts/ensure-lidb.sh" || _force_disk_store "lidb ensure failed"
fi

if [[ "$_store" == "supabase" ]]; then
  if li_supabase_failover_enabled; then
    if ! li_apply_supabase_failover "$ROOT"; then
      if ! "$ROOT/scripts/ensure-supabase.sh"; then
        _force_disk_store "Supabase failover + ensure failed (Docker down?)"
      elif ! li_apply_supabase_failover "$ROOT"; then
        _force_disk_store "Supabase failover: primary and standby unreachable"
      fi
    fi
  elif ! li_supabase_rest_ready; then
    if ! "$ROOT/scripts/ensure-supabase.sh"; then
      _force_disk_store "Supabase ensure failed (Docker down?)"
    else
      li_source_env_supabase "$ROOT" || true
    fi
  fi
  if [[ "$_store" == "supabase" ]] && ! li_supabase_rest_ready; then
    if [[ -z "${SUPABASE_URL:-}" || ( -z "${SUPABASE_SERVICE_ROLE_KEY:-}" && -z "${SUPABASE_ANON_KEY:-}" ) ]]; then
      _force_disk_store "Supabase credentials missing — run npm run db:ensure when Docker is up"
    else
      _force_disk_store "Supabase REST unreachable at ${SUPABASE_URL:-?}"
    fi
  fi
fi
export GH_TOKEN GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
"$ROOT/scripts/swarm-env-preflight.sh"
NODE_BIN="$(li_resolve_preferred_node_bin)"
NPM_DIR=""
if command -v npm >/dev/null 2>&1; then
  NPM_DIR="$(dirname "$(command -v npm)")"
fi
export NODE_BIN PATH="$(dirname "$NODE_BIN")${NPM_DIR:+:$NPM_DIR}:${PATH}"
"$ROOT/scripts/ensure-native-modules.sh"
npm run build >/dev/null 2>&1
case "$AGENTS_SWARM_ROLE" in
  dashboard)
    # Research-lane-only pause must not leak from LI_CURSOR_ENV_FILE / .env into dashboard API.
    unset LI_SWARM_PAUSE_WORKERS
    export LI_AUTO_START_SUPERVISOR=0 LI_SWARM_DETACHED=1 LI_SWARM_EXTERNAL=0
    export LI_AUTO_START_ASYNC_SWARM="${LI_AUTO_START_ASYNC_SWARM:-0}"
    if command -v lsof >/dev/null 2>&1; then
      # shellcheck source=free-port.sh
      source "$ROOT/scripts/free-port.sh"
      free_port "$PORT" 8 || true
    fi
    exec "$NODE_BIN" "$ROOT/dist/cli/serve-dashboard.js" --port "$PORT"
    ;;
  async-swarm)
    unset LI_SWARM_PAUSE_WORKERS
    export LI_AUTO_START_ASYNC_SWARM=1 LI_SWARM_DETACHED=0
    exec "$NODE_BIN" "$ROOT/dist/cli/async-swarm.js" start
    ;;
  watchdog) exec "$NODE_BIN" "$ROOT/dist/cli/swarm-watchdog.js" ;;
  *) echo "unknown role" >&2; exit 2 ;;
esac

#!/usr/bin/env bash
# Start dashboard + supervisor loop in background (survives closing the terminal).
# Logs: logs/keep-agents.log
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p logs

# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"
# shellcheck source=lib/li-stack-env.sh
source "$ROOT/scripts/lib/li-stack-env.sh"

NODE_BIN="$(li_resolve_preferred_node_bin)"
export NODE_BIN PATH="$(dirname "$NODE_BIN"):${PATH}"
echo "==> Using NODE_BIN=$NODE_BIN ($("$NODE_BIN" -v))"
ENV_FILE="${LI_CURSOR_ENV_FILE:-$HOME/Documents/Cursor/.env}"
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
li_resolve_env_paths "$ROOT"
if [[ -f "$ENV_FILE" ]]; then set -a; source "$ENV_FILE"; set +a; fi
elif [[ -f "$LI_GITHUB_ENV" ]]; then set -a; source "$LI_GITHUB_ENV"; set +a; fi
export GH_TOKEN GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
# Production stack uses Cursor SDK; tests set CURSOR_MOCK=1 explicitly.
unset CURSOR_MOCK
export LI_AUTO_START_SUPERVISOR=0
export LI_AUTO_START_ASYNC_SWARM=1
export LI_SWARM_EXTERNAL=0
export LI_SWARM_DETACHED=1

_store="${LI_CONTROL_PLANE_STORE:-supabase}"
[[ "${LI_STACK_SKIP_SUPABASE:-}" == "1" ]] && _store="disk"
if [[ "$_store" == "supabase" ]]; then
  "$ROOT/scripts/ensure-supabase.sh" || {
    echo "ERROR: LI_CONTROL_PLANE_STORE=supabase but Supabase failed (Docker?). Use LI_CONTROL_PLANE_STORE=disk or fix: npm run db:ensure" >&2
    exit 1
  }
fi
if [[ -f "$ROOT/.env.supabase" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env.supabase"
  set +a
fi

_systemd_owns_stack() {
  [[ "${LI_CONTROL_PLANE_SYSTEMD:-}" == "1" || "${LI_CONTROL_PLANE_SYSTEMD:-}" == "true" ]] && return 0
  if command -v systemctl >/dev/null 2>&1; then
    local st
    st="$(systemctl --user is-active li-agents-dashboard.service 2>/dev/null || true)"
    [[ "$st" == "active" || "$st" == "activating" ]] && return 0
  fi
  return 1
}

if _systemd_owns_stack; then
  echo "==> systemd manages control plane — try-restart units (no lsof/pkill)"
  systemctl --user try-restart li-agents-dashboard.service 2>/dev/null || true
  systemctl --user try-restart li-agents-async-swarm.service 2>/dev/null || true
  echo "Dashboard: http://127.0.0.1:${LI_AGENT_DASHBOARD_PORT:-9477}/"
  exit 0
fi

if [[ "${LI_KEEP_AGENTS_RESTART:-}" != "0" ]]; then
  if lsof -ti ":${LI_AGENT_DASHBOARD_PORT}" >/dev/null 2>&1; then
    echo "Stopping existing dashboard on :${LI_AGENT_DASHBOARD_PORT}…"
    lsof -ti ":${LI_AGENT_DASHBOARD_PORT}" | xargs kill 2>/dev/null || true
    sleep 1
  fi
  pkill -f "dist/cli/supervisor.js" 2>/dev/null || true
  pkill -f "dist/cli/async-swarm.js" 2>/dev/null || true
  pkill -f "dist/cli/serve-dashboard.js" 2>/dev/null || true
  sleep 1
fi

"$ROOT/scripts/ensure-native-modules.sh"
npm run build >/dev/null 2>&1
if [[ "${LI_WORKSPACE_PRUNE:-always}" != "never" ]]; then
  LI_WORKSPACE_PRUNE_INTERVAL_MS=0 "$NODE_BIN" "$ROOT/dist/cli/workspace-prune.js" 2>/dev/null | tail -3 || true
fi

PORT="$LI_AGENT_DASHBOARD_PORT"
if curl -sf "http://127.0.0.1:${PORT}/api/status" >/dev/null 2>&1; then
  RT=$(curl -sf "http://127.0.0.1:${PORT}/api/runtime" || echo "{}")
  if echo "$RT" | grep -q '"async_swarm_running":true'; then
    echo "Async swarm already running on :${PORT}"
    echo "Dashboard: http://127.0.0.1:${PORT}/"
    exit 0
  fi
  echo "Dashboard up — starting async swarm via API"
  curl -sf -X POST "http://127.0.0.1:${PORT}/api/async-swarm/start" -H "Content-Type: application/json" -d '{}'
  echo ""
  echo "Dashboard: http://127.0.0.1:${PORT}/"
  exit 0
fi

echo "Starting dashboard + async swarm (no supervisor; log: logs/keep-agents.log)"
nohup env \
  BENCHMARKS_ROOT="$BENCHMARKS_ROOT" \
  LI_LOCAL_CI_ROOT="$LI_LOCAL_CI_ROOT" \
  LI_USE_LOCAL_CI="$LI_USE_LOCAL_CI" \
  LI_LOCAL_CI_SWEEP_LIMIT="$LI_LOCAL_CI_SWEEP_LIMIT" \
  LI_LOCAL_CI_PRUNE="$LI_LOCAL_CI_PRUNE" \
  LI_LOCAL_CI_SKIP_GH="$LI_LOCAL_CI_SKIP_GH" \
  LI_CURSOR_AGENTS_ROOT="$ROOT" \
  LI_AUTO_START_SUPERVISOR=0 \
  LI_AUTO_START_ASYNC_SWARM=1 \
  LI_SDK_MAX_CONCURRENT="${LI_SDK_MAX_CONCURRENT:-4}" \
  LI_SUPERVISOR_INTERVAL_MS="$LI_SUPERVISOR_INTERVAL_MS" \
  LI_AGENTS_COOLDOWN_MS="$LI_AGENTS_COOLDOWN_MS" \
  LI_SUPERVISOR_MAX_TASKS="$LI_SUPERVISOR_MAX_TASKS" \
  LI_AGENT_DASHBOARD_PORT="$PORT" \
  GH_TOKEN="${GH_TOKEN:-}" \
  GITHUB_TOKEN="${GITHUB_TOKEN:-}" \
  CURSOR_API_KEY="${CURSOR_API_KEY:-}" \
  SUPABASE_URL="${SUPABASE_URL:-}" \
  SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}" \
  "$NODE_BIN" "$ROOT/dist/cli/serve-dashboard.js" --port "$PORT" \
  >>"$ROOT/logs/keep-agents.log" 2>&1 &
echo $! >"$ROOT/logs/keep-agents.pid"
sleep 3
echo "PID $(cat logs/keep-agents.pid) — tail -f logs/keep-agents.log"
echo "Dashboard: http://127.0.0.1:${PORT}/"
tail -5 logs/keep-agents.log 2>/dev/null || true

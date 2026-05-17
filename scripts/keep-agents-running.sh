#!/usr/bin/env bash
# Start dashboard + supervisor loop in background (survives closing the terminal).
# Logs: logs/keep-agents.log
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p logs

# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
li_resolve_env_paths "$ROOT"
if [[ -f "$LI_GITHUB_ENV" ]]; then set -a; source "$LI_GITHUB_ENV"; set +a; fi
export GH_TOKEN GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
# Production stack uses Cursor SDK; tests set CURSOR_MOCK=1 explicitly.
unset CURSOR_MOCK
export LI_AUTO_START_SUPERVISOR=1

if [[ "${LI_STACK_SKIP_SUPABASE:-}" != "1" ]]; then
  "$ROOT/scripts/ensure-supabase.sh" || echo "WARN: Supabase not ready — dashboard will use disk cache" >&2
fi
if [[ -f "$ROOT/.env.supabase" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env.supabase"
  set +a
fi

if [[ "${LI_KEEP_AGENTS_RESTART:-}" != "0" ]]; then
  if lsof -ti ":${LI_AGENT_DASHBOARD_PORT}" >/dev/null 2>&1; then
    echo "Stopping existing dashboard on :${LI_AGENT_DASHBOARD_PORT}…"
    lsof -ti ":${LI_AGENT_DASHBOARD_PORT}" | xargs kill 2>/dev/null || true
    sleep 1
  fi
  pkill -f "dist/cli/supervisor.js" 2>/dev/null || true
  pkill -f "dist/cli/serve-dashboard.js" 2>/dev/null || true
  sleep 1
fi

npm run build >/dev/null 2>&1

PORT="$LI_AGENT_DASHBOARD_PORT"
if curl -sf "http://127.0.0.1:${PORT}/api/status" >/dev/null 2>&1; then
  RT=$(curl -sf "http://127.0.0.1:${PORT}/api/runtime" || echo "{}")
  if echo "$RT" | grep -q '"supervisor_loop_running":true'; then
    echo "Supervisor loop already running on :${PORT}"
    echo "Dashboard: http://127.0.0.1:${PORT}/"
    exit 0
  fi
  echo "Dashboard up — starting supervisor loop via API"
  curl -sf -X POST "http://127.0.0.1:${PORT}/api/supervisor/start" -H "Content-Type: application/json" -d '{}'
  echo ""
  echo "Dashboard: http://127.0.0.1:${PORT}/"
  exit 0
fi

echo "Starting dashboard + auto-supervisor (log: logs/keep-agents.log)"
nohup env \
  BENCHMARKS_ROOT="$BENCHMARKS_ROOT" \
  LI_LOCAL_CI_ROOT="$LI_LOCAL_CI_ROOT" \
  LI_USE_LOCAL_CI="$LI_USE_LOCAL_CI" \
  LI_LOCAL_CI_SWEEP_LIMIT="$LI_LOCAL_CI_SWEEP_LIMIT" \
  LI_LOCAL_CI_PRUNE="$LI_LOCAL_CI_PRUNE" \
  LI_LOCAL_CI_SKIP_GH="$LI_LOCAL_CI_SKIP_GH" \
  LI_CURSOR_AGENTS_ROOT="$ROOT" \
  LI_AUTO_START_SUPERVISOR=1 \
  LI_SUPERVISOR_INTERVAL_MS="$LI_SUPERVISOR_INTERVAL_MS" \
  LI_AGENTS_COOLDOWN_MS="$LI_AGENTS_COOLDOWN_MS" \
  LI_SUPERVISOR_MAX_TASKS="$LI_SUPERVISOR_MAX_TASKS" \
  LI_AGENT_DASHBOARD_PORT="$PORT" \
  GH_TOKEN="${GH_TOKEN:-}" \
  GITHUB_TOKEN="${GITHUB_TOKEN:-}" \
  CURSOR_API_KEY="${CURSOR_API_KEY:-}" \
  SUPABASE_URL="${SUPABASE_URL:-}" \
  SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}" \
  node "$ROOT/dist/cli/serve-dashboard.js" --port "$PORT" \
  >>"$ROOT/logs/keep-agents.log" 2>&1 &
echo $! >"$ROOT/logs/keep-agents.pid"
sleep 3
echo "PID $(cat logs/keep-agents.pid) — tail -f logs/keep-agents.log"
echo "Dashboard: http://127.0.0.1:${PORT}/"
tail -5 logs/keep-agents.log 2>/dev/null || true

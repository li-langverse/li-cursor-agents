#!/usr/bin/env bash
# Start dashboard + supervisor loop in background (survives closing the terminal).
# Logs: logs/keep-agents.log
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p logs

if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
GITHUB_ENV="${LI_GITHUB_ENV:-$ROOT/../.env.github}"
if [[ -f "$GITHUB_ENV" ]]; then set -a; source "$GITHUB_ENV"; set +a; fi

export BENCHMARKS_ROOT="${BENCHMARKS_ROOT:-$ROOT/../benchmarks}"
export LI_CURSOR_AGENTS_ROOT="$ROOT"
export CURSOR_MOCK="${CURSOR_MOCK:-1}"
export LI_AUTO_START_SUPERVISOR=1
# Dashboard spawns supervisor as child process (does not block HTTP)
export LI_SUPERVISOR_INTERVAL_MS="${LI_SUPERVISOR_INTERVAL_MS:-120000}"
export LI_AGENTS_COOLDOWN_MS="${LI_AGENTS_COOLDOWN_MS:-300000}"
export LI_SUPERVISOR_MAX_TASKS="${LI_SUPERVISOR_MAX_TASKS:-3}"
export LI_AGENT_DASHBOARD_PORT="${LI_AGENT_DASHBOARD_PORT:-9477}"

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
  LI_CURSOR_AGENTS_ROOT="$ROOT" \
  CURSOR_MOCK="$CURSOR_MOCK" \
  LI_AUTO_START_SUPERVISOR=1 \
  LI_SUPERVISOR_INTERVAL_MS="$LI_SUPERVISOR_INTERVAL_MS" \
  LI_AGENTS_COOLDOWN_MS="$LI_AGENTS_COOLDOWN_MS" \
  LI_SUPERVISOR_MAX_TASKS="$LI_SUPERVISOR_MAX_TASKS" \
  LI_AGENT_DASHBOARD_PORT="$PORT" \
  node "$ROOT/dist/cli/serve-dashboard.js" --port "$PORT" \
  >>"$ROOT/logs/keep-agents.log" 2>&1 &
echo $! >"$ROOT/logs/keep-agents.pid"
sleep 3
echo "PID $(cat logs/keep-agents.pid) — tail -f logs/keep-agents.log"
echo "Dashboard: http://127.0.0.1:${PORT}/"
tail -5 logs/keep-agents.log 2>/dev/null || true

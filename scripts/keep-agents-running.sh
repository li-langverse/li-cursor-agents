#!/usr/bin/env bash
# Start dashboard + supervisor in background; keeps running after you close the terminal.
# Logs: li-cursor-agents/logs/keep-agents.log
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p logs

export BENCHMARKS_ROOT="${BENCHMARKS_ROOT:-$ROOT/../benchmarks}"
export LI_CURSOR_AGENTS_ROOT="$ROOT"
export CURSOR_MOCK="${CURSOR_MOCK:-1}"
export LI_SUPERVISOR_INTERVAL_MS="${LI_SUPERVISOR_INTERVAL_MS:-120000}"
export LI_AGENTS_COOLDOWN_MS="${LI_AGENTS_COOLDOWN_MS:-300000}"
export LI_SUPERVISOR_MAX_TASKS="${LI_SUPERVISOR_MAX_TASKS:-3}"
export LI_AGENT_DASHBOARD_PORT="${LI_AGENT_DASHBOARD_PORT:-9477}"

if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
GITHUB_ENV="${LI_GITHUB_ENV:-$ROOT/../.env.github}"
if [[ -f "$GITHUB_ENV" ]]; then set -a; source "$GITHUB_ENV"; set +a; fi

if curl -sf "http://127.0.0.1:${LI_AGENT_DASHBOARD_PORT}/api/status" >/dev/null 2>&1; then
  echo "Dashboard already on :${LI_AGENT_DASHBOARD_PORT} — starting supervisor loop via API"
  curl -sf -X POST "http://127.0.0.1:${LI_AGENT_DASHBOARD_PORT}/api/supervisor/start" \
    -H "Content-Type: application/json" -d '{}' | python3 -m json.tool 2>/dev/null || true
  echo "Done. Dashboard: http://127.0.0.1:${LI_AGENT_DASHBOARD_PORT}/"
  exit 0
fi

echo "Starting stack in background (log: logs/keep-agents.log)"
nohup env \
  BENCHMARKS_ROOT="$BENCHMARKS_ROOT" \
  LI_CURSOR_AGENTS_ROOT="$ROOT" \
  CURSOR_MOCK="$CURSOR_MOCK" \
  LI_SUPERVISOR_INTERVAL_MS="$LI_SUPERVISOR_INTERVAL_MS" \
  LI_AGENTS_COOLDOWN_MS="$LI_AGENTS_COOLDOWN_MS" \
  LI_SUPERVISOR_MAX_TASKS="$LI_SUPERVISOR_MAX_TASKS" \
  LI_AGENT_DASHBOARD_PORT="$LI_AGENT_DASHBOARD_PORT" \
  LI_STACK_SKIP_SUPABASE="${LI_STACK_SKIP_SUPABASE:-1}" \
  bash "$ROOT/scripts/start-stack.sh" \
  >>"$ROOT/logs/keep-agents.log" 2>&1 &
echo $! >"$ROOT/logs/keep-agents.pid"
sleep 4
if curl -sf "http://127.0.0.1:${LI_AGENT_DASHBOARD_PORT}/api/supervisor/start" -X POST -H "Content-Type: application/json" -d '{}' >/dev/null 2>&1; then
  echo "Supervisor loop started via API."
fi
echo "PID $(cat logs/keep-agents.pid) — tail -f logs/keep-agents.log"
echo "Dashboard: http://127.0.0.1:${LI_AGENT_DASHBOARD_PORT}/"

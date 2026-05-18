#!/usr/bin/env bash
# Full local stack for dashboard development (one command):
#   Supabase + migrations → build → API :9477 → readiness → Next.js :3000
#
# Usage:
#   npm run dev:all
#   LI_STACK_SKIP_SUPABASE=1 npm run dev:all
#   LI_AUTO_START_ASYNC_SWARM=0 npm run dev:all   # API only, manual Start agents in UI
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Dashboard-first defaults (override in .env). Workers: LI_AUTO_START_ASYNC_SWARM=1
export LI_AUTO_START_ASYNC_SWARM="${LI_AUTO_START_ASYNC_SWARM:-0}"
export LI_AUTO_START_SUPERVISOR="${LI_AUTO_START_SUPERVISOR:-0}"
export LI_MAINTENANCE_STARTUP_DELAY_MS="${LI_MAINTENANCE_STARTUP_DELAY_MS:-30000}"
export LI_WORKER_STARTUP_DEFER_MS="${LI_WORKER_STARTUP_DEFER_MS:-45000}"
export LI_QUEUE_CACHE_MS="${LI_QUEUE_CACHE_MS:-20000}"
export LI_QUEUE_WARM_MS="${LI_QUEUE_WARM_MS:-25000}"
export LI_ASYNC_AGENT_INTERVAL_MS="${LI_ASYNC_AGENT_INTERVAL_MS:-300000}"
export LI_REPORT_CACHE_MS="${LI_REPORT_CACHE_MS:-30000}"

# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi
li_resolve_env_paths "$ROOT"

if [[ -f "$LI_GITHUB_ENV" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$LI_GITHUB_ENV"
  set +a
  export GH_TOKEN GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
fi

_store="${LI_CONTROL_PLANE_STORE:-supabase}"
[[ "${LI_STACK_SKIP_SUPABASE:-}" == "1" ]] && _store="disk"

if [[ "$_store" == "supabase" ]]; then
  echo "==> Supabase (migrations + .env.supabase)"
  if ! "$ROOT/scripts/ensure-supabase.sh"; then
    echo "ERROR: Supabase required for full stack (LI_CONTROL_PLANE_STORE=supabase)." >&2
    echo "       Fix Docker and run: npm run db:ensure" >&2
    echo "       Or disk-only: LI_STACK_SKIP_SUPABASE=1 npm run dev:all" >&2
    exit 1
  fi
  if [[ -f "$ROOT/.env.supabase" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$ROOT/.env.supabase"
    set +a
  fi
  echo "==> db:probe"
  npm run db:probe
else
  export LI_CONTROL_PLANE_STORE=disk
  echo "==> Supabase skipped — disk store (LI_STACK_SKIP_SUPABASE=1)"
fi

"$ROOT/scripts/ensure-native-modules.sh"

if [[ ! -d node_modules ]]; then
  echo "==> npm install (root)"
  npm install
fi
if [[ ! -d dashboard-ui/node_modules ]]; then
  echo "==> npm install (dashboard-ui)"
  (cd dashboard-ui && npm install)
fi

echo "==> TypeScript build"
npm run build

if [[ "${CURSOR_MOCK:-}" == "1" ]]; then
  echo "WARN: CURSOR_MOCK=1 — real agent runs disabled" >&2
else
  unset CURSOR_MOCK 2>/dev/null || true
fi

if [[ -z "${CURSOR_API_KEY:-}" ]]; then
  echo "WARN: CURSOR_API_KEY unset — add to .env for live Cursor SDK runs" >&2
fi

API_PORT="${LI_AGENT_DASHBOARD_PORT:-9477}"
UI_PORT="${LI_DASHBOARD_UI_PORT:-3000}"

# Free ports from a previous dev:all
for _port in "$API_PORT" "$UI_PORT"; do
  if lsof -ti ":$_port" >/dev/null 2>&1; then
    echo "==> Stopping process on :$_port"
    lsof -ti ":$_port" | xargs kill 2>/dev/null || true
    sleep 1
  fi
done

API_PID=""
stop_api() {
  if [[ -n "$API_PID" ]]; then
    kill "$API_PID" 2>/dev/null || true
    API_PID=""
  fi
}

on_dev_all_signal() {
  echo ""
  echo "==> dev:all stopped — shutting down control-plane API (PID ${API_PID:-?})"
  stop_api
  exit 143
}
trap on_dev_all_signal INT TERM

echo "==> Control-plane API http://127.0.0.1:${API_PORT}/ (LI_AUTO_START_ASYNC_SWARM=${LI_AUTO_START_ASYNC_SWARM})"
env \
  BENCHMARKS_ROOT="${BENCHMARKS_ROOT:-}" \
  LI_LOCAL_CI_ROOT="${LI_LOCAL_CI_ROOT:-}" \
  LI_USE_LOCAL_CI="${LI_USE_LOCAL_CI:-1}" \
  LI_CONTROL_PLANE_STORE="${LI_CONTROL_PLANE_STORE:-$_store}" \
  LI_AUTO_START_ASYNC_SWARM="${LI_AUTO_START_ASYNC_SWARM}" \
  LI_AUTO_START_SUPERVISOR="${LI_AUTO_START_SUPERVISOR}" \
  LI_MAINTENANCE_STARTUP_DELAY_MS="${LI_MAINTENANCE_STARTUP_DELAY_MS}" \
  LI_WORKER_STARTUP_DEFER_MS="${LI_WORKER_STARTUP_DEFER_MS}" \
  LI_SDK_MAX_CONCURRENT="${LI_SDK_MAX_CONCURRENT:-2}" \
  LI_QUEUE_CACHE_MS="${LI_QUEUE_CACHE_MS}" \
  LI_QUEUE_WARM_MS="${LI_QUEUE_WARM_MS}" \
  LI_ASYNC_AGENT_INTERVAL_MS="${LI_ASYNC_AGENT_INTERVAL_MS}" \
  LI_REPORT_CACHE_MS="${LI_REPORT_CACHE_MS}" \
  SUPABASE_URL="${SUPABASE_URL:-}" \
  SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}" \
  CURSOR_API_KEY="${CURSOR_API_KEY:-}" \
  GH_TOKEN="${GH_TOKEN:-}" \
  GITHUB_TOKEN="${GITHUB_TOKEN:-}" \
  node dist/cli/serve-dashboard.js &
API_PID=$!

echo "==> Waiting for API readiness (status + agents; progress below)…"
export LI_DEV_READY_TIMEOUT_MS="${LI_DEV_READY_TIMEOUT_MS:-120000}"
if ! LI_AGENT_DASHBOARD_PORT="$API_PORT" node "$ROOT/scripts/wait-dev-stack-ready.mjs"; then
  echo "" >&2
  echo "ERROR: dev:all readiness failed — Next.js was not started." >&2
  echo "       Control API is still up: http://127.0.0.1:${API_PORT}/ (PID ${API_PID})" >&2
  echo "       Try: curl -s http://127.0.0.1:${API_PORT}/api/status | head" >&2
  echo "       Or retry with a longer wait: LI_DEV_READY_TIMEOUT_MS=180000 npm run dev:all" >&2
  echo "       Stop API: kill ${API_PID}" >&2
  exit 1
fi

trap - INT TERM
trap 'stop_api' EXIT INT TERM

echo ""
echo "  Dashboard UI:  http://127.0.0.1:${UI_PORT}/  (proxies /api → :${API_PORT})"
echo "  Control API:   http://127.0.0.1:${API_PORT}/"
echo "  Store:         ${LI_CONTROL_PLANE_STORE:-$_store}  Supabase: ${SUPABASE_URL:-(disk)}"
  echo "  Async swarm:   ${LI_AUTO_START_ASYNC_SWARM} (set LI_AUTO_START_ASYNC_SWARM=1 to enable workers)"
echo "  Ctrl+C stops API + UI"
echo ""

cd "$ROOT/dashboard-ui"
if ! npm run dev -- -p "$UI_PORT"; then
  echo "" >&2
  echo "WARN: Next.js exited — control API still on http://127.0.0.1:${API_PORT}/ (PID ${API_PID})" >&2
  echo "      Press Ctrl+C to stop the API, or run: kill ${API_PID}" >&2
  wait "$API_PID" 2>/dev/null || true
  exit 1
fi
stop_api

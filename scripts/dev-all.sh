#!/usr/bin/env bash
# One command for local dashboard development:
#   Supabase (optional) → build → control-plane API :9477 → Next.js UI :3000
#
# Usage:
#   npm run dev:all
#   LI_STACK_SKIP_SUPABASE=1 npm run dev:all    # disk store only
#   LI_AUTO_START_ASYNC_SWARM=1 npm run dev:all # auto-start swarm on boot
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Manual Start agents in UI by default; .env can override after env.defaults.
export LI_AUTO_START_ASYNC_SWARM="${LI_AUTO_START_ASYNC_SWARM:-0}"
export LI_AUTO_START_SUPERVISOR="${LI_AUTO_START_SUPERVISOR:-0}"

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

if [[ "${LI_STACK_SKIP_SUPABASE:-}" != "1" ]]; then
  echo "==> Supabase (migrations + .env.supabase)"
  if "$ROOT/scripts/ensure-supabase.sh"; then
    if [[ -f "$ROOT/.env.supabase" ]]; then
      set -a
      # shellcheck source=/dev/null
      source "$ROOT/.env.supabase"
      set +a
    fi
  else
    echo "WARN: Supabase ensure failed — use LI_STACK_SKIP_SUPABASE=1 or fix Docker" >&2
  fi
else
  export LI_CONTROL_PLANE_STORE="${LI_CONTROL_PLANE_STORE:-disk}"
  echo "==> Supabase skipped (LI_STACK_SKIP_SUPABASE=1, store=${LI_CONTROL_PLANE_STORE})"
fi

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
  echo "WARN: CURSOR_MOCK=1 — unset for real Cursor SDK runs" >&2
else
  unset CURSOR_MOCK 2>/dev/null || true
fi

PIDS=()
cleanup() {
  local pid
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

API_PORT="${LI_AGENT_DASHBOARD_PORT:-9477}"
UI_PORT="${LI_DASHBOARD_UI_PORT:-3000}"

echo "==> Control-plane API http://127.0.0.1:${API_PORT}/"
node dist/cli/serve-dashboard.js &
PIDS+=($!)

echo "==> Waiting for API…"
_ready=0
for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${API_PORT}/api/status" >/dev/null 2>&1; then
    _ready=1
    break
  fi
  sleep 0.25
done
if [[ "$_ready" != "1" ]]; then
  echo "WARN: API not responding yet — Next.js may show errors until it is up" >&2
fi

echo ""
echo "  Dashboard UI:  http://127.0.0.1:${UI_PORT}/  (proxies /api → :${API_PORT})"
echo "  Control API:   http://127.0.0.1:${API_PORT}/"
echo "  Store:         ${LI_CONTROL_PLANE_STORE:-supabase}  Supabase: ${SUPABASE_URL:-(none)}"
echo "  Auto swarm:    LI_AUTO_START_ASYNC_SWARM=${LI_AUTO_START_ASYNC_SWARM} (use UI Start agents if 0)"
echo "  Ctrl+C stops API + UI"
echo ""

cd "$ROOT/dashboard-ui"
exec npm run dev -- -p "$UI_PORT"

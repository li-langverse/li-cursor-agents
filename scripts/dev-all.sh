#!/usr/bin/env bash
# Full local stack (Majico-style): two processes — worker :9477 + Next UI :3000
#
# Usage:
#   npm run dev:all
#   npm run dev:worker    # worker only
#   npm run dev:ui        # UI only (worker must be up)
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=lib/dev-export-env.sh
source "$ROOT/scripts/lib/dev-export-env.sh"
dev_export_li_env

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

echo "==> TypeScript build (control plane + Next native /api)"
npm run build

if [[ "${CURSOR_MOCK:-}" == "1" ]]; then
  echo "WARN: CURSOR_MOCK=1 — real agent runs disabled" >&2
else
  unset CURSOR_MOCK 2>/dev/null || true
fi

if [[ -z "${CURSOR_API_KEY:-}" ]]; then
  echo "WARN: CURSOR_API_KEY unset — add to .env for live Cursor SDK runs" >&2
fi

API_PORT="${LI_AGENT_DASHBOARD_PORT}"
UI_PORT="${LI_DASHBOARD_UI_PORT}"

# shellcheck source=free-port.sh
source "$ROOT/scripts/free-port.sh"
for _port in "$API_PORT" "$UI_PORT"; do
  free_port "$_port" 15 || exit 1
done

chmod +x "$ROOT/scripts/worker-dev.sh" "$ROOT/scripts/ui-dev.sh"

mkdir -p "$ROOT/logs"
WORKER_LOG="$ROOT/logs/worker-dev.log"
: >"$WORKER_LOG"

echo ""
echo "  Architecture (like Majico dev:all):"
echo "    worker  → http://127.0.0.1:${API_PORT}/  agents, swarm, SDK runs"
echo "    ui      → http://127.0.0.1:${UI_PORT}/  Next.js (GET /api/* from Supabase)"
echo "    worker log file: ${WORKER_LOG}"
echo "  LI_AUTO_START_ASYNC_SWARM=${LI_AUTO_START_ASYNC_SWARM}"
echo ""

# concurrently: two labeled servers in one terminal (cyan worker, green ui)
exec npx --yes concurrently@9.1.2 \
  --kill-others-on-fail \
  --names "worker,ui" \
  --prefix-colors "cyan,green" \
  "bash \"$ROOT/scripts/worker-dev.sh\" 2>&1 | tee -a \"$WORKER_LOG\"" \
  "bash \"$ROOT/scripts/ui-dev.sh\""

#!/usr/bin/env bash
# One command: local Supabase + build + dashboard + supervisor loop.
#
# Usage:
#   ./scripts/start-stack.sh              # full stack (needs Docker for Supabase)
#   ./scripts/start-stack.sh --once       # single supervisor tick, then exit
#   LI_STACK_SKIP_SUPABASE=1 ./scripts/start-stack.sh   # disk cache only
#   LI_STACK_BACKFILL=1 ./scripts/start-stack.sh        # import data/ into DB first
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"

# --- env: .env then sibling GitHub ---
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi
if [[ -f "$LI_GITHUB_ENV" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$LI_GITHUB_ENV"
  set +a
  export GH_TOKEN GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
fi

# --- Supabase (primary store) ---
if [[ "${LI_STACK_SKIP_SUPABASE:-}" != "1" ]]; then
  if command -v supabase >/dev/null 2>&1 && [[ -f "$ROOT/supabase/config.toml" ]]; then
    echo "==> Supabase: start + db reset (migrations)"
    if supabase start && supabase db reset; then
      echo "==> Supabase: loading credentials into shell"
      # shellcheck disable=SC2046
      eval "$(supabase status -o env 2>/dev/null | grep -E '^SUPABASE_' || true)"
      export SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
      if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
        echo "WARN: SUPABASE_SERVICE_ROLE_KEY empty — run: supabase status" >&2
        echo "      Or set it in .env (see .env.example)" >&2
      fi
    else
      echo "WARN: Supabase failed (is Docker running?). Continuing with disk cache only." >&2
      echo "      Retry with Docker, or: LI_STACK_SKIP_SUPABASE=1 $0" >&2
    fi
  else
    echo "WARN: supabase CLI or supabase/config.toml missing — disk cache only" >&2
  fi
else
  echo "==> Supabase skipped (LI_STACK_SKIP_SUPABASE=1)"
fi

# --- Node ---
echo "==> npm install (if needed) + build"
if [[ ! -d node_modules ]]; then
  npm install
fi
npm run build

if [[ "${LI_STACK_BACKFILL:-}" == "1" ]] && [[ -n "${SUPABASE_URL:-}" ]] && [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "==> Backfill data/ → Supabase"
  npm run db:backfill
fi

if [[ -d "$BENCHMARKS_ROOT/scripts" ]] && [[ "${LI_STACK_PREFLIGHT:-}" == "1" ]]; then
  echo "==> Briefing preflight (benchmarks)"
  (cd "$BENCHMARKS_ROOT" && python3 scripts/agent-briefing.py) || true
fi

echo ""
echo "Stack ready:"
echo "  Dashboard:  http://127.0.0.1:${LI_AGENT_DASHBOARD_PORT:-9477}/"
echo "  Supabase:   ${SUPABASE_URL:-(not set — disk only)}"
echo "  Benchmarks:  $BENCHMARKS_ROOT"
echo "  Local CI:    $LI_LOCAL_CI_ROOT (LI_USE_LOCAL_CI=$LI_USE_LOCAL_CI)"
echo "  Agent SDK:   cursor-sdk (CURSOR_API_KEY in .env)"
echo ""

exec "$ROOT/scripts/start-control-plane.sh" "$@"

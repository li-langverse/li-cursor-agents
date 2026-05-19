#!/usr/bin/env bash
# Start Next.js for Playwright (read API → parent dist/db-api).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run build

if [[ "${LI_PLAYWRIGHT_USE_SUPABASE:-}" == "1" && -f "$ROOT/.env.supabase" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env.supabase"
  set +a
  export LI_CONTROL_PLANE_STORE=supabase
  export LI_USE_TEST_DATABASE=1
fi

if [[ -f "$ROOT/dashboard-ui/.playwright/e2e-env.sh" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/dashboard-ui/.playwright/e2e-env.sh"
  set +a
fi

export LI_CONTROL_PLANE_STORE="${LI_CONTROL_PLANE_STORE:-disk}"
export CURSOR_MOCK="${CURSOR_MOCK:-1}"

PORT="${LI_PLAYWRIGHT_UI_PORT:-3099}"
cd "$ROOT/dashboard-ui"
# Production server avoids Next dev singleton lock (port 3000 may already be in use).
npm run build
exec npx next start -p "$PORT"

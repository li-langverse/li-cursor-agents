#!/usr/bin/env bash
# Control-plane worker only (:9477) — pair with ui-dev.sh or dev:all concurrently.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=lib/dev-export-env.sh
source "$ROOT/scripts/lib/dev-export-env.sh"
dev_export_li_env

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi
# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"
li_resolve_env_paths "$ROOT"
if [[ -f "$ROOT/.env.supabase" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env.supabase"
  set +a
fi

exec node dist/cli/serve-dashboard.js --port "${LI_AGENT_DASHBOARD_PORT}"

#!/usr/bin/env bash
# Next.js dashboard UI only (:3000) — waits for worker health first.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/dev-export-env.sh
source "$ROOT/scripts/lib/dev-export-env.sh"
dev_export_li_env

PORT="${LI_AGENT_DASHBOARD_PORT}"
UI_PORT="${LI_DASHBOARD_UI_PORT}"
deadline=$((SECONDS + 120))
while (( SECONDS < deadline )); do
  if curl -sf --max-time 2 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  echo "[ui] worker ready at http://127.0.0.1:${PORT}/"
    break
  fi
  sleep 0.5
done
if ! curl -sf --max-time 2 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  echo "[ui] ERROR: worker not reachable on :${PORT} — start npm run dev:worker first" >&2
  exit 1
fi

cd "$ROOT/dashboard-ui"
export NEXT_PUBLIC_LI_WORKER_URL="http://127.0.0.1:${PORT}"
exec npm run dev -- -p "$UI_PORT"

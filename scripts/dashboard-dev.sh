#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d dashboard-ui/node_modules ]]; then
  (cd dashboard-ui && npm install)
fi

echo "Starting control plane API on :9477 (background)…"
npm run build >/dev/null
LI_CONTROL_PLANE_STORE="${LI_CONTROL_PLANE_STORE:-disk}" \
  CURSOR_MOCK="${CURSOR_MOCK:-1}" \
  node dist/cli/serve-dashboard.js &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT

sleep 1
echo "Starting Next.js UI on :3000 (proxies /api → :9477)…"
cd dashboard-ui
exec npm run dev

#!/usr/bin/env bash
# Stop hung li-cursor-agents tests, SDK matrix runs, dashboard, and swarm workers.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${LI_AGENT_DASHBOARD_PORT:-9477}"

echo "==> stop dashboard / swarm on :${PORT}"
curl -sf -m 2 -X POST "http://127.0.0.1:${PORT}/api/async-swarm/stop" \
  -H "Content-Type: application/json" -d '{}' >/dev/null 2>&1 || true
if lsof -ti ":${PORT}" >/dev/null 2>&1; then
  lsof -ti ":${PORT}" | xargs kill -9 2>/dev/null || true
fi

patterns=(
  "verify-all-agents-sdk"
  "agent-all-leaves-sdk"
  "run-ci-tests"
  "tail -f /tmp/li-sdk-matrix"
  "node --test"
  "dist/cli/async-swarm"
  "dist/cli/serve-dashboard"
  "dist/cli/supervisor"
  "scripts/dev-all.sh"
  "npm run dev:all"
  "npm test"
)

echo "==> pkill agent-related node processes (SIGTERM, then SIGKILL)"
for pat in "${patterns[@]}"; do
  pkill -f "$pat" 2>/dev/null || true
done
sleep 2
for pat in "${patterns[@]}"; do
  pkill -9 -f "$pat" 2>/dev/null || true
done

echo "==> reclaim SDK slot locks"
if [[ -f "$ROOT/dist/backends/sdk-session-lock.js" ]]; then
  (
    cd "$ROOT"
    node -e "
      import { reclaimAllStaleSdkSlots } from './dist/backends/sdk-session-lock.js';
      console.log('reclaimed', reclaimAllStaleSdkSlots(), 'sdk lock(s)');
    " 2>/dev/null || true
  )
fi

echo "==> done (remaining listeners on :${PORT})"
lsof -ti ":${PORT}" 2>/dev/null && echo "WARN: port ${PORT} still in use" || echo "port ${PORT} free"

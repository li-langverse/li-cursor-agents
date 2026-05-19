#!/usr/bin/env bash
# Run real SDK live-stream e2e for every leaf agent (required gate — not optional).
# Requires CURSOR_API_KEY in .env. Billed + slow (~2–8 min per agent).
#
# Usage:
#   ./scripts/verify-all-agents-sdk-stream.sh
#   VERIFY_AGENT=bug_fixer ./scripts/verify-all-agents-sdk-stream.sh
#   LI_E2E_USE_SUPABASE=1 ./scripts/verify-all-agents-sdk-stream.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${CURSOR_API_KEY:-}" && -z "${CURSOR_SDK_KEY:-}" && -z "${CURSOR_SDK:-}" ]]; then
  echo "ERROR: CURSOR_API_KEY required in .env" >&2
  exit 1
fi

stop_control_plane() {
  local port="${LI_AGENT_DASHBOARD_PORT:-9477}"
  echo "==> stop control plane on :${port} (free SDK slots)"
  if curl -sf -m 3 -X POST "http://127.0.0.1:${port}/api/async-swarm/stop" \
    -H "Content-Type: application/json" -d '{}' >/dev/null 2>&1; then
    echo "    POST /api/async-swarm/stop"
  fi
  sleep 1
  if lsof -ti ":${port}" >/dev/null 2>&1; then
    echo "    killing listener on :${port}"
    lsof -ti ":${port}" | xargs kill 2>/dev/null || true
    sleep 1
  fi
  pkill -f "dist/cli/async-swarm.js" 2>/dev/null || true
  pkill -f "dist/cli/serve-dashboard.js" 2>/dev/null || true
  pkill -f "dist/cli/supervisor.js" 2>/dev/null || true
  sleep 1
}

reclaim_sdk_locks() {
  echo "==> reclaim stale SDK slot locks"
  node -e "
    import { reclaimAllStaleSdkSlots } from './dist/backends/sdk-session-lock.js';
    const n = reclaimAllStaleSdkSlots();
    console.log('    reclaimed', n, 'lock file(s)');
  "
}

echo "==> build"
npm run build

stop_control_plane
reclaim_sdk_locks

SDK_LOG_DIR="${LI_E2E_SDK_LOG_DIR:-$ROOT/logs/sdk-matrix}"
mkdir -p "$SDK_LOG_DIR"
echo "==> env: disk store, single SDK slot, no mock"
echo "==> agent output logs: ${SDK_LOG_DIR}/all.log (and one file per agent)"
export LI_E2E_SDK_LOG_DIR="$SDK_LOG_DIR"
export LI_E2E_SDK=1
export LI_E2E_SDK_ALL_LEAVES=1
export LI_LIVE_TRACE_FLUSH_MS=0
export LI_WORKSPACE_SWEEP_FORCE_LLM=1
export LI_SDK_MAX_CONCURRENT=1
export LI_SDK_SLOT_MAX_WAIT_MS=600000
export LI_SWARM_MERGE_RECOMMENDATIONS=0
unset CURSOR_MOCK

if [[ "${LI_E2E_USE_SUPABASE:-}" != "1" ]]; then
  export LI_CONTROL_PLANE_STORE=disk
  export LI_STACK_SKIP_SUPABASE=1
  export LI_LIVE_STREAM_DB=0
  unset SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY SUPABASE_ANON_KEY || true
fi

AGENTS=()
while IFS= read -r _agent; do
  [[ -n "$_agent" ]] && AGENTS+=("$_agent")
done < <(
  VERIFY_AGENT="${VERIFY_AGENT:-}" node -e "
    import { ALL_LEAF_AGENTS } from './dist/e2e/all-leaves-shared.js';
    const one = process.env.VERIFY_AGENT?.trim();
    if (one) {
      if (!ALL_LEAF_AGENTS.some((a) => a.id === one)) {
        console.error('unknown VERIFY_AGENT:', one);
        process.exit(1);
      }
      console.log(one);
    } else {
      for (const a of ALL_LEAF_AGENTS) console.log(a.id);
    }
  "
)

TOTAL="${#AGENTS[@]}"
echo "==> real SDK live-stream matrix: ${TOTAL} agent(s)"
echo ""

FAIL=0
IDX=0
for agent in "${AGENTS[@]}"; do
  IDX=$((IDX + 1))
  echo ""
  echo "================================================================"
  echo "==> [${IDX}/${TOTAL}] $(date -Iseconds)  agent: ${agent}"
  echo "================================================================"
  # Line-buffered: one agent per node --test process, stdout unbuffered when piped.
  _run_test() {
    if command -v stdbuf >/dev/null 2>&1; then
      stdbuf -oL -eL node --test --test-concurrency=1 "$@"
    else
      node --test --test-concurrency=1 "$@"
    fi
  }
  # Node treats --test-name-pattern as RegExp; agent id is unique in the test title.
  if ! _run_test \
    --test-name-pattern=": ${agent}\$" \
    dist/e2e/agent-all-leaves-sdk.e2e.js; then
    echo "FAILED: ${agent}" >&2
    FAIL=$((FAIL + 1))
    if [[ "${VERIFY_CONTINUE_ON_FAIL:-}" != "1" ]]; then
      exit 1
    fi
  else
    echo "PASSED: ${agent}"
  fi
done

if [[ "$FAIL" -gt 0 ]]; then
  echo "" >&2
  echo "ERROR: ${FAIL}/${TOTAL} agent(s) failed SDK live-stream verification" >&2
  exit 1
fi

echo ""
echo "OK: all ${TOTAL} leaf agent(s) passed SDK live-stream verification"

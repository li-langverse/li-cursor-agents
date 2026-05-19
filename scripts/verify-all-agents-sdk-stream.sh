#!/usr/bin/env bash
# Run real SDK live-stream e2e for every leaf agent **sequentially** (required gate).
# Compare wall time with ./scripts/verify-all-agents-sdk-parallel.sh
#
# Usage:
#   ./scripts/verify-all-agents-sdk-stream.sh
#   VERIFY_AGENT=bug_fixer ./scripts/verify-all-agents-sdk-stream.sh
#   LI_E2E_USE_SUPABASE=1 ./scripts/verify-all-agents-sdk-stream.sh
#   node scripts/compare-sdk-matrix-timing.mjs
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "$ROOT/scripts/sdk-matrix-lib.sh"

cd "$ROOT"
sdk_matrix_load_env "$ROOT"
sdk_matrix_require_api_key

echo "==> build"
npm run build

sdk_matrix_stop_control_plane
sdk_matrix_reclaim_locks "$ROOT"

SDK_LOG_DIR="${LI_E2E_SDK_LOG_DIR:-$ROOT/logs/sdk-matrix}"
TIMING_FILE="${LI_SDK_MATRIX_TIMING_FILE:-$SDK_LOG_DIR/timing-sequential.jsonl}"
mkdir -p "$SDK_LOG_DIR"
rm -f "$TIMING_FILE"
touch "$TIMING_FILE"

echo "==> env: disk store, single SDK slot, sequential (one agent per process)"
echo "==> agent output logs: ${SDK_LOG_DIR}/all.log (and one file per agent)"
echo "==> timing: ${TIMING_FILE}"
export LI_E2E_SDK_LOG_DIR="$SDK_LOG_DIR"
export LI_SDK_MATRIX_MODE=sequential
export LI_SDK_MATRIX_TIMING_FILE="$TIMING_FILE"
sdk_matrix_base_env
export LI_SDK_MAX_CONCURRENT=1
export LI_SDK_SLOT_MAX_WAIT_MS=600000

AGENTS=()
while IFS= read -r _agent; do
  [[ -n "$_agent" ]] && AGENTS+=("$_agent")
done < <(sdk_matrix_list_agents "$ROOT")

TOTAL="${#AGENTS[@]}"
WALL_START=$(date +%s)
echo "==> sequential SDK live-stream matrix: ${TOTAL} agent(s)"
echo ""

FAIL=0
IDX=0
for agent in "${AGENTS[@]}"; do
  IDX=$((IDX + 1))
  AGENT_START=$(date +%s)
  echo ""
  echo "================================================================"
  echo "==> [${IDX}/${TOTAL}] $(date -Iseconds)  agent: ${agent}  (sequential)"
  echo "================================================================"
  _run_test() {
    if command -v stdbuf >/dev/null 2>&1; then
      stdbuf -oL -eL node --test --test-concurrency=1 "$@"
    else
      node --test --test-concurrency=1 "$@"
    fi
  }
  if ! _run_test \
    --test-name-pattern=": ${agent}\$" \
    dist/e2e/agent-all-leaves-sdk.e2e.js; then
    AGENT_END=$(date +%s)
    AGENT_SEC=$((AGENT_END - AGENT_START))
    echo "FAILED: ${agent} (${AGENT_SEC}s)" >&2
    FAIL=$((FAIL + 1))
    if [[ "${VERIFY_CONTINUE_ON_FAIL:-}" != "1" ]]; then
      WALL_END=$(date +%s)
      printf '%s\n' "{\"mode\":\"sequential\",\"wall_seconds\":$((WALL_END - WALL_START)),\"agents\":${TOTAL},\"completed\":${IDX},\"status\":\"fail\",\"at\":\"$(date -Iseconds)\"}" \
        >"${SDK_LOG_DIR}/wall-summary.json"
      exit 1
    fi
  else
    AGENT_END=$(date +%s)
    AGENT_SEC=$((AGENT_END - AGENT_START))
    echo "PASSED: ${agent} (${AGENT_SEC}s)"
  fi
done

WALL_END=$(date +%s)
WALL_SEC=$((WALL_END - WALL_START))
printf '%s\n' "{\"mode\":\"sequential\",\"wall_seconds\":${WALL_SEC},\"agents\":${TOTAL},\"status\":\"$([[ $FAIL -eq 0 ]] && echo ok || echo fail)\",\"at\":\"$(date -Iseconds)\"}" \
  >"${SDK_LOG_DIR}/wall-summary.json"

if [[ "$FAIL" -gt 0 ]]; then
  echo "" >&2
  echo "ERROR: ${FAIL}/${TOTAL} agent(s) failed SDK live-stream verification (${WALL_SEC}s wall)" >&2
  exit 1
fi

echo ""
echo "OK: all ${TOTAL} leaf agent(s) passed sequential SDK verification (${WALL_SEC}s wall)"
echo "Compare: node scripts/compare-sdk-matrix-timing.mjs"

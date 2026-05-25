#!/usr/bin/env bash
# Real SDK matrix — all leaf agents in parallel (compare wall time vs sequential script).
#
# Usage:
#   ./scripts/verify-all-agents-sdk-parallel.sh
#   LI_SDK_MAX_CONCURRENT=4 LI_E2E_SDK_TEST_CONCURRENCY=4 ./scripts/verify-all-agents-sdk-parallel.sh
#   ./scripts/compare-sdk-matrix-timing.mjs   # after both sequential + parallel runs
#
# Logs: logs/sdk-matrix-parallel/ (separate from sequential logs/sdk-matrix/)
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

SDK_LOG_DIR="${LI_E2E_SDK_LOG_DIR:-$ROOT/logs/sdk-matrix-parallel}"
TIMING_FILE="${LI_SDK_MATRIX_TIMING_FILE:-$SDK_LOG_DIR/timing-parallel.jsonl}"
mkdir -p "$SDK_LOG_DIR"
rm -f "$TIMING_FILE"
touch "$TIMING_FILE"

export LI_E2E_SDK_LOG_DIR="$SDK_LOG_DIR"
export LI_SDK_MATRIX_MODE=parallel
export LI_SDK_MATRIX_TIMING_FILE="$TIMING_FILE"
sdk_matrix_base_env

export LI_SDK_MAX_CONCURRENT="${LI_SDK_MAX_CONCURRENT:-4}"
export LI_SDK_SLOT_MAX_WAIT_MS="${LI_SDK_SLOT_MAX_WAIT_MS:-900000}"
TEST_CONCURRENCY="${LI_E2E_SDK_TEST_CONCURRENCY:-$LI_SDK_MAX_CONCURRENT}"

AGENT_COUNT="$(sdk_matrix_list_agents "$ROOT" | wc -l | tr -d ' ')"
echo "==> parallel SDK matrix: ${AGENT_COUNT} leaf agents"
echo "==> LI_SDK_MAX_CONCURRENT=${LI_SDK_MAX_CONCURRENT} node --test-concurrency=${TEST_CONCURRENCY}"
echo "==> logs: ${SDK_LOG_DIR}/all.log"
echo "==> timing: ${TIMING_FILE}"
echo ""

WALL_START=$(date +%s)
_run_test() {
  if command -v stdbuf >/dev/null 2>&1; then
    stdbuf -oL -eL node --test --test-concurrency="$TEST_CONCURRENCY" "$@"
  else
    node --test --test-concurrency="$TEST_CONCURRENCY" "$@"
  fi
}

if ! _run_test dist/e2e/agent-all-leaves-sdk.e2e.js 2>&1 | tee "${SDK_LOG_DIR}/run.log"; then
  WALL_END=$(date +%s)
  WALL_SEC=$((WALL_END - WALL_START))
  printf '%s\n' "{\"mode\":\"parallel\",\"wall_seconds\":${WALL_SEC},\"agents\":${AGENT_COUNT},\"status\":\"fail\",\"at\":\"$(date -Iseconds)\"}" \
    >"${SDK_LOG_DIR}/wall-summary.json"
  echo "FAILED: parallel SDK matrix (${WALL_SEC}s wall)" >&2
  exit 1
fi

WALL_END=$(date +%s)
WALL_SEC=$((WALL_END - WALL_START))
printf '%s\n' "{\"mode\":\"parallel\",\"wall_seconds\":${WALL_SEC},\"agents\":${AGENT_COUNT},\"sdk_max_concurrent\":${LI_SDK_MAX_CONCURRENT},\"test_concurrency\":${TEST_CONCURRENCY},\"status\":\"ok\",\"at\":\"$(date -Iseconds)\"}" \
  >"${SDK_LOG_DIR}/wall-summary.json"

echo ""
echo "OK: parallel SDK matrix finished in ${WALL_SEC}s wall (${AGENT_COUNT} agents)"
echo "Compare: node scripts/compare-sdk-matrix-timing.mjs"

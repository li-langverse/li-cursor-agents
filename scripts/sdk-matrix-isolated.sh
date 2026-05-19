#!/usr/bin/env bash
# Run each leaf agent SDK test in isolation (one process at a time).
# Detects stalls via per-agent wall timeout; reclaims SDK locks between runs.
#
# Usage:
#   ./scripts/sdk-matrix-isolated.sh
#   AGENT_TIMEOUT_SEC=720 ./scripts/sdk-matrix-isolated.sh
#   FROM_AGENT=issue_planner ./scripts/sdk-matrix-isolated.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "$ROOT/scripts/sdk-matrix-lib.sh"

cd "$ROOT"
sdk_matrix_load_env "$ROOT"
sdk_matrix_require_api_key

PER_AGENT_TIMEOUT="${AGENT_TIMEOUT_SEC:-720}"
TIMING_FILE="${LI_SDK_MATRIX_TIMING_FILE:-$ROOT/logs/sdk-matrix/timing-sequential.jsonl}"
RESULTS_FILE="${LI_SDK_MATRIX_RESULTS:-$ROOT/logs/sdk-matrix/isolated-results.jsonl}"
LOG_DIR="${LI_E2E_SDK_LOG_DIR:-$ROOT/logs/sdk-matrix}"
mkdir -p "$LOG_DIR"
touch "$TIMING_FILE" "$RESULTS_FILE"

echo "==> build"
npm run build

sdk_matrix_stop_control_plane
sdk_matrix_reclaim_locks "$ROOT"

export LI_E2E_SDK_LOG_DIR="$LOG_DIR"
export LI_SDK_MATRIX_MODE=sequential
export LI_SDK_MATRIX_TIMING_FILE="$TIMING_FILE"
export LI_SDK_MAX_CONCURRENT=1
export LI_SDK_SLOT_MAX_WAIT_MS="${LI_SDK_SLOT_MAX_WAIT_MS:-120000}"
export LI_E2E_SDK_STREAM_WAIT_MS="${LI_E2E_SDK_STREAM_WAIT_MS:-180000}"
sdk_matrix_base_env

finished_agent() {
  local agent="$1"
  grep -q "\"agent\":\"${agent}\".*\"status\":\"finished\"" "$TIMING_FILE" 2>/dev/null ||
    grep -q "\"status\":\"finished\".*\"agent\":\"${agent}\"" "$TIMING_FILE" 2>/dev/null
}

record_result() {
  local agent="$1" status="$2" seconds="$3" note="${4:-}"
  printf '%s\n' \
    "{\"agent\":\"${agent}\",\"status\":\"${status}\",\"seconds\":${seconds},\"note\":\"${note}\",\"at\":\"$(date -Iseconds)\"}" \
    >>"$RESULTS_FILE"
}

FROM="${FROM_AGENT:-}"
SEEN_FROM=0
TOTAL=0
PASS=0
FAIL=0
STALL=0

while IFS= read -r agent; do
  [[ -n "$agent" ]] || continue
  TOTAL=$((TOTAL + 1))
  if [[ -n "$FROM" && "$SEEN_FROM" -eq 0 ]]; then
    if [[ "$agent" != "$FROM" ]]; then
      echo "==> skip until FROM_AGENT=${FROM} ($agent)"
      continue
    fi
    SEEN_FROM=1
  fi
  if finished_agent "$agent"; then
    echo "==> skip ${agent} (already finished)"
    continue
  fi

  echo ""
  echo "################################################################"
  echo "==> isolated run: ${agent} (timeout ${PER_AGENT_TIMEOUT}s)"
  echo "################################################################"
  "$ROOT/scripts/kill-stale-agent-processes.sh" 2>/dev/null | sed 's/^/    /' || true
  sdk_matrix_reclaim_locks "$ROOT"

  START=$(date +%s)
  AGENT_LOG="${LOG_DIR}/isolated-${agent}.log"
  set +e
  if command -v timeout >/dev/null 2>&1; then
    timeout "$PER_AGENT_TIMEOUT" env VERIFY_AGENT="$agent" \
      npm run test:verify-all-agents-sdk-stream \
      >"$AGENT_LOG" 2>&1
    RC=$?
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$PER_AGENT_TIMEOUT" env VERIFY_AGENT="$agent" \
      npm run test:verify-all-agents-sdk-stream \
      >"$AGENT_LOG" 2>&1
    RC=$?
  else
    env VERIFY_AGENT="$agent" npm run test:verify-all-agents-sdk-stream >"$AGENT_LOG" 2>&1
    RC=$?
  fi
  set -e
  END=$(date +%s)
  SEC=$((END - START))

  if [[ "$RC" -eq 124 || "$RC" -eq 137 ]]; then
    STALL=$((STALL + 1))
    record_result "$agent" "stall" "$SEC" "timeout_${PER_AGENT_TIMEOUT}s"
    echo "STALL: ${agent} (no completion within ${PER_AGENT_TIMEOUT}s) — see ${AGENT_LOG}"
    tail -20 "$AGENT_LOG" >&2 || true
    continue
  fi

  if finished_agent "$agent"; then
    PASS=$((PASS + 1))
    record_result "$agent" "pass" "$SEC" ""
    echo "PASSED: ${agent} (${SEC}s)"
  else
    FAIL=$((FAIL + 1))
    record_result "$agent" "fail" "$SEC" "exit_${RC}"
    echo "FAILED: ${agent} (${SEC}s) exit=${RC} — see ${AGENT_LOG}"
    tail -30 "$AGENT_LOG" >&2 || true
  fi
done < <(sdk_matrix_list_agents "$ROOT")

echo ""
echo "==> isolated matrix summary: pass=${PASS} fail=${FAIL} stall=${STALL}"
echo "==> timing: ${TIMING_FILE}"
echo "==> results: ${RESULTS_FILE}"
[[ "$FAIL" -eq 0 && "$STALL" -eq 0 ]]

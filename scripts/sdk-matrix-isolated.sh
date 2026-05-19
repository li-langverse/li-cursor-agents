#!/usr/bin/env bash
# Run each leaf agent SDK test in isolation (one process at a time).
# Stall = no log activity for SDK_MATRIX_IDLE_SEC (default 3m). No fixed wall cap unless SDK_MATRIX_MAX_WALL_SEC>0.
#
# Usage:
#   ./scripts/sdk-matrix-isolated.sh
#   SDK_MATRIX_IDLE_SEC=300 ./scripts/sdk-matrix-isolated.sh
#   FROM_AGENT=agent_kit_maintainer ./scripts/sdk-matrix-isolated.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "$ROOT/scripts/sdk-matrix-lib.sh"

cd "$ROOT"
sdk_matrix_load_env "$ROOT"
sdk_matrix_require_api_key

IDLE_SEC="${SDK_MATRIX_IDLE_SEC:-180}"
MAX_WALL_SEC="${SDK_MATRIX_MAX_WALL_SEC:-0}"
POLL_SEC="${SDK_MATRIX_IDLE_POLL_SEC:-15}"
TIMING_FILE="${LI_SDK_MATRIX_TIMING_FILE:-$ROOT/logs/sdk-matrix/timing-sequential.jsonl}"
RESULTS_FILE="${LI_SDK_MATRIX_RESULTS:-$ROOT/logs/sdk-matrix/isolated-results.jsonl}"
LOG_DIR="${LI_E2E_SDK_LOG_DIR:-$ROOT/logs/sdk-matrix}"
ALL_LOG="${LOG_DIR}/all.log"
mkdir -p "$LOG_DIR"
touch "$TIMING_FILE" "$RESULTS_FILE" "$ALL_LOG"

echo "==> build (once)"
npm run build
export LI_SDK_MATRIX_SKIP_BUILD=1

sdk_matrix_stop_control_plane
sdk_matrix_reclaim_locks "$ROOT"

export LI_E2E_SDK_LOG_DIR="$LOG_DIR"
export LI_SDK_MATRIX_MODE=sequential
export LI_SDK_MATRIX_TIMING_FILE="$TIMING_FILE"
export LI_SDK_MATRIX_APPEND_TIMING=1
export LI_SDK_MAX_CONCURRENT=1
export LI_SDK_SLOT_MAX_WAIT_MS="${LI_SDK_MATRIX_SLOT_MAX_WAIT_MS:-120000}"
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

log_activity_bytes() {
  local agent_log="$1"
  local n=0
  if [[ -f "$agent_log" ]]; then
    n=$((n + $(stat -f%z "$agent_log" 2>/dev/null || echo 0)))
  fi
  if [[ -f "$ALL_LOG" ]]; then
    n=$((n + $(stat -f%z "$ALL_LOG" 2>/dev/null || echo 0)))
  fi
  echo "$n"
}

# Run one agent; kill only after IDLE_SEC with no growth in agent log or all.log.
run_agent_with_idle_watchdog() {
  local agent="$1" agent_log="$2"
  local start_ts last_change last_bytes now bytes idle_for wall
  start_ts=$(date +%s)
  last_change=$start_ts
  last_bytes=$(log_activity_bytes "$agent_log")

  (
    if command -v stdbuf >/dev/null 2>&1; then
      exec stdbuf -oL -eL env VERIFY_AGENT="$agent" LI_SDK_MATRIX_SKIP_BUILD=1 \
        npm run test:verify-all-agents-sdk-stream
    else
      exec env VERIFY_AGENT="$agent" LI_SDK_MATRIX_SKIP_BUILD=1 \
        npm run test:verify-all-agents-sdk-stream
    fi
  ) >>"$agent_log" 2>&1 &
  local pid=$!
  echo "    watchdog: pid=${pid} idle_limit=${IDLE_SEC}s poll=${POLL_SEC}s max_wall=${MAX_WALL_SEC:-none}"

  while kill -0 "$pid" 2>/dev/null; do
    sleep "$POLL_SEC"
    now=$(date +%s)
    bytes=$(log_activity_bytes "$agent_log")
    if [[ "$bytes" -gt "$last_bytes" ]]; then
      last_bytes=$bytes
      last_change=$now
    fi
    idle_for=$((now - last_change))
    if [[ "$idle_for" -ge "$IDLE_SEC" ]]; then
      echo "    idle watchdog: no log growth for ${idle_for}s (limit ${IDLE_SEC}s) — interrupting"
      kill -TERM "$pid" 2>/dev/null || true
      sleep 2
      kill -KILL "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      return 124
    fi
    if [[ "$MAX_WALL_SEC" -gt 0 ]]; then
      wall=$((now - start_ts))
      if [[ "$wall" -ge "$MAX_WALL_SEC" ]]; then
        echo "    idle watchdog: max wall ${MAX_WALL_SEC}s — interrupting"
        kill -TERM "$pid" 2>/dev/null || true
        sleep 2
        kill -KILL "$pid" 2>/dev/null || true
        wait "$pid" 2>/dev/null || true
        return 124
      fi
    fi
  done
  wait "$pid"
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
  echo "==> isolated run: ${agent} (idle watchdog ${IDLE_SEC}s, no fixed wall cap)"
  echo "################################################################"
  "$ROOT/scripts/kill-stale-agent-processes.sh" 2>/dev/null | sed 's/^/    /' || true
  sdk_matrix_reclaim_locks "$ROOT"

  START=$(date +%s)
  AGENT_LOG="${LOG_DIR}/isolated-${agent}.log"
  : >"$AGENT_LOG"
  set +e
  run_agent_with_idle_watchdog "$agent" "$AGENT_LOG"
  RC=$?
  set -e
  END=$(date +%s)
  SEC=$((END - START))

  if [[ "$RC" -eq 124 || "$RC" -eq 137 ]]; then
    STALL=$((STALL + 1))
    record_result "$agent" "stall" "$SEC" "idle_${IDLE_SEC}s"
    echo "STALL: ${agent} (no activity for ${IDLE_SEC}s) — see ${AGENT_LOG}"
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

#!/usr/bin/env bash
# Overnight Cursor SDK agent sweep (real API — not mock).
# Logs: data/runs/overnight-YYYYMMDD-HHMMSS.log
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -n "${BENCHMARKS_ROOT:-}" ]]; then
  BENCHMARKS="$BENCHMARKS_ROOT"
elif [[ -f "$ROOT/../scripts/agent-briefing.py" ]]; then
  BENCHMARKS="$(cd "$ROOT/.." && pwd)"
else
  BENCHMARKS="$(cd "$ROOT/../benchmarks" 2>/dev/null && pwd || echo "$ROOT/../benchmarks")"
fi
LOG_DIR="$ROOT/data/runs"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/overnight-${STAMP}.log"
PIDFILE="$LOG_DIR/overnight-${STAMP}.pid"

mkdir -p "$LOG_DIR"
echo "$$" >"$PIDFILE"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }

log "overnight-run start pid=$$ root=$ROOT benchmarks=$BENCHMARKS"

if [[ -z "${CURSOR_API_KEY:-}${CURSOR_SDK_KEY:-}${CURSOR_SDK:-}" ]]; then
  if [[ -f "$ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ROOT/.env"
    set +a
    log "loaded $ROOT/.env"
  fi
fi

if [[ -z "${CURSOR_API_KEY:-}${CURSOR_SDK_KEY:-}${CURSOR_SDK:-}" ]]; then
  log "ERROR: no Cursor API key (CURSOR_API_KEY / CURSOR_SDK_KEY / CURSOR_SDK)"
  exit 1
fi

log "API key present (redacted)"

cd "$ROOT"
npm run build >>"$LOG" 2>&1

AGENTS=(orchestrator ecosystem_explorer pr_alignment plan_completion)
# Skip numerics first night unless briefing shows red benches — add manually if needed

for agent in "${AGENTS[@]}"; do
  log "=== agent: $agent ==="
  if ! node dist/cli/run-agent.js --agent "$agent" --benchmarks "$BENCHMARKS" >>"$LOG" 2>&1; then
    log "WARN: agent $agent exited non-zero (see log)"
  else
    log "OK: agent $agent finished"
  fi
  sleep 10
done

log "overnight-run complete"
rm -f "$PIDFILE"

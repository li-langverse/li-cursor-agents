#!/usr/bin/env bash
# Adaptive overnight Cursor SDK agent sweep.
# Uses the self-improving scheduler instead of a fixed agent list.
# Logs: data/runs/overnight-YYYYMMDD-HHMMSS.log
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/data/runs"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/overnight-adaptive-${STAMP}.log"

mkdir -p "$LOG_DIR"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }

log "overnight-adaptive start pid=$$ root=$ROOT"

if [[ -z "${CURSOR_API_KEY:-}${CURSOR_SDK_KEY:-}${CURSOR_SDK:-}" ]]; then
  if [[ -f "$ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ROOT/.env"
    set +a
    log "loaded $ROOT/.env"
  fi
fi

MOCK_FLAG=""
if [[ -z "${CURSOR_API_KEY:-}${CURSOR_SDK_KEY:-}${CURSOR_SDK:-}" ]]; then
  log "WARN: no Cursor API key — running in mock mode"
  MOCK_FLAG="--mock"
else
  log "API key present (redacted)"
fi

cd "$ROOT"
npm run build >>"$LOG" 2>&1

log "starting adaptive overnight runner"
node dist/cli/overnight-adaptive.js $MOCK_FLAG --sleep 10000 2>>"$LOG" | tee -a "$LOG"

log "overnight-adaptive complete"

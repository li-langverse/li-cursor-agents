#!/usr/bin/env bash
# Run once after Cloud Agent VM restart (env vars like CURSOR_SDK are injected at boot).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="$ROOT/data/runs/session-start.log"
mkdir -p "$(dirname "$LOG")"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG"; }

log "session-start-sdk: checking key"
if ! "$ROOT/scripts/check-sdk-key.sh" >>"$LOG" 2>&1; then
  log "no key — add CURSOR_SDK in Cloud Agent env, then restart VM"
  exit 1
fi

log "smoke test"
if ! "$ROOT/scripts/sdk-smoke.sh" >>"$LOG" 2>&1; then
  log "smoke failed — see $LOG"
  exit 1
fi

log "starting overnight-run in background"
nohup "$ROOT/scripts/overnight-run.sh" >>"$LOG" 2>&1 &
echo $! >"$ROOT/data/runs/overnight.pid"
log "overnight pid=$(cat "$ROOT/data/runs/overnight.pid")"

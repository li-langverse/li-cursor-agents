#!/usr/bin/env bash
# Wait for Cursor API key in env or .env, then run overnight-run.sh (for Cloud Agent VMs).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/data/runs/wait-overnight.log"
mkdir -p "$(dirname "$LOG")"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG"; }

has_key() {
  [[ -n "${CURSOR_API_KEY:-}${CURSOR_SDK_KEY:-}${CURSOR_SDK:-}" ]] && return 0
  if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
  [[ -n "${CURSOR_API_KEY:-}${CURSOR_SDK_KEY:-}${CURSOR_SDK:-}" ]] && return 0
  npm run build -s >/dev/null 2>&1 || true
  node -e "import('./dist/env.js').then(m=>{m.loadDotEnv();process.exit(m.resolveCursorApiKey()?0:1)})" 2>/dev/null
}

MAX_WAIT_HOURS="${MAX_WAIT_HOURS:-12}"
INTERVAL_SEC="${INTERVAL_SEC:-120}"
TRIES=$((MAX_WAIT_HOURS * 3600 / INTERVAL_SEC))

log "wait-and-overnight: max ${MAX_WAIT_HOURS}h, poll every ${INTERVAL_SEC}s"

for ((i=1; i<=TRIES; i++)); do
  if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
  if has_key; then
    log "API key detected — starting overnight-run"
    exec "$ROOT/scripts/overnight-run.sh"
  fi
  log "poll $i/$TRIES: no key (set CURSOR_SDK / CURSOR_SDK_KEY / CURSOR_API_KEY — restart VM after adding)"
  sleep "$INTERVAL_SEC"
done

log "timeout: never received API key"
exit 1

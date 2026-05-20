#!/usr/bin/env bash
# Run numerics/ecosystem researchers on a loop for several hours (real Cursor SDK).
#
#   LI_RESEARCH_DURATION_SEC=7200   # default 2h
#   LI_RESEARCH_PAUSE_SEC=120         # pause between agent runs (default 2m)
#   LI_RESEARCH_AGENTS="gap_explorer,numerics_researcher,autoresearch"
#
# Logs: logs/researchers-long.log
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p logs

# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"
if [[ -f "$ROOT/.env" ]]; then set -a && source "$ROOT/.env" && set +a; fi
li_resolve_env_paths "$ROOT"
if [[ -f "$ROOT/.env.supabase" ]]; then set -a && source "$ROOT/.env.supabase" && set +a; fi
export GH_TOKEN GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
unset CURSOR_MOCK

DURATION="${LI_RESEARCH_DURATION_SEC:-7200}"
PAUSE="${LI_RESEARCH_PAUSE_SEC:-120}"
LOG="$ROOT/logs/researchers-long.log"
END=$((SECONDS + DURATION))
IFS=',' read -r -a AGENTS <<< "${LI_RESEARCH_AGENTS:-gap_explorer,numerics_researcher,autoresearch}"

log() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [researchers] $*" | tee -a "$LOG"
}

if [[ -z "${CURSOR_API_KEY:-}${CURSOR_SDK_KEY:-}${CURSOR_SDK:-}" ]]; then
  log "ERROR: no Cursor API key"
  exit 1
fi

npm run build -s >>"$LOG" 2>&1
log "start duration=${DURATION}s pause=${PAUSE}s agents=${LI_RESEARCH_AGENTS:-gap_explorer,numerics_researcher,autoresearch} benchmarks=${BENCHMARKS_ROOT}"

EXTRA='Produce Executive summary, Deliverable/findings with evidence paths, and Deferred. Cite real preflight/briefing data. For numerics: include li-tests/, benchmarks/, or docs/numerics/ references when proposing changes.'

idx=0
while [[ $SECONDS -lt $END ]]; do
  agent="${AGENTS[$((idx % ${#AGENTS[@]}))]}"
  idx=$((idx + 1))
  remaining=$((END - SECONDS))
  log "run agent=${agent} remaining_sec=${remaining}"
  set +e
  LI_AGENT_VERIFY_MODE=0 \
  LI_REPO_WORKFLOW_SKIP_PUSH=0 \
  LI_AGENT_EXTRA_INSTRUCTION="$EXTRA" \
    node dist/cli/run-agent.js \
      --agent "$agent" \
      --benchmarks "${BENCHMARKS_ROOT}" \
      >>"$LOG" 2>&1
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    log "ok agent=${agent}"
  else
    log "warn agent=${agent} exit=${rc}"
  fi
  if [[ $SECONDS -ge $END ]]; then
    break
  fi
  log "pause ${PAUSE}s"
  sleep "$PAUSE"
done

log "complete runs=${idx}"

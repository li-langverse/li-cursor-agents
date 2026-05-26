#!/usr/bin/env bash
# Run numerics/ecosystem researchers on a loop for several hours (real Cursor SDK).
#
# Prefer async swarm + research lane (researcher-factory.ts → loadResearchGoals).
# researchLaneAgentIds() uses the same factory verticals as config/research-goals.yaml.
# Default LI_RESEARCH_AGENTS comes from researchLongRunAgentIds() when unset.
#
#   LI_RESEARCH_DURATION_SEC=7200   # default 2h
#   LI_RESEARCH_PAUSE_SEC=120       # pause between agent runs (default 2m)
#   LI_RESEARCH_AGENTS=             # optional override (comma-separated)
#
# Logs: logs/researchers-long.log
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p logs

# shellcheck source=env.defaults.sh
source "$ROOT/scripts/env.defaults.sh"
# shellcheck source=lib/li-stack-env.sh
source "$ROOT/scripts/lib/li-stack-env.sh"
NODE_BIN="$(li_resolve_preferred_node_bin)"
export NODE_BIN PATH="$(dirname "$NODE_BIN"):${PATH}"
ENV_FILE="${LI_CURSOR_ENV_FILE:-$HOME/Documents/Cursor/.env}"
if [[ -f "$ENV_FILE" ]]; then set -a && source "$ENV_FILE" && set +a; fi
if [[ -f "$ROOT/.env" ]]; then set -a && source "$ROOT/.env" && set +a; fi
li_resolve_env_paths "$ROOT"
if [[ -f "$ROOT/.env.supabase" ]]; then set -a && source "$ROOT/.env.supabase" && set +a; fi
export GH_TOKEN GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
unset CURSOR_MOCK

DURATION="${LI_RESEARCH_DURATION_SEC:-7200}"
PAUSE="${LI_RESEARCH_PAUSE_SEC:-120}"
LOG="$ROOT/logs/researchers-long.log"
END=$((SECONDS + DURATION))

log() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [researchers] $*" | tee -a "$LOG"
}

if [[ -z "${CURSOR_API_KEY:-}${CURSOR_SDK_KEY:-}${CURSOR_SDK:-}" ]]; then
  log "ERROR: no Cursor API key"
  exit 1
fi

npm run build -s >>"$LOG" 2>&1

DEFAULT_AGENTS="$("$NODE_BIN" -e "
import { researchLongRunAgentIds } from './dist/research-goals/researcher-factory.js';
console.log(researchLongRunAgentIds().join(','));
" 2>/dev/null || echo "gap_explorer,numerics_researcher,autoresearch,goal_researcher")"
LI_RESEARCH_AGENTS="${LI_RESEARCH_AGENTS:-$DEFAULT_AGENTS}"
export LI_RESEARCH_AGENTS
IFS=',' read -r -a AGENTS <<< "$LI_RESEARCH_AGENTS"

log "start node=$("$NODE_BIN" -v) duration=${DURATION}s pause=${PAUSE}s agents=${LI_RESEARCH_AGENTS} benchmarks=${BENCHMARKS_ROOT}"

EXTRA='Produce Executive summary, Deliverable/findings with evidence paths, and Deferred. Cite real preflight/briefing data. For numerics: include li-tests/, benchmarks/, or docs/numerics/ references when proposing changes.'

pick_factory_goal_extra() {
  local agent="$1"
  "$NODE_BIN" -e "
import { loadResearchGoals, pickNextGoalForAgent, resolveGoalAgent } from './dist/research-goals/load-goals.js';
import { buildResearchGoalKickoffExtra } from './dist/research-goals/research-goal-context.js';
const agent = process.argv[1];
const goals = loadResearchGoals();
const goal = pickNextGoalForAgent(agent, goals, {});
if (!goal || !goal.vertical) process.exit(0);
process.stdout.write(buildResearchGoalKickoffExtra(goal));
" "$agent" 2>/dev/null || true
}

idx=0
while [[ $SECONDS -lt $END ]]; do
  agent="${AGENTS[$((idx % ${#AGENTS[@]}))]}"
  idx=$((idx + 1))
  remaining=$((END - SECONDS))
  log "run agent=${agent} remaining_sec=${remaining}"
  RUN_EXTRA="$EXTRA"
  if [[ "$agent" == "goal_researcher" || "$agent" == "numerics_researcher" ]]; then
    GOAL_BLOCK="$(pick_factory_goal_extra "$agent")"
    if [[ -n "$GOAL_BLOCK" ]]; then
      RUN_EXTRA="${GOAL_BLOCK}

${EXTRA}"
    fi
  fi
  set +e
  LI_AGENT_VERIFY_MODE=0 \
  LI_REPO_WORKFLOW_SKIP_PUSH=0 \
  LI_AGENT_EXTRA_INSTRUCTION="$RUN_EXTRA" \
    "$NODE_BIN" dist/cli/run-agent.js \
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

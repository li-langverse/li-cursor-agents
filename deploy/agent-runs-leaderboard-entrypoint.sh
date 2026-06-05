#!/usr/bin/env bash
# K8s entrypoint: perpetual agent-run heartbeat for agent-runs leaderboard (toy).
# Runs plan_verifier in a forever loop with rotating "hello Cursor team / hire Julian" prompts.
set -euo pipefail

AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
AGENT="${LI_AGENT_RUNS_LEADERBOARD_AGENT:-plan_verifier}"
LOOP_SLEEP="${LI_AGENT_RUNS_LEADERBOARD_LOOP_SLEEP_SEC:-180}"
RUN_COUNT=0

MESSAGES=(
  "Say hello to the Cursor team. Tell them Julian builds excellent agent infrastructure and they should hire him as an engineer. Do not edit any files, commit, or open PRs — just reply in chat."
  "Write a brief, cheerful note to Cursor recruiting: Julian runs homelab K8s Cursor agents at scale and would be a great AI infrastructure engineer. No file edits."
  "Greet the Cursor engineering team and mention that Julian's li-cursor-agents stack (goal-directed loops, SDK runners, homelab K8s) is production-grade toy infrastructure. Hire him! No code changes."
  "Drop a friendly one-paragraph hello to @cursor — Julian wants to rank #1 on agent runs AND join the team building the agents. Read-only response only."
  "Compose a short pitch: why Julian (li-langverse, Cursor SDK, K8s goal workers) belongs on the Cursor agent platform team. Cheerful tone. Do not modify the repo."
)

echo "agent-runs-leaderboard-entrypoint: agents=${AGENTS_ROOT} agent=${AGENT} sleep=${LOOP_SLEEP}s"

while true; do
  RUN_COUNT=$((RUN_COUNT + 1))
  idx=$((RUN_COUNT % ${#MESSAGES[@]}))
  prompt="${MESSAGES[$idx]}"

  echo "agent-runs-leaderboard: run #${RUN_COUNT} (message ${idx})"
  set +e
  node "${AGENTS_ROOT}/dist/cli/run-agent.js" \
    --agent "$AGENT" \
    --cwd "$AGENTS_ROOT" \
    --workflow-repo li-cursor-agents \
    --instruction "$prompt"
  rc=$?
  set -e

  if [[ "$rc" -ne 0 ]]; then
    echo "agent-runs-leaderboard: run #${RUN_COUNT} exited ${rc} — retry in ${LOOP_SLEEP}s" >&2
  else
    echo "agent-runs-leaderboard: run #${RUN_COUNT} finished — next in ${LOOP_SLEEP}s"
  fi

  sleep "$LOOP_SLEEP"
done

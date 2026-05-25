#!/usr/bin/env bash
# Reusable goal-directed loop: run any registry agent with a goal until success or --max.
#
# The goal is plain text (file or env) — not a separate agent id. Use code_implementer,
# bug_fixer, etc. with LI_REPO_WORKFLOW_REPO for the target repo.
#
# Usage:
#   export CURSOR_API_KEY=crsr_...
#   ./scripts/goal-directed-loop.sh --goal-file ./my-goal.md --workflow-repo lic --cwd ../lic
#   ./scripts/goal-directed-loop.sh --goal "Fix m1-bearer-auth …" --once
#   LI_GOAL_AGENT=bug_fixer ./scripts/goal-directed-loop.sh --goal-file goal.md --max 5
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENT="${LI_GOAL_AGENT:-code_implementer}"
GOAL_FILE=""
GOAL_INLINE=""
CWD="${LI_GOAL_CWD:-$ROOT}"
WORKFLOW_REPO="${LI_REPO_WORKFLOW_REPO:-}"
BENCHMARKS="${BENCHMARKS_ROOT:-}"
ONCE=0
MAX=0
DRY_RUN=0
SLEEP_SEC="${LI_GOAL_LOOP_SLEEP_SEC:-90}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent|-a) AGENT="$2"; shift 2 ;;
    --goal-file) GOAL_FILE="$2"; shift 2 ;;
    --goal|--instruction) GOAL_INLINE="$2"; shift 2 ;;
    --cwd) CWD="$2"; shift 2 ;;
    --workflow-repo) WORKFLOW_REPO="$2"; shift 2 ;;
    --benchmarks) BENCHMARKS="$2"; shift 2 ;;
    --once) ONCE=1; shift ;;
    --max) MAX="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --sleep) SLEEP_SEC="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$GOAL_FILE" && -z "$GOAL_INLINE" && -z "${LI_AGENT_GOAL:-}" && -z "${LI_AGENT_EXTRA_INSTRUCTION:-}" ]]; then
  echo "goal-directed-loop: pass --goal, --goal-file, or LI_AGENT_GOAL" >&2
  exit 1
fi

if [[ ! -f "$ROOT/dist/cli/run-agent.js" ]]; then
  npm ci --prefix "$ROOT" >/dev/null 2>&1 || true
  npm run build --prefix "$ROOT"
fi

# Auto workflow repo + cwd from goal frontmatter / path signals (skill: explore-li-ecosystem)
if [[ -z "$WORKFLOW_REPO" ]]; then
  GOAL_FILE="$GOAL_FILE" GOAL_INLINE="$GOAL_INLINE" WORKFLOW_REPO="$(
    cd "$ROOT" && node --input-type=module -e "
import { resolveWorkflowRepoFromGoalFile, resolveWorkflowRepoFromText } from './dist/agents/resolve-workflow-repo.js';
const f = process.env.GOAL_FILE?.trim();
const inline = process.env.GOAL_INLINE?.trim();
const r = f ? resolveWorkflowRepoFromGoalFile(f) : inline ? resolveWorkflowRepoFromText(inline) : undefined;
if (r) process.stdout.write(r);
" 2>/dev/null || true
  )"
fi
if [[ -n "$WORKFLOW_REPO" && "$CWD" == "$ROOT" ]]; then
  SIBLING="$ROOT/../$WORKFLOW_REPO"
  if [[ -d "$SIBLING" ]]; then
    CWD="$SIBLING"
  fi
fi

GOAL_ARGS=()
if [[ -n "$GOAL_FILE" ]]; then
  GOAL_ARGS=(--goal-file "$GOAL_FILE")
elif [[ -n "$GOAL_INLINE" ]]; then
  GOAL_ARGS=(--goal "$GOAL_INLINE")
fi

RUN_ARGS=(node "$ROOT/dist/cli/run-agent.js" --agent "$AGENT" --cwd "$CWD" "${GOAL_ARGS[@]}")
[[ -n "$WORKFLOW_REPO" ]] && RUN_ARGS+=(--workflow-repo "$WORKFLOW_REPO")
[[ -n "$BENCHMARKS" ]] && RUN_ARGS+=(--benchmarks "$BENCHMARKS")
[[ "$DRY_RUN" == "1" ]] && RUN_ARGS+=(--dry-run)

iter=0
while :; do
  iter=$((iter + 1))
  echo "==> goal-directed-loop iteration $iter agent=$AGENT repo=${WORKFLOW_REPO:-—} (live output below)"
  # Do not wrap in `tail` — output streams until the agent exits.
  if "${RUN_ARGS[@]}"; then
    echo "goal-directed-loop: agent finished (exit 0)"
    exit 0
  fi
  code=$?
  echo "goal-directed-loop: agent exit $code" >&2
  if [[ "$ONCE" == "1" ]]; then
    exit "$code"
  fi
  if [[ "$MAX" -gt 0 && "$iter" -ge "$MAX" ]]; then
    echo "goal-directed-loop: max $MAX iterations" >&2
    exit "$code"
  fi
  echo "goal-directed-loop: sleep ${SLEEP_SEC}s then retry (fix blockers or refine goal)"
  sleep "$SLEEP_SEC"
done

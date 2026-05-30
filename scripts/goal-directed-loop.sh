#!/usr/bin/env bash
# Reusable goal-directed loop: run a registry agent against a plan until the
# ## Completion gate passes (bash block + phase status table in the goal file).
#
# Usage:
#   ./scripts/goal-directed-loop.sh --goal-file goal.md --max 12
#   ./scripts/goal-directed-loop.sh --goal-file goal.md --until-local 08:00
#   ./scripts/goal-directed-loop.sh --goal-file goal.md --once
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
UNTIL_LOCAL="${LI_GOAL_LOOP_UNTIL_LOCAL:-}"
GOAL_LOOP_TZ="${LI_GOAL_LOOP_TZ:-Europe/Berlin}"
DEADLINE_TS=""
SLEEP_SEC="${LI_GOAL_LOOP_SLEEP_SEC:-90}"
LAST_GAPS_FILE="${LI_GOAL_LOOP_GAPS_FILE:-$ROOT/data/goal-directed-loop-last-gaps.txt}"

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
    --until-local) UNTIL_LOCAL="$2"; shift 2 ;;
    --sleep) SLEEP_SEC="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$GOAL_FILE" && -z "$GOAL_INLINE" && -z "${LI_AGENT_GOAL:-}" && -z "${LI_AGENT_EXTRA_INSTRUCTION:-}" ]]; then
  echo "goal-directed-loop: pass --goal, --goal-file, or LI_AGENT_GOAL" >&2
  exit 1
fi

if [[ ! -f "$ROOT/dist/cli/run-agent.js" || ! -f "$ROOT/dist/cli/goal-completion-gate.js" ]]; then
  npm ci --prefix "$ROOT" >/dev/null 2>&1 || true
  npm run build --prefix "$ROOT"
fi

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

resolve_goal_file_for_gate() {
  if [[ -z "$GOAL_FILE" ]]; then
    echo ""
    return
  fi
  if [[ "$GOAL_FILE" = /* ]]; then
    echo "$GOAL_FILE"
    return
  fi
  local from_root="$ROOT/$GOAL_FILE"
  if [[ -f "$from_root" ]]; then
    echo "$from_root"
    return
  fi
  local dir base
  dir="$(dirname "$GOAL_FILE")"
  base="$(basename "$GOAL_FILE")"
  if [[ -f "$CWD/$GOAL_FILE" ]]; then
    echo "$(cd "$CWD" && cd "$dir" 2>/dev/null && pwd)/$base"
    return
  fi
  echo "$from_root"
}

GATE_GOAL_FILE="$(resolve_goal_file_for_gate)"

check_goal_completion_gate() {
  if [[ -z "$GATE_GOAL_FILE" || ! -f "$GATE_GOAL_FILE" ]]; then
    return 1
  fi
  node "$ROOT/dist/cli/goal-completion-gate.js" --goal-file "$GATE_GOAL_FILE" --cwd "$CWD"
}

record_gaps_from_run() {
  mkdir -p "$(dirname "$LAST_GAPS_FILE")"
  ROOT="$ROOT" node --input-type=module -e "
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const dir = join(process.env.ROOT, 'data/runs');
let best = '';
let mt = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const p = join(dir, f);
  const m = statSync(p).mtimeMs;
  if (m > mt) { mt = m; best = p; }
}
if (!best) process.exit(0);
const raw = JSON.parse(readFileSync(best, 'utf8'));
const gaps = raw.completion?.gaps ?? [];
process.stdout.write(gaps.join('\\n'));
" 2>/dev/null >"$LAST_GAPS_FILE" || true
}

deadline_epoch() {
  local hm="$1"
  local h="${hm%%:*}"
  local m="${hm#*:}"
  m="${m%%:*}"
  local now today tomorrow
  now="$(date +%s)"
  today="$(TZ="$GOAL_LOOP_TZ" date -d "today ${h}:${m}:00" +%s 2>/dev/null || date -d "today ${h}:${m}:00" +%s)"
  if [[ "$today" -gt "$now" ]]; then
    echo "$today"
    return
  fi
  tomorrow="$(TZ="$GOAL_LOOP_TZ" date -d "tomorrow ${h}:${m}:00" +%s 2>/dev/null || date -d "tomorrow ${h}:${m}:00" +%s)"
  echo "$tomorrow"
}

goal_loop_past_deadline() {
  [[ -z "$DEADLINE_TS" ]] && return 1
  local now
  now="$(date +%s)"
  [[ "$now" -ge "$DEADLINE_TS" ]] && return 0
  local remaining=$((DEADLINE_TS - now))
  [[ "$remaining" -lt 300 ]] && return 0
  return 1
}

if [[ -n "$UNTIL_LOCAL" ]]; then
  export TZ="$GOAL_LOOP_TZ"
  DEADLINE_TS="$(deadline_epoch "$UNTIL_LOCAL")"
  echo "goal-directed-loop: run until local ${UNTIL_LOCAL} (${GOAL_LOOP_TZ}) -> $(TZ="$GOAL_LOOP_TZ" date -d "@${DEADLINE_TS}" -Iseconds 2>/dev/null || date -d "@${DEADLINE_TS}")"
fi

if [[ "$ONCE" != "1" && "$MAX" -le 0 ]]; then
  MAX=999
fi

iter=0
while :; do
  if check_goal_completion_gate; then
    echo "goal-directed-loop: completion gate passed (exit 0)"
    exit 0
  fi

  if goal_loop_past_deadline; then
    echo "goal-directed-loop: local deadline ${UNTIL_LOCAL} reached ($(date -Iseconds)) — exit 1" >&2
    exit 1
  fi

  iter=$((iter + 1))
  echo "==> goal-directed-loop iteration $iter agent=$AGENT repo=${WORKFLOW_REPO:-—} (live output below)"

  if [[ "$iter" -gt 1 ]]; then
    gaps_tail=""
    [[ -f "$LAST_GAPS_FILE" ]] && gaps_tail="$(head -c 2000 "$LAST_GAPS_FILE" 2>/dev/null || true)"
    export LI_AGENT_EXTRA_INSTRUCTION="$(cat <<EOF
## Goal-directed loop iteration $iter

Continue the full plan in the goal file (all phases through the Completion gate).
Update the phase status table; mark | **DONE** | only when a phase is truly complete.
Do not open duplicate PRs for the same branch.

Prior completion gaps:
${gaps_tail:-_(none recorded)_}
EOF
)"
  else
    unset LI_AGENT_EXTRA_INSTRUCTION || true
  fi

  export LI_GOAL_LOOP_STRICT_EXIT=1

  set +e
  ROOT="$ROOT" "${RUN_ARGS[@]}"
  code=$?
  set -e
  record_gaps_from_run

  if check_goal_completion_gate; then
    echo "goal-directed-loop: completion gate passed (exit 0)"
    exit 0
  fi

  if [[ "$code" -ne 0 ]]; then
    echo "goal-directed-loop: agent exit $code; gate still failing" >&2
  else
    echo "goal-directed-loop: agent exit 0 but completion gate not satisfied — retry after sleep" >&2
  fi

  if [[ "$ONCE" == "1" ]]; then
    exit 1
  fi
  if [[ "$MAX" -gt 0 && "$iter" -ge "$MAX" ]]; then
    echo "goal-directed-loop: max $MAX iterations; gate not satisfied (exit 1)" >&2
    exit 1
  fi

  echo "goal-directed-loop: sleep ${SLEEP_SEC}s then retry"
  sleep "$SLEEP_SEC"
done
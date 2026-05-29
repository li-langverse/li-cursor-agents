#!/usr/bin/env bash
# Reusable goal-directed loop: run any registry agent with a goal until success or --max.
#
# Usage:
#   LI_GOAL_LOOP_UNTIL_COMPLETE=1 ./scripts/goal-directed-loop.sh --goal-file goal.md --max 12
#   ./scripts/goal-directed-loop.sh --goal-file goal.md --until-complete --while-pr-open --max 12
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
UNTIL_COMPLETE="${LI_GOAL_LOOP_UNTIL_COMPLETE:-0}"
WHILE_PR_OPEN="${LI_GOAL_LOOP_WHILE_PR_OPEN:-0}"
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
    --until-complete) UNTIL_COMPLETE=1; shift ;;
    --while-pr-open) WHILE_PR_OPEN=1; shift ;;
    --until-local) UNTIL_LOCAL="$2"; shift 2 ;;
    --sleep) SLEEP_SEC="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

# Multi-iteration runs: keep going until deliverable complete (not stop on SDK exit 0 + premature).
if [[ "$MAX" -gt 1 && "$ONCE" != "1" && "$UNTIL_COMPLETE" != "1" && -z "${LI_GOAL_LOOP_UNTIL_COMPLETE+set}" ]]; then
  UNTIL_COMPLETE=1
fi

if [[ -z "$GOAL_FILE" && -z "$GOAL_INLINE" && -z "${LI_AGENT_GOAL:-}" && -z "${LI_AGENT_EXTRA_INSTRUCTION:-}" ]]; then
  echo "goal-directed-loop: pass --goal, --goal-file, or LI_AGENT_GOAL" >&2
  exit 1
fi

if [[ ! -f "$ROOT/dist/cli/run-agent.js" ]]; then
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

record_gaps_from_run() {
  mkdir -p "$(dirname "$LAST_GAPS_FILE")"
  node --input-type=module -e "
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
process.stdout.write(gaps.join('\n'));
" 2>/dev/null >"$LAST_GAPS_FILE" || true
}

gh_open_pr_count() {
  local repo_slug="$1"
  if ! command -v gh >/dev/null 2>&1; then
    echo 0
    return
  fi
  gh pr list --repo "li-langverse/$repo_slug" --state open --limit 50 --json number 2>/dev/null \
    | node -e "let n=0; try{const j=JSON.parse(require('fs').readFileSync(0,'utf8')); n=Array.isArray(j)?j.length:0;}catch{} process.stdout.write(String(n));" \
    || echo 0
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
  if [[ "$now" -ge "$DEADLINE_TS" ]]; then
    return 0
  fi
  local remaining=$((DEADLINE_TS - now))
  if [[ "$remaining" -lt 300 ]]; then
    return 0
  fi
  return 1
}

audit_p0_remaining() {
  local audit="$CWD/scripts/audit-dashboard-gaps.py"
  [[ -f "$audit" ]] || return 1
  if (cd "$CWD" && python3 "$audit" >/dev/null 2>&1); then
    return 1
  fi
  return 0
}

if [[ -n "$UNTIL_LOCAL" ]]; then
  export TZ="$GOAL_LOOP_TZ"
  DEADLINE_TS="$(deadline_epoch "$UNTIL_LOCAL")"
  echo "goal-directed-loop: run until local ${UNTIL_LOCAL} (${GOAL_LOOP_TZ}) -> $(TZ="$GOAL_LOOP_TZ" date -d "@${DEADLINE_TS}" -Iseconds 2>/dev/null || date -d "@${DEADLINE_TS}")"
  if [[ "$MAX" -gt 0 && "$MAX" -lt 50 ]]; then
  echo "goal-directed-loop: --until-local active; iteration cap raised (was max=$MAX)"
  fi
  MAX=999
fi

iter=0
while :; do
  if goal_loop_past_deadline; then
    echo "goal-directed-loop: local deadline ${UNTIL_LOCAL} reached ($(date -Iseconds)) — stop"
    exit 0
  fi

  iter=$((iter + 1))
  echo "==> goal-directed-loop iteration $iter agent=$AGENT repo=${WORKFLOW_REPO:-â€”} (live output below)"

  if [[ "$iter" -gt 1 ]]; then
    gaps_tail=""
    [[ -f "$LAST_GAPS_FILE" ]] && gaps_tail="$(head -c 2000 "$LAST_GAPS_FILE" 2>/dev/null || true)"
    export LI_AGENT_EXTRA_INSTRUCTION="$(cat <<EOF
## Goal-directed loop iteration $iter

Continue the same sprint goal. Babysit open PR(s): fix CI, resolve review threads, push scoped fixes.
Update existing PRs â€” do not open duplicates for the same branch.

Prior completion gaps:
${gaps_tail:-_(none recorded)_}
EOF
)"
  fi

  export LI_GOAL_LOOP_STRICT_EXIT=0
  if [[ "$UNTIL_COMPLETE" == "1" && "$ONCE" != "1" ]]; then
    export LI_GOAL_LOOP_STRICT_EXIT=1
  fi

  set +e
  ROOT="$ROOT" "${RUN_ARGS[@]}"
  code=$?
  set -e
  record_gaps_from_run

  if [[ "$code" -eq 0 ]]; then
    if [[ "$WHILE_PR_OPEN" == "1" && -n "$WORKFLOW_REPO" ]]; then
      open_n="$(gh_open_pr_count "$WORKFLOW_REPO")"
      if [[ "$open_n" -gt 0 ]]; then
        echo "goal-directed-loop: $open_n open PR(s) on li-langverse/$WORKFLOW_REPO â€” continuing (babysit)"
        code=2
      fi
    fi
    if [[ "$code" -eq 0 && "$WORKFLOW_REPO" == "benchmarks" && -f "$CWD/scripts/audit-dashboard-gaps.py" ]]; then
      if audit_p0_remaining; then
        echo "goal-directed-loop: audit-dashboard-gaps P0 still failing â€” continuing"
        code=2
      fi
    fi
  fi

  if [[ "$code" -eq 0 ]]; then
    echo "goal-directed-loop: deliverable complete (exit 0)"
    exit 0
  fi

  if [[ "$code" -eq 2 ]]; then
    echo "goal-directed-loop: incomplete deliverable (exit 2) â€” retry after sleep" >&2
  else
    echo "goal-directed-loop: agent exit $code" >&2
  fi

  if [[ "$ONCE" == "1" ]]; then
    exit "$code"
  fi
  if [[ "$MAX" -gt 0 && "$iter" -ge "$MAX" ]]; then
    echo "goal-directed-loop: max $MAX iterations (last exit $code)" >&2
    exit "$code"
  fi

  echo "goal-directed-loop: sleep ${SLEEP_SEC}s then retry"
  sleep "$SLEEP_SEC"
done
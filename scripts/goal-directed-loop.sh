#!/usr/bin/env bash
# goal-directed-loop.sh â€” run an agent against a plan until the Completion gate passes.
#
# Success (exit 0):  completion gate passes â€” and only then.
# Failure (exit 1):  --until-local deadline or --max iterations reached without completion.
# Agent exit 0 alone never ends the loop successfully.
#
# Usage:
#   ./scripts/goal-directed-loop.sh --goal-file plan.md --workflow-repo lic --cwd ../lic
#   ./scripts/goal-directed-loop.sh --goal-file plan.md --max 12
#   ./scripts/goal-directed-loop.sh --goal-file plan.md --until-local 18:00
#   ./scripts/goal-directed-loop.sh --goal-file plan.md --once
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
MAX="${LI_GOAL_LOOP_MAX:-0}"
DRY_RUN=0
UNTIL_LOCAL="${LI_GOAL_LOOP_UNTIL_LOCAL:-}"
GOAL_LOOP_TZ="${LI_GOAL_LOOP_TZ:-Europe/Berlin}"
SLEEP_SEC="${LI_GOAL_LOOP_SLEEP_SEC:-90}"
LAST_GAPS_FILE="${LI_GOAL_LOOP_GAPS_FILE:-$ROOT/data/goal-directed-loop-last-gaps.txt}"
LOOP_SCRIPT="$ROOT/scripts/goal-directed-loop.sh"
LOOP_SCRIPT_MTIME="$(stat -c %Y "$LOOP_SCRIPT" 2>/dev/null || stat -f %m "$LOOP_SCRIPT" 2>/dev/null || echo 0)"

warn_if_loop_script_changed() {
  local now
  now="$(stat -c %Y "$LOOP_SCRIPT" 2>/dev/null || stat -f %m "$LOOP_SCRIPT" 2>/dev/null || echo 0)"
  if [[ "$now" != "$LOOP_SCRIPT_MTIME" && "$now" != "0" ]]; then
    echo "goal-directed-loop: WARNING script changed on disk â€” restart this process to pick up loop.sh edits" >&2
  fi
}

DEADLINE_TS=""

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
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *) echo "goal-directed-loop: unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$GOAL_FILE" && -z "$GOAL_INLINE" && -z "${LI_AGENT_GOAL:-}" && -z "${LI_AGENT_EXTRA_INSTRUCTION:-}" ]]; then
  echo "goal-directed-loop: pass --goal-file, --goal, or LI_AGENT_GOAL" >&2
  exit 1
fi

dist_needs_rebuild() {
  local dist_gate="$ROOT/dist/cli/goal-completion-gate.js"
  local dist_agent="$ROOT/dist/cli/run-agent.js"
  [[ ! -f "$dist_gate" || ! -f "$dist_agent" ]] && return 0
  local newest_src=0 st dist_mtime
  while IFS= read -r -d '' f; do
    st=$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null || echo 0)
    [[ "$st" -gt "$newest_src" ]] && newest_src=$st
  done < <(find "$ROOT/src" -name '*.ts' -print0 2>/dev/null)
  dist_mtime=$(stat -c %Y "$dist_gate" 2>/dev/null || stat -f %m "$dist_gate" 2>/dev/null || echo 0)
  [[ "$newest_src" -gt "$dist_mtime" ]]
}

run_tsc_build() {
  local tsc_js="$ROOT/node_modules/typescript/lib/tsc.js"
  if [[ ! -f "$tsc_js" ]]; then
    echo "goal-directed-loop: installing typescript (ignore-scripts) for dist rebuild" >&2
    npm install --prefix "$ROOT" typescript --ignore-scripts --no-fund --no-audit >/dev/null 2>&1 || true
  fi
  if [[ -f "$tsc_js" ]]; then
    (cd "$ROOT" && node "$tsc_js" -p tsconfig.json)
    return $?
  fi
  export PATH="$ROOT/node_modules/.bin:$PATH"
  npm run build --prefix "$ROOT"
}

ensure_dist_built() {
  if dist_needs_rebuild; then
    echo "goal-directed-loop: rebuilding dist (gate/agent TypeScript newer than dist)"
    if ! run_tsc_build; then
      if [[ -f "$ROOT/dist/cli/goal-completion-gate.js" ]]; then
        echo "goal-directed-loop: WARN rebuild failed; using existing dist" >&2
      else
        echo "goal-directed-loop: FATAL build failed and dist/cli missing" >&2
        exit 1
      fi
    fi
  fi
}

ensure_dist_built

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
  [[ -d "$SIBLING" ]] && CWD="$SIBLING"
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
  [[ -z "$GOAL_FILE" ]] && { echo ""; return; }
  if [[ "$GOAL_FILE" = /* && -f "$GOAL_FILE" ]]; then echo "$GOAL_FILE"; return; fi
  for candidate in "$ROOT/$GOAL_FILE" "$CWD/$GOAL_FILE"; do
    [[ -f "$candidate" ]] && { echo "$(cd "$(dirname "$candidate")" && pwd)/$(basename "$candidate")"; return; }
  done
  echo "$ROOT/$GOAL_FILE"
}

GATE_GOAL_FILE="$(resolve_goal_file_for_gate)"

# Completion/progress gates must run in the agent's isolated clone when present;
# --cwd ../studio (sibling checkout) stays stale while the agent marks todos in data/workspaces/.
# Set LI_GOAL_GATE_PREFER_CWD=1 to force sibling --cwd (e.g. after manual branch sync).
resolve_gate_cwd() {
  if [[ "${LI_GOAL_GATE_PREFER_CWD:-0}" == "1" ]]; then
    echo "$(cd "$CWD" && pwd)"
    return 0
  fi
  if [[ -n "$WORKFLOW_REPO" && -n "$AGENT" ]]; then
    local ws_root="$ROOT/data/workspaces/li-langverse/${WORKFLOW_REPO}"
    if [[ -d "$ws_root" ]]; then
      local latest
      latest="$(ls -td "$ws_root"/${AGENT}-*/repo 2>/dev/null | head -1 || true)"
      if [[ -n "$latest" && -d "$latest" ]]; then
        echo "$(cd "$latest" && pwd)"
        return 0
      fi
    fi
  fi
  echo "$(cd "$CWD" && pwd)"
}

gate_status() {
  ensure_dist_built
  local goal_path gate_cwd
  goal_path="$(resolve_goal_file_for_gate)"
  if [[ -z "$goal_path" || ! -f "$goal_path" ]]; then
    echo "goal-directed-loop: no goal file for completion gate" >&2
    return 1
  fi
  GATE_GOAL_FILE="$goal_path"
  gate_cwd="$(resolve_gate_cwd)"
  echo "goal-directed-loop: gate cwd=$gate_cwd" >&2
  node "$ROOT/dist/cli/goal-completion-gate.js" --goal-file "$GATE_GOAL_FILE" --cwd "$gate_cwd"
}

record_gaps_from_run() {
  mkdir -p "$(dirname "$LAST_GAPS_FILE")"
  ROOT="$ROOT" node --input-type=module -e "
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const dir = join(process.env.ROOT, 'data/runs');
let best = '', mt = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const p = join(dir, f), m = statSync(p).mtimeMs;
  if (m > mt) { mt = m; best = p; }
}
if (!best) process.exit(0);
const gaps = JSON.parse(readFileSync(best, 'utf8')).completion?.gaps ?? [];
process.stdout.write(gaps.join('\\n'));
" 2>/dev/null >"$LAST_GAPS_FILE" || true
}

deadline_epoch() {
  local hm h m now today tomorrow
  hm="$1"
  h="${hm%%:*}"
  m="${hm#*:}"
  m="${m%%:*}" 
  now="$(date +%s)"
  today="$(TZ="$GOAL_LOOP_TZ" date -d "today ${h}:${m}:00" +%s 2>/dev/null || date -d "today ${h}:${m}:00" +%s)"
  [[ "$today" -gt "$now" ]] && { echo "$today"; return; }
  tomorrow="$(TZ="$GOAL_LOOP_TZ" date -d "tomorrow ${h}:${m}:00" +%s 2>/dev/null || date -d "tomorrow ${h}:${m}:00" +%s)"
  echo "$tomorrow"
}

past_deadline() {
  [[ -z "$DEADLINE_TS" ]] && return 1
  local now remain
  now="$(date +%s)"
  [[ "$now" -ge "$DEADLINE_TS" ]] && return 0
  remain=$((DEADLINE_TS - now))
  [[ "$remain" -lt 300 ]]
}

stop_success() {
  echo "goal-directed-loop: GOAL COMPLETE (exit 0)"
  if [[ "${LI_GOAL_LOOP_IDLE_ON_COMPLETE:-0}" == "1" ]]; then
    echo "goal-directed-loop: idling (LI_GOAL_LOOP_IDLE_ON_COMPLETE=1)"
    exec sleep infinity
  fi
  exit 0
}

stop_bounded() {
  local reason="$1"
  echo "goal-directed-loop: STOP without completion â€” $reason (exit 1)" >&2
  exit 1
}

if [[ -n "$UNTIL_LOCAL" ]]; then
  export TZ="$GOAL_LOOP_TZ"
  DEADLINE_TS="$(deadline_epoch "$UNTIL_LOCAL")"
fi

max_label="${MAX}"
[[ "$MAX" -le 0 ]] && max_label="unlimited"
export LI_GOAL_LOOP_GATE_ONLY=1
echo "goal-directed-loop: agent=$AGENT repo=${WORKFLOW_REPO:-â€”}"
echo "goal-directed-loop: success = completion gate only | max=$max_label | until-local=${UNTIL_LOCAL:-none} (${GOAL_LOOP_TZ})"
[[ -n "$GATE_GOAL_FILE" ]] && echo "goal-directed-loop: goal=$GATE_GOAL_FILE"

iter=0
while :; do
  if gate_status; then stop_success; fi
  if past_deadline; then stop_bounded "deadline ${UNTIL_LOCAL} reached"; fi

  warn_if_loop_script_changed
  iter=$((iter + 1))
  echo "==> iteration $iter"

  if [[ "$iter" -gt 1 ]]; then
    gaps_tail=""
    [[ -f "$LAST_GAPS_FILE" ]] && gaps_tail="$(head -c 2000 "$LAST_GAPS_FILE" 2>/dev/null || true)"
    gate_note="$(gate_status 2>&1 | tail -4 || true)"
    export LI_AGENT_EXTRA_INSTRUCTION="$(cat <<EOF
## Goal-directed loop â€” iteration $iter

Implement the full plan until the ## Completion gate passes.
Mark phases | **DONE** | in the status table only when truly finished.
Update existing PRs; do not open duplicates.

Gate status:
${gate_note:-_(gate check failed)_}

Prior agent gaps:
${gaps_tail:-_(none)_}
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

  if gate_status; then stop_success; fi

  if [[ "$code" -ne 0 && "$code" -ne 2 ]]; then
    echo "goal-directed-loop: agent error exit $code (continuing)" >&2
  else
    echo "goal-directed-loop: plan incomplete â€” continuing" >&2
  fi

  if [[ "$ONCE" == "1" ]]; then stop_bounded "--once without completion gate"; fi
  if [[ "$MAX" -gt 0 && "$iter" -ge "$MAX" ]]; then stop_bounded "max $MAX iterations"; fi

  echo "goal-directed-loop: sleep ${SLEEP_SEC}s"
  sleep "$SLEEP_SEC"
done

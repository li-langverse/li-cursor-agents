#!/usr/bin/env bash
# Helpers for goal-directed-loop: plan todos, stuck detection, sync cwd after agent push.
set -euo pipefail

goal_loop_resolve_plan_file() {
  local goal_file="$1"
  local cwd="$2"
  if [[ -n "${LI_GOAL_PLAN_FILE:-}" && -f "${LI_GOAL_PLAN_FILE}" ]]; then
    echo "${LI_GOAL_PLAN_FILE}"
    return 0
  fi
  if [[ ! -f "$goal_file" ]]; then
    return 1
  fi
  python3 - "$goal_file" "$cwd" <<'PY'
import re, sys
from pathlib import Path
goal = Path(sys.argv[1])
cwd = Path(sys.argv[2])
text = goal.read_text(encoding="utf-8")
m = re.search(r"Plan loop:\*\*\s*\[[^\]]*\]\(([^)]+)\)", text, re.I)
if not m:
    sys.exit(1)
rel = m.group(1).strip().lstrip("./")
if rel.startswith("../"):
    rel = rel[3:]
for base in (cwd, goal.parent):
    p = (base / rel).resolve()
    if p.is_file():
        print(p)
        sys.exit(0)
sys.exit(1)
PY
}

goal_loop_plan_todos() {
  local plan_file="$1"
  python3 - "$plan_file" <<'PY'
import re, sys
from pathlib import Path
text = Path(sys.argv[1]).read_text(encoding="utf-8")
pending, done = [], []
for m in re.finditer(
    r"- id: (\S+)\n\s+content: [^\n]+\n\s+status: (\w+)", text
):
    (done if m.group(2) == "done" else pending).append(m.group(1))
print("pending=" + ",".join(pending))
print("done=" + ",".join(done))
print("next=" + (pending[0] if pending else ""))
PY
}

goal_loop_stuck_state_file() {
  local root="$1"
  local goal_file="$2"
  local hash
  hash="$(printf '%s' "$goal_file" | sha256sum 2>/dev/null | cut -c1-16 || echo "default")"
  echo "$root/data/goal-loop-stuck-${hash}.json"
}

goal_loop_stuck_check() {
  local state_file="$1"
  local pending_key="$2"
  local iter="$3"
  local threshold="${LI_GOAL_STUCK_THRESHOLD:-5}"
  python3 - "$state_file" "$pending_key" "$iter" "$threshold" <<'PY'
import json, sys
from pathlib import Path
state_path, pending_key, iter_s, thresh_s = sys.argv[1:5]
iter_n, thresh = int(iter_s), int(thresh_s)
state = {"pending_key": "", "count": 0, "first_iter": 0}
p = Path(state_path)
if p.is_file():
    try:
        state = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        pass
if state.get("pending_key") == pending_key:
    state["count"] = int(state.get("count", 0)) + 1
else:
    state = {"pending_key": pending_key, "count": 1, "first_iter": iter_n}
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
stuck = state["count"] >= thresh
print("stuck=1" if stuck else "stuck=0")
print(f"stuck_count={state['count']}")
print(f"stuck_since_iter={state.get('first_iter', iter_n)}")
PY
}

goal_loop_sync_cwd_from_origin() {
  local cwd="$1"
  local branch="$2"
  [[ -d "$cwd/.git" ]] || return 0
  [[ -n "$branch" ]] || return 0
  git -C "$cwd" fetch origin --prune 2>/dev/null || true
  if git -C "$cwd" show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
    git -C "$cwd" checkout -B "$branch" "origin/${branch}" 2>/dev/null || true
    git -C "$cwd" reset --hard "origin/${branch}" 2>/dev/null || true
    echo "goal-loop-self-unblock: synced $cwd to origin/${branch}"
  fi
}

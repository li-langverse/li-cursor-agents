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
rel = None
m = re.search(r"Plan loop:\*\*\s*\[[^\]]*\]\(([^)]+)\)", text, re.I)
if m:
    rel = m.group(1).strip().lstrip("./")
else:
    fm = re.match(r"^---\r?\n([\s\S]*?)\r?\n---", text)
    if fm:
        pm = re.search(r"^plan:\s*(\S+)\s*$", fm.group(1), re.M)
        if pm:
            rel = pm.group(1).strip().lstrip("./")
if not rel:
    sys.exit(1)
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

# Context-aware hints when gates fail or the loop is stuck (benchmark nightly, lic link, etc.).
goal_loop_unblock_hints_from_context() {
  local gate_note="${1:-}"
  local gaps="${2:-}"
  local ctx="${gate_note}${gaps}"
  local hints=""

  if echo "$ctx" | grep -qiE 'sample-run imbalance|measurement-quality|MEASUREMENT_STRICT_PARITY|sample_runs'; then
    hints+="$(cat <<'HINT'

## Unblock: sample-run parity
- Do **not** relax `check-summary-measurement-quality.py` or `MEASUREMENT_STRICT_PARITY`.
- Confirm `BENCH_EQUALIZE_RUNS=1`; fix `time_commands_with_equal_runs` and tier1 parallel CSV races.
- Run: `python3 -m unittest harness.test_timing_equalize -v`
- Inspect merged CSV: every lang must share the same `sample_runs` per benchmark row.
HINT
)"
  fi

  if echo "$ctx" | grep -qiE 'linker command failed|clang.*link failed|undefined reference|ld: '; then
    hints+="$(cat <<'HINT'

## Unblock: lic linker
- Reproduce: build tier3 `async_await_chain` and a tier7 registry `.li` target with `lic build`.
- Fix `lic` on `main` (MIR/linker regression); PR to `lic` — avoid pinning `LIC_BENCH_REF` unless documented temporary.
- Rebuild: `(cd lic && ./scripts/build.sh)` then re-run progress gate.
HINT
)"
  fi

  if echo "$ctx" | grep -qiE 'tier7|bench-linux-merge|require_tier_csv|tier3'; then
    hints+="$(cat <<'HINT'

## Unblock: tier shard / merge
- Ensure each tier7 shard emits non-empty CSV (`run-registry-tier-benches.py`, `REGISTRY_SHARD_COUNT=3`).
- Fix linker/build failures before re-dispatching nightly; merge needs all 11 Linux tier artifacts.
HINT
)"
  fi

  if echo "$ctx" | grep -qiE 'publish-dashboard|zero-missing|dashboard-invariant|check-summary'; then
    hints+="$(cat <<'HINT'

## Unblock: publish-dashboard chain
- Gates run in order: measurement-quality → dashboard-invariants → zero-missing-data → commit summary.
- Fix upstream CSV/parity first; re-run `./scripts/benchmark-nightly-green-progress-gate.sh`.
HINT
)"
  fi

  if echo "$ctx" | grep -qiE 'benchmark-nightly-green-progress|benchmark-nightly-green-gate'; then
    hints+="$(cat <<'HINT'

## Unblock: benchmark nightly gates
- Run progress gate locally: `./scripts/benchmark-nightly-green-progress-gate.sh`
- Completion (CI): `BENCHMARK_NIGHTLY_GATE_DISPATCH=1 ./scripts/benchmark-nightly-green-gate.sh`
- Pick the first pending BN todo in the plan; implement code, not metadata-only commits.
HINT
)"
  fi

  echo "$hints"
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

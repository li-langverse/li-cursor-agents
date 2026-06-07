#!/usr/bin/env bash
# K8s entrypoint: sync benchmarks+lic, build lic, run goal-directed-loop until nightly green.
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN required}"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"

BENCHMARKS_ROOT="${LI_BENCHMARK_NIGHTLY_GREEN_BENCHMARKS_ROOT:-/workspace/benchmarks}"
LIC_ROOT="${LI_BENCHMARK_NIGHTLY_GREEN_LIC_ROOT:-/workspace/lic}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
GOAL_REL="${LI_BENCHMARK_NIGHTLY_GREEN_GOAL_FILE:-data/goal-directed-sprints/benchmark-nightly-green.md}"
AGENT="${LI_BENCHMARK_NIGHTLY_GREEN_AGENT:-code_implementer}"
BENCHMARKS_BRANCH="${LI_BENCHMARK_NIGHTLY_GREEN_BENCHMARKS_BRANCH:-cursor/benchmark-nightly-green}"
LIC_BRANCH="${LI_BENCHMARK_NIGHTLY_GREEN_LIC_BRANCH:-main}"
LOOP_SLEEP="${LI_BENCHMARK_NIGHTLY_GREEN_LOOP_SLEEP_SEC:-${LI_GOAL_LOOP_SLEEP_SEC:-90}}"

resolve_goal_file() {
  local dest="$AGENTS_ROOT/$GOAL_REL"
  if [[ -f "$dest" ]]; then
    echo "$dest"
    return 0
  fi
  mkdir -p "$AGENTS_ROOT/data/goal-directed-sprints"
  if [[ -f /config/benchmark-nightly-green.md ]]; then
    cp /config/benchmark-nightly-green.md "$AGENTS_ROOT/data/goal-directed-sprints/benchmark-nightly-green.md"
    [[ -f /config/benchmark-nightly-green-plan.md ]] && \
      cp /config/benchmark-nightly-green-plan.md "$AGENTS_ROOT/data/goal-directed-sprints/benchmark-nightly-green-plan.md"
    echo "$AGENTS_ROOT/data/goal-directed-sprints/benchmark-nightly-green.md"
    return 0
  fi
  return 1
}

echo "benchmark-nightly-green-entrypoint: benchmarks=${BENCHMARKS_ROOT} branch=${BENCHMARKS_BRANCH} lic=${LIC_ROOT}"

if [[ -f /config/k8s-goal-loop-common.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-goal-loop-common.sh
fi

export GH_TOKEN GITHUB_TOKEN
echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null || true
gh auth setup-git 2>/dev/null || true
git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
git config --global user.email "${LI_GIT_USER_EMAIL:-benchmark-nightly@li-langverse.dev}"
git config --global user.name "${LI_GIT_USER_NAME:-li-benchmark-nightly-green}"

sync_repo() {
  local root="$1"
  local branch="$2"
  [[ -d "$root/.git" ]] || return 0
  git -C "$root" fetch origin --prune
  if ! git -C "$root" show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
    git -C "$root" fetch origin "${branch}:refs/remotes/origin/${branch}" --depth=1 2>/dev/null || \
      git -C "$root" fetch origin --unshallow 2>/dev/null || \
      git -C "$root" fetch origin --prune
  fi
  if git -C "$root" show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
    git -C "$root" checkout -B "$branch" "origin/${branch}"
    git -C "$root" reset --hard "origin/${branch}"
  else
    echo "benchmark-nightly-green-entrypoint: WARN origin/${branch} missing in $(basename "$root") — staying on current branch" >&2
    git -C "$root" checkout -B "$branch" 2>/dev/null || true
  fi
}

ensure_lic_built() {
  local lic_bin="$LIC_ROOT/build/compiler/lic/lic"
  if [[ -x "$lic_bin" ]]; then
    export LIC="$lic_bin" LIC_ROOT LI_REPO_ROOT="$LIC_ROOT"
    echo "benchmark-nightly-green-entrypoint: lic present at ${LIC}"
    return 0
  fi
  echo "benchmark-nightly-green-entrypoint: building lic (LLVM 22 in-container)"
  if (cd "$LIC_ROOT" && bash scripts/build.sh); then
    export LIC="$lic_bin" LIC_ROOT LI_REPO_ROOT="$LIC_ROOT"
    echo "benchmark-nightly-green-entrypoint: lic build OK"
    return 0
  fi
  echo "benchmark-nightly-green-entrypoint: WARN lic build failed; agent may fix lic" >&2
  return 0
}

sync_workspace() {
  sync_repo "$BENCHMARKS_ROOT" "$BENCHMARKS_BRANCH"
  sync_repo "$LIC_ROOT" "$LIC_BRANCH"
  export LIC_ROOT LI_REPO_ROOT="$LIC_ROOT" BENCHMARKS_ROOT
  ensure_lic_built
  GOAL_FILE="$(resolve_goal_file)" || {
    echo "benchmark-nightly-green-entrypoint: missing goal file (image + /config bundle)" >&2
    exit 1
  }
  [[ -f "$BENCHMARKS_ROOT/scripts/benchmark-nightly-green-progress-gate.sh" ]] || {
    echo "benchmark-nightly-green-entrypoint: WARN gate scripts missing on ${BENCHMARKS_BRANCH} — agent should add them" >&2
  }
  chmod +x "$BENCHMARKS_ROOT/scripts/benchmark-nightly-green-"*.sh 2>/dev/null || true
}

run_goal_loop() {
  install_goal_loop_scripts "$AGENTS_ROOT"
  export_goal_loop_self_unblock_env "$BENCHMARKS_BRANCH"
  export LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT"
  export LI_REPO_WORKFLOW_BRANCH="$BENCHMARKS_BRANCH"
  GOAL_FILE="$(resolve_goal_file)"
  "$AGENTS_ROOT/scripts/goal-directed-loop.sh" \
    --agent "$AGENT" \
    --workflow-repo benchmarks \
    --cwd "$BENCHMARKS_ROOT" \
    --goal-file "$GOAL_FILE" \
    --max 0 \
    --sleep "$LOOP_SLEEP"
}

while true; do
  sync_workspace

  set +e
  run_goal_loop
  rc=$?
  set -e

  if [[ "$rc" -eq 0 ]]; then
    finish_on_goal_complete
  fi

  echo "benchmark-nightly-green-entrypoint: loop stopped without completion (exit $rc) — retry in ${LOOP_SLEEP}s" >&2
  sleep "$LOOP_SLEEP"
done

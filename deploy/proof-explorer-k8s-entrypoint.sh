#!/usr/bin/env bash
# K8s entrypoint: sync lic workspace, run proof-explorer worker once per deploy, scale down when done.
set -euo pipefail

# shellcheck source=k8s-git-auth.sh
if [[ -f /git-auth/k8s-git-auth.sh ]]; then
  # shellcheck source=/dev/null
  source /git-auth/k8s-git-auth.sh
elif [[ -f /config/k8s-git-auth.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-git-auth.sh
else
  source "${LI_CURSOR_AGENTS_ROOT:-/app}/deploy/k8s-git-auth.sh"
fi
li_git_primary_setup || exit 1

ORG="${LI_GIT_GROUP:-li-langverse}"
REPO_LIC="${LI_PROOF_EXPLORER_LIC_REPO:-lic}"
REPO_BENCHMARKS="${LI_BENCHMARKS_REPO:-benchmarks}"
BRANCH="${LI_PROOF_EXPLORER_BRANCH:-cursor/proof-explorer-program}"
BENCHMARKS_BRANCH="${LI_BENCHMARKS_BRANCH:-main}"
LIC_ROOT="${LI_PROOF_EXPLORER_LIC_ROOT:-/workspace/lic}"
BENCHMARKS_ROOT="${BENCHMARKS_ROOT:-/workspace/benchmarks}"
PL_ROOT="${LI_PROOF_LIBRARY_ROOT:-/workspace/proof-library}"
REPO_PL="${LI_PROOF_LIBRARY_REPO:-proof-library}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
GOAL_REL="${LI_PROOF_EXPLORER_GOAL_FILE:-data/goal-directed-sprints/proof-explorer-program.md}"

echo "proof-explorer-k8s-entrypoint: branch=${BRANCH} lic=${LIC_ROOT}"

if [[ -f /config/k8s-goal-loop-common.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-goal-loop-common.sh
  install_goal_loop_scripts "$AGENTS_ROOT"
  export_goal_loop_self_unblock_env "$BRANCH"
fi

if [[ -f /config/ensure-llvm22-toolchain.sh ]]; then
  # shellcheck source=/dev/null
  source /config/ensure-llvm22-toolchain.sh
elif [[ -f "${AGENTS_ROOT}/deploy/scripts/ensure-llvm22-toolchain.sh" ]]; then
  # shellcheck source=/dev/null
  source "${AGENTS_ROOT}/deploy/scripts/ensure-llvm22-toolchain.sh"
fi

if [[ -n "${LI_PROOF_EXPLORER_SHARD_INDEX:-}" && -n "${LI_PROOF_EXPLORER_AGENT_STAGGER_SEC:-}" ]]; then
  _stagger_delay=$(( LI_PROOF_EXPLORER_SHARD_INDEX * LI_PROOF_EXPLORER_AGENT_STAGGER_SEC ))
  if [[ "$_stagger_delay" -gt 0 ]]; then
    echo "proof-explorer-k8s-entrypoint: shard ${LI_PROOF_EXPLORER_SHARD_INDEX} agent stagger ${_stagger_delay}s"
    sleep "$_stagger_delay"
  fi
fi

mkdir -p "$(dirname "$LIC_ROOT")"

sync_lic_repo() {
  li_git_clone_repo "$REPO_LIC" "$LIC_ROOT" "$BRANCH"
}

sync_lic_repo

sync_benchmarks_repo() {
  if [[ ! -d "$BENCHMARKS_ROOT/.git" ]]; then
    echo "proof-explorer-k8s-entrypoint: cloning ${ORG}/${REPO_BENCHMARKS}"
    li_git_clone_repo "$REPO_BENCHMARKS" "$BENCHMARKS_ROOT" "$BENCHMARKS_BRANCH"
    return 0
  fi
  li_git_ensure_remotes "$BENCHMARKS_ROOT" "$REPO_BENCHMARKS"
  git -C "$BENCHMARKS_ROOT" fetch origin --prune
  if git -C "$BENCHMARKS_ROOT" show-ref --verify --quiet "refs/remotes/origin/${BENCHMARKS_BRANCH}"; then
    git -C "$BENCHMARKS_ROOT" checkout -f -B "$BENCHMARKS_BRANCH" "origin/${BENCHMARKS_BRANCH}"
    git -C "$BENCHMARKS_ROOT" reset --hard "origin/${BENCHMARKS_BRANCH}"
  fi
}

sync_benchmarks_repo

ensure_lic_built() {
  # shellcheck source=/dev/null
  source "${LIC_ROOT}/scripts/lib/lic-bin-select.sh"
  if lic_rel="$(li_pick_lic_bin "$LIC_ROOT" 2>/dev/null)"; then
    case "$lic_rel" in
      ./*) export LIC="${LIC_ROOT}/${lic_rel#./}" ;;
      *) export LIC="$lic_rel" ;;
    esac
    if [[ -x "$LIC" ]] && "$LIC" --version &>/dev/null; then
      echo "proof-explorer-k8s-entrypoint: lic present at ${LIC}"
      return 0
    fi
  fi
  if ! command -v clang-22 >/dev/null 2>&1; then
    echo "proof-explorer-k8s-entrypoint: WARN no clang-22 — lic build skipped" >&2
    return 0
  fi
  echo "proof-explorer-k8s-entrypoint: building lic (LLVM 22 in-container)"
  export CMAKE_BUILD_PARALLEL_LEVEL="${CMAKE_BUILD_PARALLEL_LEVEL:-2}"
  if (cd "$LIC_ROOT" && bash scripts/build.sh); then
    if lic_rel="$(li_pick_lic_bin "$LIC_ROOT")"; then
      case "$lic_rel" in
        ./*) export LIC="${LIC_ROOT}/${lic_rel#./}" ;;
        *) export LIC="$lic_rel" ;;
      esac
      echo "proof-explorer-k8s-entrypoint: lic build OK ${LIC}"
      return 0
    fi
  fi
  echo "proof-explorer-k8s-entrypoint: WARN lic build failed; gates may retry" >&2
  return 0
}

ensure_lic_built

sync_proof_library() {
  li_git_clone_repo "$REPO_PL" "$PL_ROOT" "main"
}

sync_proof_library
export LI_PROOF_LIBRARY_ROOT="$PL_ROOT"

if [[ ! -f "${LIC_ROOT}/${GOAL_REL}" && ! -f "${AGENTS_ROOT}/${GOAL_REL}" ]]; then
  echo "proof-explorer-k8s-entrypoint: missing goal file ${GOAL_REL}" >&2
  exit 1
fi

export LI_PROOF_EXPLORER_LIC_ROOT="$LIC_ROOT"
export LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT"
export LIC_ROOT="$LIC_ROOT"
export BENCHMARKS_ROOT="$BENCHMARKS_ROOT"
export LIC="${LIC:-}"
export LI_PROOF_EXPLORER_ALWAYS_ON="${LI_PROOF_EXPLORER_ALWAYS_ON:-1}"
if [[ -z "${LI_PROOF_EXPLORER_EXIT_ON_COMPLETE:-}" && "${LI_PROOF_EXPLORER_PHASE_HANDOFF:-1}" == "0" ]]; then
  export LI_PROOF_EXPLORER_EXIT_ON_COMPLETE=1
fi

set +e
node "${AGENTS_ROOT}/dist/cli/proof-explorer-worker.js" start
rc=$?
set -e

if [[ "$rc" -eq 0 ]]; then
  finish_on_goal_complete
fi

echo "proof-explorer-k8s-entrypoint: worker exited without completion (rc=${rc})" >&2
exit "$rc"

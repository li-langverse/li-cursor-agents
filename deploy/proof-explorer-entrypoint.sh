#!/usr/bin/env bash
# Clone/sync lic workspace, configure GH push auth, start proof-explorer worker.
set -euo pipefail

if [[ -f /git-auth/k8s-git-auth.sh ]]; then
  # shellcheck source=/dev/null
  source /git-auth/k8s-git-auth.sh
elif [[ -f /config/k8s-git-auth.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-git-auth.sh
else
  # shellcheck source=k8s-git-auth.sh
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
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"

echo "proof-explorer-entrypoint: auth + workspace sync branch=${BRANCH} lic=${LIC_ROOT}"

mkdir -p "$(dirname "$LIC_ROOT")"

sync_lic_repo() {
  echo "proof-explorer-entrypoint: syncing ${ORG}/${REPO_LIC} branch=${BRANCH}"
  li_git_clone_repo "$REPO_LIC" "$LIC_ROOT" "$BRANCH"
}

sync_lic_repo

sync_benchmarks_repo() {
  if [[ ! -d "$BENCHMARKS_ROOT/.git" ]]; then
    echo "proof-explorer-entrypoint: cloning ${ORG}/${REPO_BENCHMARKS}"
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

GOAL_REL="${LI_PROOF_EXPLORER_GOAL_FILE:-data/goal-directed-sprints/proof-explorer-program.md}"; test -f "${LIC_ROOT}/${GOAL_REL}" || {
  echo "proof-explorer-entrypoint: missing goal file in lic repo" >&2
  exit 1
}

export LI_PROOF_EXPLORER_LIC_ROOT="$LIC_ROOT"
export LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT"
export LIC_ROOT="$LIC_ROOT"
export BENCHMARKS_ROOT="$BENCHMARKS_ROOT"

echo "proof-explorer-entrypoint: starting worker agents=${AGENTS_ROOT} lic=${LIC_ROOT}"
exec node "${AGENTS_ROOT}/dist/cli/proof-explorer-worker.js" start

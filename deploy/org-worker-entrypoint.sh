#!/usr/bin/env bash
# Org swarm worker bootstrap: GitLab-primary git auth + optional shallow lic/benchmarks sync.
set -euo pipefail

# shellcheck source=k8s-git-auth.sh
source "${LI_CURSOR_AGENTS_ROOT:-/app}/deploy/k8s-git-auth.sh"
li_git_primary_setup || exit 1

ORG="${LI_GIT_GROUP:-li-langverse}"
LIC_ROOT="${LIC_ROOT:-/workspace/lic}"
BENCHMARKS_ROOT="${BENCHMARKS_ROOT:-/workspace/benchmarks}"

git config --global user.email "${LI_GIT_USER_EMAIL:-org-swarm@li-langverse.dev}"
git config --global user.name "${LI_GIT_USER_NAME:-li-org-swarm}"

sync_repo() {
  local repo="$1"
  local dest="$2"
  local branch="${3:-main}"
  li_git_clone_repo "$repo" "$dest" "$branch"
}

if [[ "${LI_ORG_SYNC_LIC:-0}" == "1" ]]; then
  sync_repo "${LI_LIC_REPO:-lic}" "$LIC_ROOT" "${LI_LIC_BRANCH:-main}"
  export LIC_ROOT
fi

if [[ "${LI_ORG_SYNC_BENCHMARKS:-0}" == "1" ]]; then
  sync_repo "${LI_BENCHMARKS_REPO:-benchmarks}" "$BENCHMARKS_ROOT" "${LI_BENCHMARKS_BRANCH:-main}"
  export BENCHMARKS_ROOT
fi

exec "$@"

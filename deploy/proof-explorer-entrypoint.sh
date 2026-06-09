#!/usr/bin/env bash
# GitLab-primary clone/sync for goal-directed K8s workers (org rule: LI_GIT_HOST).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=k8s-git-auth.sh
source "${SCRIPT_DIR}/k8s-git-auth.sh"

REPO_LIC="${LI_PROOF_EXPLORER_LIC_REPO:-lic}"
BRANCH="${LI_PROOF_EXPLORER_BRANCH:-cursor/proof-explorer-program}"
FALLBACK_RAW="${LI_PROOF_EXPLORER_BRANCH_FALLBACKS:-${BRANCH},main}"
LIC_ROOT="${LI_PROOF_EXPLORER_LIC_ROOT:-/workspace/lic}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"

echo "proof-explorer-entrypoint: GitLab-primary sync branch=${BRANCH} lic=${LIC_ROOT}"

if ! li_git_primary_setup; then
  echo "proof-explorer-entrypoint: git auth setup failed (need GITLAB_TOKEN or GH_TOKEN)" >&2
  exit 1
fi

branch_candidates() {
  local primary="$1" s="" b
  for b in "$primary" ${FALLBACK_RAW//,/ }; do
    b="${b// /}"
    [[ -z "$b" ]] && continue
    [[ " $s " == *" $b "* ]] && continue
    s="$s $b"
    echo "$b"
  done
}

sync_lic_repo() {
  local b
  mkdir -p "$(dirname "$LIC_ROOT")"
  if [[ ! -d "$LIC_ROOT/.git" ]]; then
    echo "proof-explorer-entrypoint: cloning ${LI_GIT_GROUP}/${REPO_LIC} from ${LI_GIT_HOST}"
    for b in $(branch_candidates "$BRANCH"); do
      if li_git_clone_repo "$REPO_LIC" "$LIC_ROOT" "$b"; then
        li_git_ensure_remotes "$LIC_ROOT" "$REPO_LIC"
        git -C "$LIC_ROOT" checkout -f -B "$BRANCH" 2>/dev/null || git -C "$LIC_ROOT" checkout -f -B "$b"
        return 0
      fi
    done
    return 1
  fi

  li_git_ensure_remotes "$LIC_ROOT" "$REPO_LIC"
  echo "proof-explorer-entrypoint: updating existing clone"
  git -C "$LIC_ROOT" fetch origin --prune 2>/dev/null || true
  for b in $(branch_candidates "$BRANCH"); do
    if git -C "$LIC_ROOT" show-ref --verify --quiet "refs/remotes/origin/${b}"; then
      git -C "$LIC_ROOT" checkout -f -B "$BRANCH" "origin/${b}"
      git -C "$LIC_ROOT" reset --hard "origin/${b}"
      return 0
    fi
  done
  if git -C "$LIC_ROOT" show-ref --verify --quiet "refs/heads/${BRANCH}"; then
    git -C "$LIC_ROOT" checkout -f "$BRANCH"
    return 0
  fi
  git -C "$LIC_ROOT" checkout -f -B "$BRANCH"
}

sync_lic_repo || {
  echo "proof-explorer-entrypoint: lic sync failed" >&2
  exit 1
}

GOAL_REL="${LI_PROOF_EXPLORER_GOAL_FILE:-data/goal-directed-sprints/proof-explorer-program.md}"
test -f "${LIC_ROOT}/${GOAL_REL}" || {
  echo "proof-explorer-entrypoint: missing goal file in lic repo" >&2
  exit 1
}

export LI_PROOF_EXPLORER_LIC_ROOT="$LIC_ROOT"
export LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT"
export LIC_ROOT="$LIC_ROOT"

echo "proof-explorer-entrypoint: starting worker agents=${AGENTS_ROOT} lic=${LIC_ROOT}"
exec node "${AGENTS_ROOT}/dist/cli/proof-explorer-worker.js" start

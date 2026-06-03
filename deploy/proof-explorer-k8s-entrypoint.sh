#!/usr/bin/env bash
# K8s entrypoint: sync lic workspace, run proof-explorer worker once per deploy, scale down when done.
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN required for clone and push}"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"

ORG="${LI_GITHUB_ORG:-li-langverse}"
REPO_LIC="${LI_PROOF_EXPLORER_LIC_REPO:-lic}"
BRANCH="${LI_PROOF_EXPLORER_BRANCH:-cursor/proof-explorer-program}"
LIC_ROOT="${LI_PROOF_EXPLORER_LIC_ROOT:-/workspace/lic}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
GOAL_REL="${LI_PROOF_EXPLORER_GOAL_FILE:-data/goal-directed-sprints/proof-explorer-program.md}"

echo "proof-explorer-k8s-entrypoint: branch=${BRANCH} lic=${LIC_ROOT}"

export GH_TOKEN GITHUB_TOKEN
echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null || true
gh auth setup-git 2>/dev/null || true
git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
git config --global user.email "${LI_GIT_USER_EMAIL:-proof-explorer@li-langverse.dev}"
git config --global user.name "${LI_GIT_USER_NAME:-li-proof-explorer}"

if [[ -f /config/k8s-goal-loop-common.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-goal-loop-common.sh
  install_goal_loop_scripts "$AGENTS_ROOT"
  export_goal_loop_self_unblock_env "$BRANCH"
fi

mkdir -p "$(dirname "$LIC_ROOT")"

sync_lic_repo() {
  if [[ ! -d "$LIC_ROOT/.git" ]]; then
    echo "proof-explorer-k8s-entrypoint: cloning ${ORG}/${REPO_LIC}"
    if gh repo clone "${ORG}/${REPO_LIC}" "$LIC_ROOT" -- --branch "$BRANCH" 2>/dev/null; then
      return 0
    fi
    rm -rf "$LIC_ROOT"
    gh repo clone "${ORG}/${REPO_LIC}" "$LIC_ROOT"
    git -C "$LIC_ROOT" checkout -B "$BRANCH" || git -C "$LIC_ROOT" checkout -B "$BRANCH" origin/HEAD
    return 0
  fi
  git -C "$LIC_ROOT" fetch origin --prune
  if git -C "$LIC_ROOT" show-ref --verify --quiet "refs/remotes/origin/${BRANCH}"; then
    git -C "$LIC_ROOT" checkout -f -B "$BRANCH" "origin/${BRANCH}"
    git -C "$LIC_ROOT" reset --hard "origin/${BRANCH}"
  else
    git -C "$LIC_ROOT" checkout -f -B "$BRANCH"
  fi
}

sync_lic_repo

if [[ ! -f "${LIC_ROOT}/${GOAL_REL}" && ! -f "${AGENTS_ROOT}/${GOAL_REL}" ]]; then
  echo "proof-explorer-k8s-entrypoint: missing goal file ${GOAL_REL}" >&2
  exit 1
fi

export LI_PROOF_EXPLORER_LIC_ROOT="$LIC_ROOT"
export LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT"
export LIC_ROOT="$LIC_ROOT"
export LI_PROOF_EXPLORER_ALWAYS_ON="${LI_PROOF_EXPLORER_ALWAYS_ON:-1}"

set +e
node "${AGENTS_ROOT}/dist/cli/proof-explorer-worker.js" start
rc=$?
set -e

if [[ "$rc" -eq 0 ]]; then
  finish_on_goal_complete
fi

echo "proof-explorer-k8s-entrypoint: worker exited without completion (rc=${rc})" >&2
exit "$rc"

#!/usr/bin/env bash
# Clone/sync lic workspace, configure GH push auth, start goal-directed worker.
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN required for clone and push}"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"

ORG="${LI_GITHUB_ORG:-li-langverse}"
REPO_LIC="${LI_PROOF_EXPLORER_LIC_REPO:-lic}"
BRANCH="${LI_PROOF_EXPLORER_BRANCH:-cursor/proof-explorer-program}"
LIC_ROOT="${LI_PROOF_EXPLORER_LIC_ROOT:-/workspace/lic}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
GOAL_REL="${LI_PROOF_EXPLORER_GOAL_FILE:-data/goal-directed-sprints/proof-explorer-program.md}"

echo "goal-directed-entrypoint: branch=${BRANCH} lic=${LIC_ROOT} goal=${GOAL_REL}"

export GH_TOKEN GITHUB_TOKEN
echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null || true
gh auth setup-git 2>/dev/null || true
git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
git config --global user.email "${LI_GIT_USER_EMAIL:-goal-worker@li-langverse.dev}"
git config --global user.name "${LI_GIT_USER_NAME:-li-goal-worker}"

mkdir -p "$(dirname "$LIC_ROOT")"

if [[ ! -d "$LIC_ROOT/.git" ]]; then
  gh repo clone "${ORG}/${REPO_LIC}" "$LIC_ROOT" -- --branch "$BRANCH" 2>/dev/null || {
    rm -rf "$LIC_ROOT"
    gh repo clone "${ORG}/${REPO_LIC}" "$LIC_ROOT"
    git -C "$LIC_ROOT" checkout -B "$BRANCH"
  }
else
  git -C "$LIC_ROOT" fetch origin --prune
  git -C "$LIC_ROOT" checkout -f -B "$BRANCH" "origin/${BRANCH}" 2>/dev/null || git -C "$LIC_ROOT" checkout -f -B "$BRANCH"
  git -C "$LIC_ROOT" reset --hard "origin/${BRANCH}" 2>/dev/null || true
fi

test -f "${LIC_ROOT}/${GOAL_REL}" || {
  echo "goal-directed-entrypoint: missing ${LIC_ROOT}/${GOAL_REL}" >&2
  exit 1
}

export LI_PROOF_EXPLORER_LIC_ROOT="$LIC_ROOT"
export LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT"
export LIC_ROOT="$LIC_ROOT"
export LI_PROOF_EXPLORER_GOAL_FILE="$GOAL_REL"

echo "goal-directed-entrypoint: starting worker (runs until completion gate passes)"
exec node "${AGENTS_ROOT}/dist/cli/proof-explorer-worker.js" start
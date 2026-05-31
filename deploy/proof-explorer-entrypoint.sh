#!/usr/bin/env bash
# Clone/sync lic workspace, configure GH push auth, start proof-explorer worker.
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN required for clone and push}"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"

ORG="${LI_GITHUB_ORG:-li-langverse}"
REPO_LIC="${LI_PROOF_EXPLORER_LIC_REPO:-lic}"
BRANCH="${LI_PROOF_EXPLORER_BRANCH:-cursor/proof-explorer-program}"
LIC_ROOT="${LI_PROOF_EXPLORER_LIC_ROOT:-/workspace/lic}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"

echo "proof-explorer-entrypoint: auth + workspace sync branch=${BRANCH} lic=${LIC_ROOT}"

export GH_TOKEN GITHUB_TOKEN
echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null || true
gh auth setup-git 2>/dev/null || true
git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
git config --global user.email "${LI_GIT_USER_EMAIL:-proof-explorer@li-langverse.dev}"
git config --global user.name "${LI_GIT_USER_NAME:-li-proof-explorer}"

mkdir -p "$(dirname "$LIC_ROOT")"

sync_lic_repo() {
  if [[ ! -d "$LIC_ROOT/.git" ]]; then
    echo "proof-explorer-entrypoint: cloning ${ORG}/${REPO_LIC}"
    if gh repo clone "${ORG}/${REPO_LIC}" "$LIC_ROOT" -- --branch "$BRANCH" 2>/dev/null; then
      return 0
    fi
    echo "proof-explorer-entrypoint: branch ${BRANCH} missing, cloning default"
    rm -rf "$LIC_ROOT"
    gh repo clone "${ORG}/${REPO_LIC}" "$LIC_ROOT"
    git -C "$LIC_ROOT" checkout -B "$BRANCH" || git -C "$LIC_ROOT" checkout -B "$BRANCH" origin/HEAD
    return 0
  fi

  echo "proof-explorer-entrypoint: updating existing clone"
  git -C "$LIC_ROOT" fetch origin --prune
  if git -C "$LIC_ROOT" show-ref --verify --quiet "refs/heads/${BRANCH}"; then
    git -C "$LIC_ROOT" checkout "$BRANCH"
  elif git -C "$LIC_ROOT" show-ref --verify --quiet "refs/remotes/origin/${BRANCH}"; then
    git -C "$LIC_ROOT" checkout -B "$BRANCH" "origin/${BRANCH}"
  else
    git -C "$LIC_ROOT" checkout -B "$BRANCH"
  fi
  git -C "$LIC_ROOT" fetch origin "$BRANCH"
  git -C "$LIC_ROOT" reset --hard "origin/${BRANCH}"}

sync_lic_repo

test -f "${LIC_ROOT}/data/goal-directed-sprints/proof-explorer-program.md" || {
  echo "proof-explorer-entrypoint: missing goal file in lic repo" >&2
  exit 1
}

export LI_PROOF_EXPLORER_LIC_ROOT="$LIC_ROOT"
export LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT"
export LIC_ROOT="$LIC_ROOT"

echo "proof-explorer-entrypoint: starting worker agents=${AGENTS_ROOT} lic=${LIC_ROOT}"
exec node "${AGENTS_ROOT}/dist/cli/proof-explorer-worker.js" start

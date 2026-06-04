#!/usr/bin/env bash
# Org swarm worker bootstrap: gh auth + optional shallow lic/benchmarks sync.
set -euo pipefail

ORG="${LI_GITHUB_ORG:-li-langverse}"
LIC_ROOT="${LIC_ROOT:-/workspace/lic}"
BENCHMARKS_ROOT="${BENCHMARKS_ROOT:-/workspace/benchmarks}"

if [[ -n "${GH_SWARM_TOKEN:-}" ]]; then
  export GH_TOKEN="$GH_SWARM_TOKEN"
fi

if [[ -n "${GH_TOKEN:-}" ]]; then
  export GITHUB_TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"
  echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null || true
  gh auth setup-git 2>/dev/null || true
  git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/" 2>/dev/null || true
  git config --global user.email "${LI_GIT_USER_EMAIL:-org-swarm@li-langverse.dev}"
  git config --global user.name "${LI_GIT_USER_NAME:-li-org-swarm}"
fi

sync_repo() {
  local repo="$1"
  local dest="$2"
  local branch="${3:-main}"
  mkdir -p "$(dirname "$dest")"
  if [[ ! -d "$dest/.git" ]]; then
    echo "org-worker-entrypoint: cloning ${ORG}/${repo} → ${dest}"
    gh repo clone "${ORG}/${repo}" "$dest" -- --depth 1 --branch "$branch" 2>/dev/null \
      || gh repo clone "${ORG}/${repo}" "$dest" -- --depth 1
    return 0
  fi
  echo "org-worker-entrypoint: fetching ${dest}"
  git -C "$dest" fetch origin --depth 1 "$branch" 2>/dev/null || git -C "$dest" fetch origin --depth 1
  git -C "$dest" checkout -f "$branch" 2>/dev/null || git -C "$dest" checkout -f -B "$branch" "origin/${branch}"
  git -C "$dest" reset --hard "origin/${branch}" 2>/dev/null || true
}

if [[ "${LI_ORG_SYNC_LIC:-0}" == "1" ]] && [[ -n "${GH_TOKEN:-}" ]]; then
  sync_repo "${LI_LIC_REPO:-lic}" "$LIC_ROOT" "${LI_LIC_BRANCH:-main}"
  export LIC_ROOT
fi

if [[ "${LI_ORG_SYNC_BENCHMARKS:-0}" == "1" ]] && [[ -n "${GH_TOKEN:-}" ]]; then
  sync_repo "${LI_BENCHMARKS_REPO:-benchmarks}" "$BENCHMARKS_ROOT" "${LI_BENCHMARKS_BRANCH:-main}"
  export BENCHMARKS_ROOT
fi

exec "$@"

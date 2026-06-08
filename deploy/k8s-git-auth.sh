#!/usr/bin/env bash
# GitLab-primary git auth for K8s goal-directed workers. Source from entrypoints.
# Prefers GITLAB_TOKEN; falls back to GH_TOKEN (legacy GitHub-primary).
set -euo pipefail

li_git_primary_setup() {
  LI_GIT_HOST="${LI_GIT_HOST:-gitlab.lilangverse.xyz}"
  LI_GIT_GROUP="${LI_GIT_GROUP:-li-langverse}"
  LI_GIT_SCHEME="${LI_GIT_SCHEME:-https}"

  if [[ -n "${GITLAB_TOKEN:-}" ]]; then
    LI_GIT_TOKEN="$GITLAB_TOKEN"
    LI_GIT_AUTH_PREFIX="oauth2"
  elif [[ -n "${GH_TOKEN:-}" ]]; then
    LI_GIT_TOKEN="$GH_TOKEN"
    LI_GIT_HOST="${LI_GIT_HOST_LEGACY:-github.com}"
    LI_GIT_GROUP="${LI_GITHUB_ORG:-li-langverse}"
    LI_GIT_AUTH_PREFIX="x-access-token"
  else
    echo "ERROR: GITLAB_TOKEN or GH_TOKEN required for git clone/push" >&2
    return 1
  fi

  export LI_GIT_HOST LI_GIT_GROUP LI_GIT_TOKEN LI_GIT_AUTH_PREFIX LI_GIT_SCHEME

  git config --global user.email "${LI_GIT_USER_EMAIL:-goal-worker@li-langverse.dev}"
  git config --global user.name "${LI_GIT_USER_NAME:-li-goal-worker}"
  git config --global url."${LI_GIT_SCHEME}://${LI_GIT_AUTH_PREFIX}:${LI_GIT_TOKEN}@${LI_GIT_HOST}/".insteadOf "${LI_GIT_SCHEME}://${LI_GIT_HOST}/"

  if [[ -n "${GH_TOKEN:-}" ]]; then
    export GITHUB_TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"
    echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null || true
    gh auth setup-git 2>/dev/null || true
    git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
  fi
}

li_git_remote_url() {
  local repo="$1"
  echo "${LI_GIT_SCHEME}://${LI_GIT_AUTH_PREFIX}:${LI_GIT_TOKEN}@${LI_GIT_HOST}/${LI_GIT_GROUP}/${repo}.git"
}

li_git_clone_repo() {
  local repo="$1" dest="$2" branch="${3:-main}"
  local url
  url="$(li_git_remote_url "$repo")"
  mkdir -p "$(dirname "$dest")"
  if [[ ! -d "$dest/.git" ]]; then
    if git clone --branch "$branch" "$url" "$dest" 2>/dev/null; then
      return 0
    fi
    rm -rf "$dest"
    git clone "$url" "$dest"
    git -C "$dest" checkout -B "$branch" "origin/${branch}" 2>/dev/null \
      || git -C "$dest" checkout -B "$branch" origin/HEAD 2>/dev/null \
      || git -C "$dest" checkout -B "$branch"
    return 0
  fi
  git -C "$dest" fetch origin --prune
  if git -C "$dest" show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
    git -C "$dest" checkout -f -B "$branch" "origin/${branch}"
    git -C "$dest" reset --hard "origin/${branch}"
  else
    git -C "$dest" checkout -f -B "$branch"
  fi
}

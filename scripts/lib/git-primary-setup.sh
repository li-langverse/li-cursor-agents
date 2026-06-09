#!/usr/bin/env bash
# GitLab-primary git auth for background swarm runners (systemd, keep-agents-running).
# origin → GitLab; github → fetch-only mirror. See .cursor/rules/gitlab-primary-github-mirror.mdc
set -euo pipefail

li_git_load_tokens() {
  local root="${1:-}"
  if [[ -n "${GITLAB_TOKEN:-}" ]]; then
    return 0
  fi
  local candidates=()
  [[ -n "${LI_GITLAB_ENV:-}" ]] && candidates+=("$LI_GITLAB_ENV")
  candidates+=(
    "${HOME}/launchpad/.env"
    "${HOME}/Documents/Programming/li/.env.gitlab"
    "${HOME}/Documents/Programming/li/li-cursor-agents/.env.gitlab"
  )
  [[ -n "$root" && -f "$root/.env.gitlab" ]] && candidates+=("$root/.env.gitlab")
  [[ -n "$root" && -f "$root/.env" ]] && candidates+=("$root/.env")
  local f
  for f in "${candidates[@]}"; do
    [[ -f "$f" ]] || continue
    # shellcheck disable=SC1090
    set -a
    source "$f"
    set +a
    [[ -n "${GITLAB_TOKEN:-}" ]] && return 0
  done
}

li_git_primary_bootstrap() {
  local agents_root="${1:-${LI_CURSOR_AGENTS_ROOT:-}}"
  if [[ -z "$agents_root" ]]; then
    agents_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  fi
  li_git_load_tokens "$agents_root"
  export LI_VCS_PROVIDER="${LI_VCS_PROVIDER:-gitlab}"
  export LI_GITLAB_HOST="${LI_GITLAB_HOST:-gitlab.lilangverse.xyz}"
  export LI_GITLAB_GROUP="${LI_GITLAB_GROUP:-li-langverse}"
  export LI_GIT_HOST="${LI_GIT_HOST:-$LI_GITLAB_HOST}"
  export LI_GIT_GROUP="${LI_GIT_GROUP:-$LI_GITLAB_GROUP}"
  # shellcheck source=../../deploy/k8s-git-auth.sh
  source "$agents_root/deploy/k8s-git-auth.sh"
  li_git_primary_setup || return 1
  return 0
}

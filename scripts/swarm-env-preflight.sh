#!/usr/bin/env bash
# Fail fast when git + GitHub API credentials are missing from the Cursor workspace .env.
# GitLab-primary: GITLAB_TOKEN for clone/push; GH_TOKEN still used for Issues API / GHCR.
# Logs boolean presence only — never print token values.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${LI_CURSOR_ENV_FILE:-$HOME/Documents/Cursor/.env}"
# shellcheck source=lib/git-primary-setup.sh
source "$ROOT/scripts/lib/git-primary-setup.sh"
li_git_load_tokens "$ROOT"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi
[[ -f "$ROOT/.env" ]] && { set -a; source "$ROOT/.env"; set +a; }

export GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
export LI_VCS_PROVIDER="${LI_VCS_PROVIDER:-gitlab}"

gitlab_ok=0
gh_ok=0
[[ -n "${GITLAB_TOKEN:-}" ]] && gitlab_ok=1
[[ -n "${GH_TOKEN:-}" || -n "${GITHUB_TOKEN:-}" ]] && gh_ok=1

if [[ "${LI_VCS_PROVIDER}" == "github" ]]; then
  if [[ "$gh_ok" -eq 0 ]]; then
    echo "swarm-env-preflight: GH_TOKEN present=no env_file=${ENV_FILE}" >&2
    exit 1
  fi
  echo "swarm-env-preflight: GH_TOKEN present=yes (github-primary legacy) env_file=${ENV_FILE}"
  exit 0
fi

if [[ "$gitlab_ok" -eq 0 ]]; then
  echo "swarm-env-preflight: GITLAB_TOKEN present=no env_file=${ENV_FILE}" >&2
  exit 1
fi
echo "swarm-env-preflight: GITLAB_TOKEN present=yes GH_TOKEN present=$([[ $gh_ok -eq 1 ]] && echo yes || echo no) env_file=${ENV_FILE}"

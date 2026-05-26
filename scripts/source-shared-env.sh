#!/usr/bin/env bash
# Load GH_TOKEN + CURSOR_API_KEY from the Cursor workspace .env (parent of li-langverse).
# Sourced by stack/supervisor/setup scripts after env.defaults.sh.
set -euo pipefail
ROOT="${LI_CURSOR_AGENTS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

_resolve_shared_env() {
  if [[ -n "${LI_CURSOR_ENV_FILE:-}" && -f "${LI_CURSOR_ENV_FILE}" ]]; then
    echo "${LI_CURSOR_ENV_FILE}"
    return 0
  fi
  if [[ -n "${LI_SHARED_ENV:-}" && -f "${LI_SHARED_ENV}" ]]; then
    echo "${LI_SHARED_ENV}"
    return 0
  fi
  if [[ -n "${LI_GITHUB_ENV:-}" && -f "${LI_GITHUB_ENV}" ]]; then
    echo "${LI_GITHUB_ENV}"
    return 0
  fi
  local cursor_env="$ROOT/../../.env"
  if [[ -f "$cursor_env" ]]; then
    echo "$(cd "$(dirname "$cursor_env")" && pwd)/$(basename "$cursor_env")"
    return 0
  fi
  if [[ -f "$ROOT/../.env.github" ]]; then
    echo "$ROOT/../.env.github"
    return 0
  fi
  if [[ -f "$ROOT/.env" ]]; then
    echo "$ROOT/.env"
    return 0
  fi
  return 1
}

if path="$(_resolve_shared_env 2>/dev/null)"; then
  export LI_SHARED_ENV="$path"
  export LI_GITHUB_ENV="${LI_GITHUB_ENV:-$path}"
  set -a
  # shellcheck source=/dev/null
  source "$path"
  set +a
  export GH_TOKEN GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
  export CURSOR_API_KEY="${CURSOR_API_KEY:-${CURSOR_SDK_KEY:-${CURSOR_SDK:-}}}"
fi

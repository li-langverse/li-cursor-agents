#!/usr/bin/env bash
# Fail fast when GitHub push/PR credentials are missing from the Cursor workspace .env.
# Logs boolean presence only — never print token values.
set -euo pipefail
ENV_FILE="${LI_CURSOR_ENV_FILE:-$HOME/Documents/Cursor/.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi
export GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
if [[ -z "${GH_TOKEN:-}" && -z "${GITHUB_TOKEN:-}" ]]; then
  echo "swarm-env-preflight: GH_TOKEN present=no env_file=${ENV_FILE}" >&2
  exit 1
fi
echo "swarm-env-preflight: GH_TOKEN present=yes env_file=${ENV_FILE}"

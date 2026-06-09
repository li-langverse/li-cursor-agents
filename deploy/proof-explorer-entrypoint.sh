#!/usr/bin/env bash
# Clone/sync lic workspace, configure GH push auth, start proof-explorer worker.
set -euo pipefail

if [[ -f /config/k8s-git-auth.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-git-auth.sh
else
  # shellcheck source=k8s-git-auth.sh
  source "${LI_CURSOR_AGENTS_ROOT:-/app}/deploy/k8s-git-auth.sh"
fi
li_git_primary_setup || exit 1

ORG="${LI_GIT_GROUP:-li-langverse}"
REPO_LIC="${LI_PROOF_EXPLORER_LIC_REPO:-lic}"
BRANCH="${LI_PROOF_EXPLORER_BRANCH:-cursor/proof-explorer-program}"
LIC_ROOT="${LI_PROOF_EXPLORER_LIC_ROOT:-/workspace/lic}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"

echo "proof-explorer-entrypoint: auth + workspace sync branch=${BRANCH} lic=${LIC_ROOT}"

mkdir -p "$(dirname "$LIC_ROOT")"

sync_lic_repo() {
  echo "proof-explorer-entrypoint: syncing ${ORG}/${REPO_LIC} branch=${BRANCH}"
  li_git_clone_repo "$REPO_LIC" "$LIC_ROOT" "$BRANCH"
}

sync_lic_repo

GOAL_REL="${LI_PROOF_EXPLORER_GOAL_FILE:-data/goal-directed-sprints/proof-explorer-program.md}"; test -f "${LIC_ROOT}/${GOAL_REL}" || {
  echo "proof-explorer-entrypoint: missing goal file in lic repo" >&2
  exit 1
}

export LI_PROOF_EXPLORER_LIC_ROOT="$LIC_ROOT"
export LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT"
export LIC_ROOT="$LIC_ROOT"

echo "proof-explorer-entrypoint: starting worker agents=${AGENTS_ROOT} lic=${LIC_ROOT}"
exec node "${AGENTS_ROOT}/dist/cli/proof-explorer-worker.js" start

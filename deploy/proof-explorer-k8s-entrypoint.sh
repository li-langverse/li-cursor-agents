#!/usr/bin/env bash
# K8s entrypoint: sync lic workspace, run proof-explorer worker once per deploy, scale down when done.
set -euo pipefail

# shellcheck source=k8s-git-auth.sh
source "${LI_CURSOR_AGENTS_ROOT:-/app}/deploy/k8s-git-auth.sh"
li_git_primary_setup || exit 1

ORG="${LI_GIT_GROUP:-li-langverse}"
REPO_LIC="${LI_PROOF_EXPLORER_LIC_REPO:-lic}"
BRANCH="${LI_PROOF_EXPLORER_BRANCH:-cursor/proof-explorer-program}"
LIC_ROOT="${LI_PROOF_EXPLORER_LIC_ROOT:-/workspace/lic}"
PL_ROOT="${LI_PROOF_LIBRARY_ROOT:-/workspace/proof-library}"
REPO_PL="${LI_PROOF_LIBRARY_REPO:-proof-library}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
GOAL_REL="${LI_PROOF_EXPLORER_GOAL_FILE:-data/goal-directed-sprints/proof-explorer-program.md}"

echo "proof-explorer-k8s-entrypoint: branch=${BRANCH} lic=${LIC_ROOT}"

if [[ -f /config/k8s-goal-loop-common.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-goal-loop-common.sh
  install_goal_loop_scripts "$AGENTS_ROOT"
  export_goal_loop_self_unblock_env "$BRANCH"
fi

mkdir -p "$(dirname "$LIC_ROOT")"

sync_lic_repo() {
  li_git_clone_repo "$REPO_LIC" "$LIC_ROOT" "$BRANCH"
}

sync_lic_repo

ensure_lic_built() {
  # shellcheck source=/dev/null
  source "${LIC_ROOT}/scripts/lib/lic-bin-select.sh"
  if lic_rel="$(li_pick_lic_bin "$LIC_ROOT" 2>/dev/null)"; then
    case "$lic_rel" in
      ./*) export LIC="${LIC_ROOT}/${lic_rel#./}" ;;
      *) export LIC="$lic_rel" ;;
    esac
    echo "proof-explorer-k8s-entrypoint: lic present at ${LIC}"
    return 0
  fi
  echo "proof-explorer-k8s-entrypoint: building lic (LLVM in-container)"
  if (cd "$LIC_ROOT" && bash scripts/build.sh); then
    if lic_rel="$(li_pick_lic_bin "$LIC_ROOT")"; then
      case "$lic_rel" in
        ./*) export LIC="${LIC_ROOT}/${lic_rel#./}" ;;
        *) export LIC="$lic_rel" ;;
      esac
      echo "proof-explorer-k8s-entrypoint: lic build OK ${LIC}"
      return 0
    fi
  fi
  echo "proof-explorer-k8s-entrypoint: WARN lic build failed; gates may retry" >&2
  return 0
}

ensure_lic_built

sync_proof_library() {
  li_git_clone_repo "$REPO_PL" "$PL_ROOT" "main"
}

sync_proof_library
export LI_PROOF_LIBRARY_ROOT="$PL_ROOT"

if [[ ! -f "${LIC_ROOT}/${GOAL_REL}" && ! -f "${AGENTS_ROOT}/${GOAL_REL}" ]]; then
  echo "proof-explorer-k8s-entrypoint: missing goal file ${GOAL_REL}" >&2
  exit 1
fi

export LI_PROOF_EXPLORER_LIC_ROOT="$LIC_ROOT"
export LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT"
export LIC_ROOT="$LIC_ROOT"
export LIC="${LIC:-}"
export LI_PROOF_EXPLORER_ALWAYS_ON="${LI_PROOF_EXPLORER_ALWAYS_ON:-1}"
if [[ -z "${LI_PROOF_EXPLORER_EXIT_ON_COMPLETE:-}" && "${LI_PROOF_EXPLORER_PHASE_HANDOFF:-1}" == "0" ]]; then
  export LI_PROOF_EXPLORER_EXIT_ON_COMPLETE=1
fi

set +e
node "${AGENTS_ROOT}/dist/cli/proof-explorer-worker.js" start
rc=$?
set -e

if [[ "$rc" -eq 0 ]]; then
  finish_on_goal_complete
fi

echo "proof-explorer-k8s-entrypoint: worker exited without completion (rc=${rc})" >&2
exit "$rc"

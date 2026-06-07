#!/usr/bin/env bash
# K8s entrypoint: sync lic, self-unblock goal loop, scale down on GOAL_COMPLETE.
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN required}"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"

ORG="${LI_GITHUB_ORG:-li-langverse}"
REPO_LIC="${LI_PROOF_EXPLORER_LIC_REPO:-lic}"
PREFERRED_BRANCH="${LI_PROOF_EXPLORER_BRANCH:-cursor/li-parallel-native-hpc}"
FALLBACK_RAW="${LI_PROOF_EXPLORER_BRANCH_FALLBACKS:-cursor/li-parallel-native-hpc,main}"
LIC_ROOT="${LI_PROOF_EXPLORER_LIC_ROOT:-/workspace/lic}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
GOAL_REL="${LI_PROOF_EXPLORER_GOAL_FILE:-data/goal-directed-sprints/li-parallel-killer-package.md}"

echo "li-parallel-k8s-entrypoint: branch=${PREFERRED_BRANCH} goal=${GOAL_REL}"

export GH_TOKEN GITHUB_TOKEN
echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null || true
gh auth setup-git 2>/dev/null || true
git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
git config --global user.email "${LI_GIT_USER_EMAIL:-li-goal-worker@li-langverse.dev}"
git config --global user.name "${LI_GIT_USER_NAME:-li-goal-worker}"

if [[ -f /config/k8s-goal-loop-common.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-goal-loop-common.sh
  install_goal_loop_scripts "$AGENTS_ROOT"
  export_goal_loop_self_unblock_env "$PREFERRED_BRANCH"
fi

branch_candidates() {
  local seen="" b
  for b in "$PREFERRED_BRANCH" ${FALLBACK_RAW//,/ }; do
    b="${b// /}"
    [[ -z "$b" ]] && continue
    [[ " $seen " == *" $b "* ]] && continue
    seen="$seen $b"
    echo "$b"
  done
}

sync_lic_repo() {
  mkdir -p "$(dirname "$LIC_ROOT")"
  if [[ ! -d "$LIC_ROOT/.git" ]]; then
    echo "li-parallel-k8s-entrypoint: cloning ${ORG}/${REPO_LIC}"
    gh repo clone "${ORG}/${REPO_LIC}" "$LIC_ROOT" || {
      rm -rf "$LIC_ROOT"
      gh repo clone "${ORG}/${REPO_LIC}" "$LIC_ROOT"
    }
  fi
  git -C "$LIC_ROOT" fetch origin --prune
  local branch goal_ok=0
  for branch in $(branch_candidates); do
    if ! git -C "$LIC_ROOT" show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
      continue
    fi
    git -C "$LIC_ROOT" checkout -f -B "$branch" "origin/${branch}"
    git -C "$LIC_ROOT" reset --hard "origin/${branch}"
    if [[ -f "${LIC_ROOT}/${GOAL_REL}" ]]; then
      goal_ok=1
      export LI_PROOF_EXPLORER_BRANCH="$branch"
      export LI_REPO_WORKFLOW_BRANCH="$branch"
      echo "li-parallel-k8s-entrypoint: lic on branch=${branch} $(git -C "$LIC_ROOT" log -1 --oneline)"
      break
    fi
    echo "li-parallel-k8s-entrypoint: branch ${branch} missing goal ${GOAL_REL}, trying next"
  done
  [[ "$goal_ok" == "1" ]] || {
    echo "li-parallel-k8s-entrypoint: no branch contains goal ${GOAL_REL}" >&2
    exit 1
  }
}

ensure_lic_built() {
  # shellcheck source=/dev/null
  source "${LIC_ROOT}/scripts/lib/lic-bin-select.sh"
  if lic_rel="$(li_pick_lic_bin "$LIC_ROOT" 2>/dev/null)"; then
    case "$lic_rel" in
      ./*) export LIC="${LIC_ROOT}/${lic_rel#./}" ;;
      *) export LIC="$lic_rel" ;;
    esac
    echo "li-parallel-k8s-entrypoint: lic present at ${LIC}"
    return 0
  fi
  echo "li-parallel-k8s-entrypoint: building lic (LLVM 22 in-container)"
  if (cd "$LIC_ROOT" && bash scripts/build.sh); then
    if lic_rel="$(li_pick_lic_bin "$LIC_ROOT")"; then
      case "$lic_rel" in
        ./*) export LIC="${LIC_ROOT}/${lic_rel#./}" ;;
        *) export LIC="$lic_rel" ;;
      esac
      echo "li-parallel-k8s-entrypoint: lic build OK ${LIC}"
      return 0
    fi
  fi
  echo "li-parallel-k8s-entrypoint: WARN lic build failed; agent loop may retry" >&2
  return 0
}

sync_lic_repo
ensure_lic_built

export LI_PROOF_EXPLORER_LIC_ROOT="$LIC_ROOT"
export LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT"
export LIC_ROOT="$LIC_ROOT"
export LIC="${LIC:-}"
export LI_PROOF_EXPLORER_GOAL_FILE="$GOAL_REL"
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

echo "li-parallel-k8s-entrypoint: worker exited without completion (rc=${rc})" >&2
exit "$rc"

#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=k8s-git-auth.sh
if [[ -f /config/k8s-git-auth.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-git-auth.sh
else
  source "${LI_CURSOR_AGENTS_ROOT:-/app}/deploy/k8s-git-auth.sh"
fi
li_git_primary_setup || exit 1

AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
WORKSPACE="${LI_GOAL_WORKSPACE:-/workspace}"
BRANCH_LI_OS="${LI_GOAL_BRANCH_LI_OS:-cursor/lios-kernel-m1}"
BRANCH_LIC="${LI_GOAL_BRANCH_LIC:-cursor/lios-kernel-m1}"
BRANCH_LIK="${LI_GOAL_BRANCH_LIK:-cursor/lios-kernel-m1}"
FALLBACK_RAW="${LI_GOAL_BRANCH_FALLBACKS:-cursor/lios-kernel-m1,main}"
GOAL_FILE_REL="${LI_GOAL_FILE:-data/goal-directed-sprints/lios-kernel-m1.md}"
AGENT="${LI_GOAL_AGENT:-code_implementer}"
LOOP_SLEEP="${LI_GOAL_LOOP_SLEEP_SEC:-120}"
LIOS_ROOT="${WORKSPACE}/li-os"
LIC_ROOT="${WORKSPACE}/lic"
LIK_ROOT="${WORKSPACE}/lik"

echo "lios-kernel-entrypoint: workspace=${WORKSPACE} git=${LI_GIT_HOST}/${LI_GIT_GROUP}"

[[ -f /config/k8s-goal-loop-common.sh ]] && source /config/k8s-goal-loop-common.sh

git config --global user.email "${LI_GIT_USER_EMAIL:-lios-kernel-agent@li-langverse.dev}"
git config --global user.name "${LI_GIT_USER_NAME:-lios-kernel-agent}"

branch_candidates() {
  local p="$1" s="" b
  for b in "$p" ${FALLBACK_RAW//,/ }; do
    b="${b// /}"
    [[ -z "$b" ]] && continue
    [[ " $s " == *" $b "* ]] && continue
    s="$s $b"
    echo "$b"
  done
}

sync_repo_with_fallbacks() {
  local repo="$1" dest="$2" pref="$3"
  local -a branches=()
  while IFS= read -r b; do branches+=("$b"); done < <(branch_candidates "$pref")
  li_git_clone_repo_try_branches "$repo" "$dest" "${branches[@]}"
}

ensure_repo_tree() {
  local marker="$1" dest="$2" repo="$3" branch="$4"
  if [[ ! -f "${dest}/${marker}" ]]; then
    echo "lios-kernel-entrypoint: repairing incomplete checkout ${dest} (${marker} missing)" >&2
    rm -rf "$dest"
    sync_repo_with_fallbacks "$repo" "$dest" "$branch"
  fi
  [[ -f "${dest}/${marker}" ]] || {
    echo "lios-kernel-entrypoint: ${dest} still missing ${marker}" >&2
    return 1
  }
}

sync_workspace() {
  sync_repo_with_fallbacks "lik" "$LIK_ROOT" "$BRANCH_LIK"
  sync_repo_with_fallbacks "lic" "$LIC_ROOT" "$BRANCH_LIC"
  sync_repo_with_fallbacks "li-os" "$LIOS_ROOT" "$BRANCH_LI_OS"
  ensure_repo_tree "docs/kernel-abi.md" "$LIK_ROOT" "lik" "$BRANCH_LIK"
  ensure_repo_tree "docs/compiler-kernel-targets.md" "$LIC_ROOT" "lic" "$BRANCH_LIC"
  ensure_repo_tree "scripts/gates/m1-completion-gate.sh" "$LIOS_ROOT" "li-os" "$BRANCH_LI_OS"
  export LIK_ROOT LIC_ROOT LIOS_ROOT
}

seed_loop_state() {
  mkdir -p "${AGENTS_ROOT}/data/goal-directed-sprints" "${AGENTS_ROOT}/data/lios-kernel-loop"
  [[ -f /config/lios-kernel-m1.md ]] && cp -f /config/lios-kernel-m1.md "${AGENTS_ROOT}/data/goal-directed-sprints/"
  [[ ! -f "${AGENTS_ROOT}/data/lios-kernel-loop/iteration-log.md" && -f /config/iteration-log.md ]] \
    && cp -f /config/iteration-log.md "${AGENTS_ROOT}/data/lios-kernel-loop/"
  [[ -f /config/state.json ]] && cp -f /config/state.json "${AGENTS_ROOT}/data/lios-kernel-loop/state.json"
}

resolve_goal_file() {
  [[ -f "${AGENTS_ROOT}/${GOAL_FILE_REL}" ]] && { echo "${AGENTS_ROOT}/${GOAL_FILE_REL}"; return 0; }
  [[ -f /config/lios-kernel-m1.md ]] && { echo /config/lios-kernel-m1.md; return 0; }
  return 1
}

run_goal_loop() {
  install_goal_loop_scripts "$AGENTS_ROOT"
  export_goal_loop_self_unblock_env "$BRANCH_LI_OS"
  export LIK_ROOT LIC_ROOT LIOS_ROOT LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT" LI_GOAL_LOOP_SLEEP_SEC="$LOOP_SLEEP"
  local g
  g="$(resolve_goal_file)"
  export LI_GOAL_FILE="$g" LI_GOAL_PLAN_FILE="${AGENTS_ROOT}/docs/plans/2026-06-lios-kernel-m1.md"
  mkdir -p "$LIOS_ROOT/scripts/gates" 2>/dev/null || true
  "$AGENTS_ROOT/scripts/goal-directed-loop.sh" \
    --agent "$AGENT" --workflow-repo li-os --cwd "$LIOS_ROOT" \
    --goal-file "$g" --max 0 --sleep "$LOOP_SLEEP"
}

sync_workspace
seed_loop_state
test -f "$(resolve_goal_file)" || { echo missing goal >&2; exit 1; }

while true; do
  sync_workspace
  set +e
  run_goal_loop
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    finish_on_goal_complete || true
    exec sleep infinity
  fi
  echo retry $rc
  sleep "$LOOP_SLEEP"
done

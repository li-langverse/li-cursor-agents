#!/usr/bin/env bash
set -euo pipefail
: "${GH_TOKEN:?GH_TOKEN required}"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"
ORG="${LI_GITHUB_ORG:-li-langverse}"
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
echo "lios-kernel-entrypoint: workspace=${WORKSPACE}"
[[ -f /config/k8s-goal-loop-common.sh ]] && source /config/k8s-goal-loop-common.sh
export GH_TOKEN GITHUB_TOKEN
echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null || true
gh auth setup-git 2>/dev/null || true
git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
git config --global user.email "${LI_GIT_USER_EMAIL:-lios-kernel-agent@li-langverse.dev}"
git config --global user.name "${LI_GIT_USER_NAME:-lios-kernel-agent}"
branch_candidates(){ local p="$1" s="" b; for b in "$p" ${FALLBACK_RAW//,/ }; do b="${b// /}"; [[ -z "$b" ]]&&continue; [[ " $s " == *" $b "* ]]&&continue; s="$s $b"; echo "$b"; done; }
clone_or_sync(){ local repo="$1" dest="$2" pref="$3"; mkdir -p "$(dirname "$dest")";
  if [[ ! -d "$dest/.git" ]]; then
    if gh repo view "$repo" >/dev/null 2>&1; then
      for b in $(branch_candidates "$pref"); do gh repo clone "$repo" "$dest" -- --branch "$b" 2>/dev/null && return 0; done
      gh repo clone "$repo" "$dest"; git -C "$dest" checkout -B "$pref" 2>/dev/null || true; return 0
    fi
    mkdir -p "$dest"; git -C "$dest" init -b "$pref"; return 0
  fi
  git -C "$dest" fetch origin --prune 2>/dev/null || true
  local b ok=0; for b in $(branch_candidates "$pref"); do
    if git -C "$dest" show-ref --verify --quiet "refs/remotes/origin/$b"; then
      git -C "$dest" checkout -f -B "$b" "origin/$b"; git -C "$dest" reset --hard "origin/$b"; ok=1; break
    fi
  done; [[ $ok -eq 0 ]] && git -C "$dest" checkout -B "$pref" 2>/dev/null || true; }
sync_workspace(){
  clone_or_sync "${ORG}/lik" "$LIK_ROOT" "$BRANCH_LIK"
  clone_or_sync "${ORG}/lic" "$LIC_ROOT" "$BRANCH_LIC"
  clone_or_sync "${ORG}/li-os" "$LIOS_ROOT" "$BRANCH_LI_OS"
  export LIK_ROOT LIC_ROOT LIOS_ROOT
}
seed_loop_state(){
  mkdir -p "${AGENTS_ROOT}/data/goal-directed-sprints" "${AGENTS_ROOT}/data/lios-kernel-loop"
  [[ -f /config/lios-kernel-m1.md ]] && cp -f /config/lios-kernel-m1.md "${AGENTS_ROOT}/data/goal-directed-sprints/"
  [[ ! -f "${AGENTS_ROOT}/data/lios-kernel-loop/state.json" && -f /config/state.json ]] && cp -f /config/state.json "${AGENTS_ROOT}/data/lios-kernel-loop/"
  [[ ! -f "${AGENTS_ROOT}/data/lios-kernel-loop/iteration-log.md" && -f /config/iteration-log.md ]] && cp -f /config/iteration-log.md "${AGENTS_ROOT}/data/lios-kernel-loop/"
}
resolve_goal_file(){ [[ -f "${AGENTS_ROOT}/${GOAL_FILE_REL}" ]] && { echo "${AGENTS_ROOT}/${GOAL_FILE_REL}"; return 0; }; [[ -f /config/lios-kernel-m1.md ]] && { echo /config/lios-kernel-m1.md; return 0; }; return 1; }
run_goal_loop(){
  install_goal_loop_scripts "$AGENTS_ROOT"; export_goal_loop_self_unblock_env "$BRANCH_LI_OS"
  export LIK_ROOT LIC_ROOT LIOS_ROOT LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT" LI_GOAL_LOOP_SLEEP_SEC="$LOOP_SLEEP"
  local g; g="$(resolve_goal_file)"; export LI_GOAL_FILE="$g" LI_GOAL_PLAN_FILE="${AGENTS_ROOT}/docs/plans/2026-06-lios-kernel-m1.md"
  mkdir -p "$LIOS_ROOT/scripts/gates" 2>/dev/null || true
  "$AGENTS_ROOT/scripts/goal-directed-loop.sh" --agent "$AGENT" --workflow-repo li-os --cwd "$LIOS_ROOT" --goal-file "$g" --max 0 --sleep "$LOOP_SLEEP"; }
sync_workspace; seed_loop_state; test -f "$(resolve_goal_file)" || { echo missing goal >&2; exit 1; }
while true; do sync_workspace; set +e; run_goal_loop; rc=$?; set -e; [[ $rc -eq 0 ]] && finish_on_goal_complete; echo retry $rc; sleep "$LOOP_SLEEP"; done

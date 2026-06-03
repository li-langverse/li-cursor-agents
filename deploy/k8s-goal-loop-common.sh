#!/usr/bin/env bash
# Shared helpers for K8s goal-directed workers (install loop scripts, self-unblock env, idle recheck).
set -euo pipefail

install_goal_loop_scripts() {
  local agents_root="${1:-/app}"
  for script in goal-directed-loop.sh goal-loop-self-unblock.sh; do
    if [[ -f "/config/${script}" ]]; then
      cp "/config/${script}" "${agents_root}/scripts/${script}"
      chmod +x "${agents_root}/scripts/${script}"
      echo "k8s-goal-loop: installed /config/${script} -> ${agents_root}/scripts/${script}"
    fi
  done
}

export_goal_loop_self_unblock_env() {
  local branch="${1:-}"
  export LI_GOAL_SELF_UNBLOCK="${LI_GOAL_SELF_UNBLOCK:-1}"
  export LI_GOAL_SYNC_CWD_AFTER_RUN="${LI_GOAL_SYNC_CWD_AFTER_RUN:-1}"
  export LI_GOAL_GATE_PREFER_CWD="${LI_GOAL_GATE_PREFER_CWD:-0}"
  export LI_GOAL_LOOP_GATE_ONLY="${LI_GOAL_LOOP_GATE_ONLY:-1}"
  export LI_GOAL_STUCK_THRESHOLD="${LI_GOAL_STUCK_THRESHOLD:-5}"
  if [[ -n "$branch" ]]; then
    export LI_REPO_WORKFLOW_BRANCH="${LI_REPO_WORKFLOW_BRANCH:-$branch}"
    export LI_REPO_WORKFLOW_TRACK_REMOTE="${LI_REPO_WORKFLOW_TRACK_REMOTE:-1}"
  fi
}

run_goal_completion_gate() {
  local agents_root="$1"
  local goal_file="$2"
  local gate_cwd="$3"
  [[ -f "$goal_file" ]] || return 1
  node "${agents_root}/dist/cli/goal-completion-gate.js" --goal-file "$goal_file" --cwd "$gate_cwd"
}

idle_until_goal_gate_fails() {
  local agents_root="$1"
  local goal_file="$2"
  local gate_cwd="$3"
  local recheck_sec="${4:-300}"
  local sync_fn="${5:-}"

  echo "k8s-goal-loop: GOAL COMPLETE — idle recheck every ${recheck_sec}s"
  while true; do
    sleep "$recheck_sec"
    if [[ -n "$sync_fn" ]]; then
      # shellcheck disable=SC1090
      source /dev/null
      "$sync_fn" || {
        echo "k8s-goal-loop: sync failed during idle recheck (retrying)" >&2
        continue
      }
    fi
    if ! run_goal_completion_gate "$agents_root" "$goal_file" "$gate_cwd"; then
      echo "k8s-goal-loop: completion gate no longer passes — resuming sprint"
      return 0
    fi
    echo "k8s-goal-loop: still complete after recheck"
  done
}

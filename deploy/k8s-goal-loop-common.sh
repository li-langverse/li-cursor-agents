#!/usr/bin/env bash
# Shared helpers for K8s goal-directed workers (install loop scripts, self-unblock env, stop on complete).
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
  export LI_GOAL_GATE_PREFER_CWD="${LI_GOAL_GATE_PREFER_CWD:-1}"
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

# Stop all agent work when the sprint is done: scale Deployment to 0 (preferred) or sleep forever.
finish_on_goal_complete() {
  local deploy="${LI_GOAL_DEPLOYMENT_NAME:-}"
  local ns="${LI_GOAL_NAMESPACE:-li-swarm}"

  echo "k8s-goal-loop: GOAL COMPLETE — stopping worker (no further agent runs)"

  if [[ "${LI_GOAL_SCALE_DOWN_ON_COMPLETE:-1}" == "1" && -n "$deploy" ]]; then
    local token="/var/run/secrets/kubernetes.io/serviceaccount/token"
    local ca="/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
    if [[ -f "$token" && -n "${KUBERNETES_SERVICE_HOST:-}" && -n "${KUBERNETES_SERVICE_PORT:-}" ]]; then
      local api="https://${KUBERNETES_SERVICE_HOST}:${KUBERNETES_SERVICE_PORT}"
      if curl -sf --connect-timeout 5 --cacert "$ca" \
        -H "Authorization: Bearer $(tr -d '\n' <"$token")" \
        -H "Content-Type: application/strategic-merge-patch+json" \
        -X PATCH "${api}/apis/apps/v1/namespaces/${ns}/deployments/${deploy}/scale" \
        -d '{"spec":{"replicas":0}}' >/dev/null; then
        echo "k8s-goal-loop: scaled deployment/${deploy} to 0 in ${ns}"
        sleep 10
        exit 0
      fi
      echo "k8s-goal-loop: scale-down API call failed (check RBAC)" >&2
    fi
  fi

  echo "k8s-goal-loop: sleeping forever — no agent loops (scale deploy to 0 manually to free the pod)"
  exec sleep infinity
}

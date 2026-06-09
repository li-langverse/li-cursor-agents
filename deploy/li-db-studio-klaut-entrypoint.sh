#!/usr/bin/env bash
# K8s entrypoint: cap-jmk-launchpad homelab track (klaut-supabase + klaut-pro docs).
set -euo pipefail

if [[ -f /config/k8s-git-auth.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-git-auth.sh
else
  # shellcheck source=k8s-git-auth.sh
  source "${LI_CURSOR_AGENTS_ROOT:-/app}/deploy/k8s-git-auth.sh"
fi
li_git_primary_setup || exit 1

ORG="${LI_GIT_GROUP:-cap-jmk-launchpad}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
WORKSPACE="${LI_GOAL_WORKSPACE:-/workspace}"
BRANCH="${LI_GOAL_BRANCH:-cursor/li-db-studio-homelab-p0}"
GOAL_FILE_REL="${LI_GOAL_FILE:-data/goal-directed-sprints/wp-klaut-homelab.md}"
AGENT="${LI_GOAL_AGENT:-code_implementer}"
LOOP_SLEEP="${LI_GOAL_LOOP_SLEEP_SEC:-120}"

SUPABASE_ROOT="${WORKSPACE}/klaut-supabase"

echo "li-db-studio-klaut-entrypoint: org=${ORG} workspace=${WORKSPACE}"

if [[ -f /config/k8s-goal-loop-common.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-goal-loop-common.sh
fi

git config --global user.email "${LI_GIT_USER_EMAIL:-li-db-studio-klaut@klaut.pro}"
git config --global user.name "${LI_GIT_USER_NAME:-li-db-studio-klaut-agent}"

clone_or_sync() {
  local repo="$1" dest="$2" branch="$3"
  mkdir -p "$(dirname "$dest")"
  if [[ ! -d "$dest/.git" ]]; then
    echo "li-db-studio-klaut-entrypoint: clone ${ORG}/${repo}"
    li_git_clone_repo "$repo" "$dest" "$branch"
    return 0
  fi
  git -C "$dest" fetch origin --prune
  if git -C "$dest" show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
    git -C "$dest" checkout -f -B "$branch" "origin/${branch}"
    git -C "$dest" reset --hard "origin/${branch}"
  else
    git -C "$dest" checkout -B "$branch"
  fi
}

seed_goal() {
  mkdir -p "${AGENTS_ROOT}/data/goal-directed-sprints"
  if [[ -f /config/wp-klaut-homelab.md ]]; then
    cp -f /config/wp-klaut-homelab.md "${AGENTS_ROOT}/data/goal-directed-sprints/"
  fi
}

resolve_goal_file() {
  if [[ -f "${AGENTS_ROOT}/${GOAL_FILE_REL}" ]]; then
    echo "${AGENTS_ROOT}/${GOAL_FILE_REL}"
    return 0
  fi
  if [[ -f /config/wp-klaut-homelab.md ]]; then
    echo "/config/wp-klaut-homelab.md"
    return 0
  fi
  return 1
}

run_goal_loop() {
  install_goal_loop_scripts "$AGENTS_ROOT"
  export_goal_loop_self_unblock_env "$BRANCH"
  export LI_GOAL_WORKSPACE="$WORKSPACE"
  local goal_path
  goal_path="$(resolve_goal_file)"
  export LI_GOAL_FILE="$goal_path"
  "$AGENTS_ROOT/scripts/goal-directed-loop.sh" \
    --agent "$AGENT" \
    --workflow-repo klaut-supabase \
    --cwd "$SUPABASE_ROOT" \
    --goal-file "$goal_path" \
    --max 0 \
    --sleep "$LOOP_SLEEP"
}

sync_workspace() {
  clone_or_sync "klaut-supabase" "$SUPABASE_ROOT" "$BRANCH"
}

seed_goal
test -f "$(resolve_goal_file)" || { echo "missing goal file" >&2; exit 1; }

while true; do
  sync_workspace
  set +e
  run_goal_loop
  rc=$?
  set -e
  if [[ "$rc" -eq 0 ]]; then
    finish_on_goal_complete
  fi
  echo "li-db-studio-klaut-entrypoint: retry in ${LOOP_SLEEP}s (exit $rc)" >&2
  sleep "$LOOP_SLEEP"
done

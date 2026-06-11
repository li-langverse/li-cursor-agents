#!/usr/bin/env bash
# K8s entrypoint: klaut.pro warm index ingest (klaut-pro GitHub org).
set -euo pipefail

# shellcheck source=../k8s-git-auth.sh
source "${LI_CURSOR_AGENTS_ROOT:-/app}/deploy/k8s-git-auth.sh"
li_git_github_primary_setup || exit 1

ORG="${LI_GIT_GROUP:-klaut-pro}"
LIDB_ORG="${LI_LIDB_ORG:-li-langverse}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
WORKSPACE="${LI_GOAL_WORKSPACE:-/workspace}"
BRANCH="${LI_GOAL_BRANCH:-cursor/klaut-research-r1b}"
GOAL_FILE_REL="${LI_GOAL_FILE:-data/goal-directed-sprints/wp-klaut-research-r1b-warm-ingest.md}"
AGENT="${LI_GOAL_AGENT:-code_implementer}"
LOOP_SLEEP="${LI_GOAL_LOOP_SLEEP_SEC:-300}"

INGEST_REPO="${KLAUT_RESEARCH_INGEST_REPO:-klaut-research-ingest}"
LIDB_REPO="${LI_LIDB_REPO:-lidb}"
INGEST_ROOT="${WORKSPACE}/${INGEST_REPO}"
LIDB_ROOT="${WORKSPACE}/${LIDB_REPO}"

echo "klaut-research-ingest-entrypoint: org=${ORG}"

if [[ -f /config/k8s-goal-loop-common.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-goal-loop-common.sh
fi

git config --global user.email "${LI_GIT_USER_EMAIL:-klaut-research-ingest@klaut.pro}"
git config --global user.name "${LI_GIT_USER_NAME:-klaut-research-ingest-agent}"

repo_exists() {
  local org="$1" repo="$2"
  local prev_group="$LI_GIT_GROUP"
  LI_GIT_GROUP="$org"
  git ls-remote "$(li_git_remote_url "$repo")" HEAD >/dev/null 2>&1
  local rc=$?
  LI_GIT_GROUP="$prev_group"
  return $rc
}

clone_or_sync() {
  local org="$1" repo="$2" dest="$3" branch="$4"
  mkdir -p "$(dirname "$dest")"
  if [[ ! -d "$dest/.git" ]]; then
    if ! repo_exists "$org" "$repo"; then
      echo "klaut-research-ingest-entrypoint: repo ${org}/${repo} missing on GitHub" >&2
      return 1
    fi
    local prev_group="$LI_GIT_GROUP"
    LI_GIT_GROUP="$org"
    li_git_clone_repo "$repo" "$dest" "$branch"
    LI_GIT_GROUP="$prev_group"
    return 0
  fi
  local prev_group="$LI_GIT_GROUP"
  LI_GIT_GROUP="$org"
  li_git_ensure_remotes "$dest" "$repo"
  li_git_sync_repo "$repo" "$dest" "$branch"
  LI_GIT_GROUP="$prev_group"
}

seed_goal() {
  mkdir -p "${AGENTS_ROOT}/data/goal-directed-sprints"
  if [[ -f /config/wp-klaut-research-r1b-warm-ingest.md ]]; then
    cp -f /config/wp-klaut-research-r1b-warm-ingest.md "${AGENTS_ROOT}/data/goal-directed-sprints/"
  fi
}

resolve_goal_file() {
  if [[ -f "${AGENTS_ROOT}/${GOAL_FILE_REL}" ]]; then
    echo "${AGENTS_ROOT}/${GOAL_FILE_REL}"
    return 0
  fi
  if [[ -f /config/wp-klaut-research-r1b-warm-ingest.md ]]; then
    echo "/config/wp-klaut-research-r1b-warm-ingest.md"
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
    --workflow-repo "$INGEST_REPO" \
    --cwd "$INGEST_ROOT" \
    --goal-file "$goal_path" \
    --max 0 \
    --sleep "$LOOP_SLEEP"
}

sync_workspace() {
  clone_or_sync "$ORG" "$INGEST_REPO" "$INGEST_ROOT" "$BRANCH" || true
  clone_or_sync "$LIDB_ORG" "$LIDB_REPO" "$LIDB_ROOT" "$BRANCH" || true
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
  echo "klaut-research-ingest-entrypoint: retry in ${LOOP_SLEEP}s (exit $rc)" >&2
  sleep "$LOOP_SLEEP"
done

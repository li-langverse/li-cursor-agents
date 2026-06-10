#!/usr/bin/env bash
# K8s entrypoint: li-langverse product track (TTS, api-kit, studio, lidb schema).
set -euo pipefail

if [[ -f /git-auth/k8s-git-auth.sh ]]; then
  # shellcheck source=/dev/null
  source /git-auth/k8s-git-auth.sh
elif [[ -f /config/k8s-git-auth.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-git-auth.sh
else
  # shellcheck source=k8s-git-auth.sh
  source "${LI_CURSOR_AGENTS_ROOT:-/app}/deploy/k8s-git-auth.sh"
fi
li_git_primary_setup || exit 1

ORG="${LI_GIT_GROUP:-li-langverse}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
WORKSPACE="${LI_GOAL_WORKSPACE:-/workspace}"
BRANCH_PRODUCT="${LI_GOAL_BRANCH_PRODUCT:-cursor/li-db-studio-product-p0}"
BRANCH_SCHEMA="${LI_GOAL_BRANCH_SCHEMA:-cursor/li-db-studio-schema-p0}"
GOAL_FILE_REL="${LI_GOAL_FILE:-data/goal-directed-sprints/wp-li-product.md}"
AGENT="${LI_GOAL_AGENT:-code_implementer}"
LOOP_SLEEP="${LI_GOAL_LOOP_SLEEP_SEC:-120}"

TTS_ROOT="${WORKSPACE}/token-telemetry-service"
KIT_ROOT="${WORKSPACE}/li-api-kit"
STUDIO_ROOT="${WORKSPACE}/li-db-studio"
LIDB_ROOT="${WORKSPACE}/lidb"

echo "li-db-studio-product-entrypoint: org=${ORG}"

if [[ -f /config/k8s-goal-loop-common.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-goal-loop-common.sh
fi

git config --global user.email "${LI_GIT_USER_EMAIL:-li-db-studio-product@li-langverse.dev}"
git config --global user.name "${LI_GIT_USER_NAME:-li-db-studio-product-agent}"

repo_exists() {
  local repo="$1"
  git ls-remote "$(li_git_remote_url "$repo")" HEAD >/dev/null 2>&1
}

clone_or_sync() {
  local repo="$1" dest="$2" branch="$3"
  mkdir -p "$(dirname "$dest")"
  if [[ ! -d "$dest/.git" ]]; then
    if ! repo_exists "$repo"; then
      echo "li-db-studio-product-entrypoint: repo ${ORG}/${repo} missing — agent must create in phase p0-repos" >&2
      return 1
    fi
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

ensure_repos() {
  for name in token-telemetry-service li-api-kit li-db-studio; do
    if ! repo_exists "$name"; then
      echo "li-db-studio-product-entrypoint: WARN ${ORG}/${name} not on GitLab yet — create via GitLab UI" >&2
    fi
  done
}

seed_goal() {
  mkdir -p "${AGENTS_ROOT}/data/goal-directed-sprints"
  if [[ -f /config/wp-li-product.md ]]; then
    cp -f /config/wp-li-product.md "${AGENTS_ROOT}/data/goal-directed-sprints/"
  fi
}

resolve_goal_file() {
  if [[ -f "${AGENTS_ROOT}/${GOAL_FILE_REL}" ]]; then
    echo "${AGENTS_ROOT}/${GOAL_FILE_REL}"
    return 0
  fi
  if [[ -f /config/wp-li-product.md ]]; then
    echo "/config/wp-li-product.md"
    return 0
  fi
  return 1
}

run_goal_loop() {
  install_goal_loop_scripts "$AGENTS_ROOT"
  export_goal_loop_self_unblock_env "$BRANCH_PRODUCT"
  export LI_GOAL_WORKSPACE="$WORKSPACE"
  local goal_path
  goal_path="$(resolve_goal_file)"
  export LI_GOAL_FILE="$goal_path"
  "$AGENTS_ROOT/scripts/goal-directed-loop.sh" \
    --agent "$AGENT" \
    --workflow-repo token-telemetry-service \
    --cwd "$TTS_ROOT" \
    --goal-file "$goal_path" \
    --max 0 \
    --sleep "$LOOP_SLEEP"
}

sync_workspace() {
  ensure_repos
  clone_or_sync "lidb" "$LIDB_ROOT" "$BRANCH_SCHEMA" || true
  clone_or_sync "token-telemetry-service" "$TTS_ROOT" "$BRANCH_PRODUCT" || true
  clone_or_sync "li-api-kit" "$KIT_ROOT" "$BRANCH_PRODUCT" || true
  clone_or_sync "li-db-studio" "$STUDIO_ROOT" "$BRANCH_PRODUCT" || true
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
  echo "li-db-studio-product-entrypoint: retry in ${LOOP_SLEEP}s (exit $rc)" >&2
  sleep "$LOOP_SLEEP"
done

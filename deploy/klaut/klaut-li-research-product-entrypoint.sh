#!/usr/bin/env bash
# K8s entrypoint: klaut.pro research product track (klaut-pro GitHub org).
set -euo pipefail

# shellcheck source=../k8s-git-auth.sh
source "${LI_CURSOR_AGENTS_ROOT:-/app}/deploy/k8s-git-auth.sh"
li_git_github_primary_setup || exit 1

ORG="${LI_GIT_GROUP:-klaut-pro}"
LIDB_ORG="${LI_LIDB_ORG:-li-langverse}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
WORKSPACE="${LI_GOAL_WORKSPACE:-/workspace}"
BRANCH="${LI_GOAL_BRANCH:-cursor/klaut-research-r1b}"
BRANCH_SCHEMA="${LI_GOAL_BRANCH_SCHEMA:-cursor/klaut-research-r1b}"
GOAL_FILE_REL="${LI_GOAL_FILE:-data/goal-directed-sprints/wp-klaut-li-research-r1b-product.md}"
AGENT="${LI_GOAL_AGENT:-code_implementer}"
LOOP_SLEEP="${LI_GOAL_LOOP_SLEEP_SEC:-120}"

GATEWAY_REPO="${KLAUT_RESEARCH_GATEWAY_REPO:-klaut-research-gateway}"
MCP_REPO="${KLAUT_RESEARCH_MCP_REPO:-klaut-research-mcp}"
INGEST_REPO="${KLAUT_RESEARCH_INGEST_REPO:-klaut-research-ingest}"
KIT_REPO="${KLAUT_API_KIT_REPO:-klaut-api-kit}"
TTS_REPO="${KLAUT_TOKEN_TELEMETRY_REPO:-klaut-token-telemetry}"
LIDB_REPO="${LI_LIDB_REPO:-lidb}"

GATEWAY_ROOT="${WORKSPACE}/${GATEWAY_REPO}"
LIDB_ROOT="${WORKSPACE}/lidb"
KIT_ROOT="${WORKSPACE}/${KIT_REPO}"

echo "klaut-li-research-product-entrypoint: org=${ORG}"

if [[ -f /config/k8s-goal-loop-common.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-goal-loop-common.sh
fi

git config --global user.email "${LI_GIT_USER_EMAIL:-klaut-research-product@klaut.pro}"
git config --global user.name "${LI_GIT_USER_NAME:-klaut-research-product-agent}"

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
      echo "klaut-li-research-product-entrypoint: repo ${org}/${repo} missing on GitHub" >&2
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

ensure_repos() {
  for name in "$GATEWAY_REPO" "$MCP_REPO" "$INGEST_REPO"; do
    if ! repo_exists "$ORG" "$name"; then
      echo "klaut-li-research-product-entrypoint: WARN ${ORG}/${name} not on GitHub yet" >&2
    fi
  done
}

seed_goal() {
  mkdir -p "${AGENTS_ROOT}/data/goal-directed-sprints"
  if [[ -f /config/wp-klaut-li-research-r1b-product.md ]]; then
    cp -f /config/wp-klaut-li-research-r1b-product.md "${AGENTS_ROOT}/data/goal-directed-sprints/"
  fi
}

resolve_goal_file() {
  if [[ -f "${AGENTS_ROOT}/${GOAL_FILE_REL}" ]]; then
    echo "${AGENTS_ROOT}/${GOAL_FILE_REL}"
    return 0
  fi
  if [[ -f /config/wp-klaut-li-research-r1b-product.md ]]; then
    echo "/config/wp-klaut-li-research-r1b-product.md"
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
    --workflow-repo "$GATEWAY_REPO" \
    --cwd "$GATEWAY_ROOT" \
    --goal-file "$goal_path" \
    --max 0 \
    --sleep "$LOOP_SLEEP"
}

sync_workspace() {
  ensure_repos
  clone_or_sync "$LIDB_ORG" "$LIDB_REPO" "$LIDB_ROOT" "$BRANCH_SCHEMA" || true
  clone_or_sync "$ORG" "$GATEWAY_REPO" "$GATEWAY_ROOT" "$BRANCH" || true
  clone_or_sync "$ORG" "$MCP_REPO" "${WORKSPACE}/${MCP_REPO}" "$BRANCH" || true
  clone_or_sync "$ORG" "$INGEST_REPO" "${WORKSPACE}/${INGEST_REPO}" "$BRANCH" || true
  clone_or_sync "$ORG" "$KIT_REPO" "$KIT_ROOT" "$BRANCH" || true
  clone_or_sync "$ORG" "$TTS_REPO" "${WORKSPACE}/${TTS_REPO}" "$BRANCH" || true
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
  echo "klaut-li-research-product-entrypoint: retry in ${LOOP_SLEEP}s (exit $rc)" >&2
  sleep "$LOOP_SLEEP"
done

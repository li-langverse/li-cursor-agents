#!/usr/bin/env bash
# K8s entrypoint: sync workspace repos + resilient goal-directed-loop for li-toml config migration.
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
BRANCH_HTTPD="${LI_GOAL_BRANCH_HTTPD:-cursor/li-toml-config-migration}"
BRANCH_BENCH="${LI_GOAL_BRANCH_BENCHMARKS:-feat/li-toml-config-pipeline}"
BRANCH_TOML="${LI_GOAL_BRANCH_LI_TOML:-cursor/li-toml-config-migration}"
GOAL_FILE_REL="${LI_GOAL_FILE:-data/goal-directed-sprints/li-toml-config-migration.md}"
AGENT="${LI_GOAL_AGENT:-code_implementer}"
LOOP_SLEEP="${LI_GOAL_LOOP_SLEEP_SEC:-120}"

HTTPD_ROOT="${WORKSPACE}/li-httpd"
BENCH_ROOT="${WORKSPACE}/benchmarks"
LIC_ROOT="${WORKSPACE}/lic"
TOML_ROOT="${WORKSPACE}/li-toml"

echo "li-toml-config-entrypoint: workspace=${WORKSPACE} branch_httpd=${BRANCH_HTTPD}"

if [[ -f /config/k8s-goal-loop-common.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-goal-loop-common.sh
fi

git config --global user.email "${LI_GIT_USER_EMAIL:-li-toml-agent@li-langverse.dev}"
git config --global user.name "${LI_GIT_USER_NAME:-li-toml-config-agent}"

repo_exists() {
  local repo="$1"
  git ls-remote "$(li_git_remote_url "$repo")" HEAD >/dev/null 2>&1
}

clone_or_sync() {
  local repo="$1" dest="$2" branch="$3"
  li_git_clone_repo "$repo" "$dest" "$branch"
}

sync_workspace() {
  clone_or_sync "lic" "$LIC_ROOT" "main"
  clone_or_sync "li-httpd" "$HTTPD_ROOT" "$BRANCH_HTTPD"
  clone_or_sync "benchmarks" "$BENCH_ROOT" "$BRANCH_BENCH"
  if repo_exists "li-toml"; then
    clone_or_sync "li-toml" "$TOML_ROOT" "$BRANCH_TOML"
  fi
}

seed_loop_state() {
  mkdir -p "${AGENTS_ROOT}/data/goal-directed-sprints" "${AGENTS_ROOT}/data/li-toml-config-loop"
  if [[ -f /config/li-toml-config-migration.md ]]; then
    cp -f /config/li-toml-config-migration.md "${AGENTS_ROOT}/data/goal-directed-sprints/"
  fi
  if [[ ! -f "${AGENTS_ROOT}/data/li-toml-config-loop/state.json" && -f /config/state.json ]]; then
    cp -f /config/state.json "${AGENTS_ROOT}/data/li-toml-config-loop/"
  fi
  if [[ ! -f "${AGENTS_ROOT}/data/li-toml-config-loop/iteration-log.md" && -f /config/iteration-log.md ]]; then
    cp -f /config/iteration-log.md "${AGENTS_ROOT}/data/li-toml-config-loop/"
  fi
}

resolve_goal_file() {
  if [[ -f "${AGENTS_ROOT}/${GOAL_FILE_REL}" ]]; then
    echo "${AGENTS_ROOT}/${GOAL_FILE_REL}"
    return 0
  fi
  if [[ -f "/config/li-toml-config-migration.md" ]]; then
    echo "/config/li-toml-config-migration.md"
    return 0
  fi
  return 1
}

run_goal_loop() {
  install_goal_loop_scripts "$AGENTS_ROOT"
  export_goal_loop_self_unblock_env "$BRANCH_HTTPD"
  export LIC_ROOT="$LIC_ROOT"
  export BENCHMARKS_ROOT="$BENCH_ROOT"
  export LI_TOML_ROOT="$TOML_ROOT"
  export LI_CURSOR_AGENTS_ROOT="$AGENTS_ROOT"
  export LI_GOAL_LOOP_SLEEP_SEC="$LOOP_SLEEP"
  local goal_path
  goal_path="$(resolve_goal_file)"
  export LI_GOAL_FILE="$goal_path"
  "$AGENTS_ROOT/scripts/goal-directed-loop.sh" \
    --agent "$AGENT" \
    --workflow-repo li-httpd \
    --cwd "$HTTPD_ROOT" \
    --benchmarks "$BENCH_ROOT" \
    --goal-file "$goal_path" \
    --max 0 \
    --sleep "$LOOP_SLEEP"
}

sync_workspace
seed_loop_state
goal_path="$(resolve_goal_file)" || true
if [[ -z "${goal_path:-}" || ! -f "$goal_path" ]]; then
  echo "li-toml-config-entrypoint: missing goal file" >&2
  exit 1
fi

GOAL_PATH="$(resolve_goal_file)"

while true; do
  sync_workspace

  set +e
  run_goal_loop
  rc=$?
  set -e

  if [[ "$rc" -eq 0 ]]; then
    finish_on_goal_complete
  fi

  echo "li-toml-config-entrypoint: loop stopped without completion (exit $rc) â€” retry in ${LOOP_SLEEP}s" >&2
  sleep "$LOOP_SLEEP"
done

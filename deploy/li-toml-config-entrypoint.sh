#!/usr/bin/env bash
# K8s entrypoint: sync workspace repos + resilient goal-directed-loop for li-toml config migration.
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN required}"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$GH_TOKEN}"

ORG="${LI_GITHUB_ORG:-li-langverse}"
AGENTS_ROOT="${LI_CURSOR_AGENTS_ROOT:-/app}"
WORKSPACE="${LI_GOAL_WORKSPACE:-/workspace}"
BRANCH_HTTPD="${LI_GOAL_BRANCH_HTTPD:-cursor/li-toml-config-migration}"
BRANCH_BENCH="${LI_GOAL_BRANCH_BENCHMARKS:-feat/li-toml-config-pipeline}"
BRANCH_TOML="${LI_GOAL_BRANCH_LI_TOML:-cursor/li-toml-config-migration}"
GOAL_FILE_REL="${LI_GOAL_FILE:-data/goal-directed-sprints/li-toml-config-migration.md}"
AGENT="${LI_GOAL_AGENT:-code_implementer}"
LOOP_SLEEP="${LI_GOAL_LOOP_SLEEP_SEC:-120}"
IDLE_RECHECK_SEC="${LI_GOAL_IDLE_RECHECK_SEC:-300}"

HTTPD_ROOT="${WORKSPACE}/li-httpd"
BENCH_ROOT="${WORKSPACE}/benchmarks"
LIC_ROOT="${WORKSPACE}/lic"
TOML_ROOT="${WORKSPACE}/li-toml"

echo "li-toml-config-entrypoint: workspace=${WORKSPACE} branch_httpd=${BRANCH_HTTPD}"

export GH_TOKEN GITHUB_TOKEN
echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null || true
gh auth setup-git 2>/dev/null || true
git config --global url."https://x-access-token:${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
git config --global user.email "${LI_GIT_USER_EMAIL:-li-toml-agent@li-langverse.dev}"
git config --global user.name "${LI_GIT_USER_NAME:-li-toml-config-agent}"

if [[ -f /config/k8s-goal-loop-common.sh ]]; then
  # shellcheck source=/dev/null
  source /config/k8s-goal-loop-common.sh
fi

clone_or_sync() {
  local org_repo="$1" dest="$2" branch="$3"
  mkdir -p "$(dirname "$dest")"
  if [[ ! -d "$dest/.git" ]]; then
    echo "li-toml-config-entrypoint: clone ${org_repo} -> ${dest} (${branch})"
    gh repo clone "${org_repo}" "$dest" -- --branch "$branch" 2>/dev/null || {
      gh repo clone "${org_repo}" "$dest"
      git -C "$dest" checkout -B "$branch"
    }
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

sync_workspace() {
  clone_or_sync "${ORG}/lic" "$LIC_ROOT" "main"
  clone_or_sync "${ORG}/li-httpd" "$HTTPD_ROOT" "$BRANCH_HTTPD"
  clone_or_sync "${ORG}/benchmarks" "$BENCH_ROOT" "$BRANCH_BENCH"
  if gh repo view "${ORG}/li-toml" >/dev/null 2>&1; then
    clone_or_sync "${ORG}/li-toml" "$TOML_ROOT" "$BRANCH_TOML"
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
test -f "$(resolve_goal_file)" || {
  echo "li-toml-config-entrypoint: missing goal file" >&2
  exit 1
}

GOAL_PATH="$(resolve_goal_file)"

while true; do
  sync_workspace

  set +e
  run_goal_loop
  rc=$?
  set -e

  if [[ "$rc" -eq 0 ]]; then
    echo "li-toml-config-entrypoint: GOAL COMPLETE — idle recheck every ${IDLE_RECHECK_SEC}s"
    while true; do
      sleep "$IDLE_RECHECK_SEC"
      sync_workspace || {
        echo "li-toml-config-entrypoint: sync failed during idle recheck (retrying)" >&2
        continue
      }
      if ! run_goal_completion_gate "$AGENTS_ROOT" "$GOAL_PATH" "$HTTPD_ROOT"; then
        echo "li-toml-config-entrypoint: completion gate no longer passes — resuming sprint"
        break
      fi
      echo "li-toml-config-entrypoint: still complete after recheck"
    done
    continue
  fi

  echo "li-toml-config-entrypoint: loop stopped without completion (exit $rc) — retry in ${LOOP_SLEEP}s" >&2
  sleep "$LOOP_SLEEP"
done
